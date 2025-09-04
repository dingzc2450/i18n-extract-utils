import type { NodePath } from "@babel/traverse";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import type { GeneratorOptions } from "@babel/generator";
import generate from "@babel/generator";
import type { ExtractedString, UsedExistingKey, ChangeDetail } from "./types";
import { getKeyAndRecord } from "./key-manager";
import {
  createTranslationCall,
  attachExtractedCommentToNode,
} from "./core/ast-utils";
import type { NormalizedTransformOptions } from "./core/config-normalizer";
import { getI18nCall } from "./core/config-normalizer";
import * as tg from "./babel-type-guards";
import type { ContextInfo } from "./context-detector";
import { detectCodeContext } from "./context-detector";
import type { SmartImportManager, ImportInfo } from "./smart-import-manager";

// 性能优化工具
import {
  CodePositionCalculator,
  PerformanceMonitor,
  RegexCache,
  type LocationInfo,
} from "./performance";
// 新的纯函数模块
import {
  matchPattern,
  buildLocationInfo,
  buildTemplateLiteral,
  buildInterpolationObject,
  buildPartialReplacement,
  generateJSXElementsCode,
  extractTemplateRawString,
  buildTemplateTextFromNode,
} from "./core/ast-pure-functions";
import { NodeProcessorFactory } from "./core/node-processors";
import { processNestedExpressionsInTemplate } from "./core/nested-expression-handler";
import type { SharedProcessingContext } from "./core/shared-context";
type PendingReplacementType = {
  originalNode: t.Node;
  replacementNode: t.Node | t.Node[];
  originalText?: string;
  isTopLevel: boolean;
};
/**
 * 上下文感知的AST替换器
 * 根据代码上下文智能选择处理策略
 * 优化版本：集成性能监控和批量处理
 */
export function collectContextAwareReplacementInfo(
  ast: t.File,
  originalCode: string,
  existingValueToKey: Map<string, string | number>,
  extractedStrings: ExtractedString[],
  usedExistingKeysList: UsedExistingKey[],
  importManager: SmartImportManager,
  options: NormalizedTransformOptions,
  filePath: string
): {
  modified: boolean;
  changes: ChangeDetail[];
  requiredImports: Set<string>;
} {
  // 性能监控
  const monitor = new PerformanceMonitor();
  monitor.startTiming("total-processing");

  let modified = false;
  const changes: ChangeDetail[] = [];
  const generatedKeysMap = new Map<string, string | number>();
  const requiredImports = new Set<string>();
  const contextCache = new Map<NodePath<t.Node>, ContextInfo>();

  // 创建高性能代码位置计算器
  monitor.startTiming("position-calculator-init");
  const positionCalculator = new CodePositionCalculator(originalCode);
  monitor.endTiming("position-calculator-init");

  // 存储所有待替换的节点信息
  const pendingReplacements = new Map<
    NodePath<t.Node>,
    PendingReplacementType
  >();

  // 使用缓存的正则表达式，避免重复编译
  monitor.startTiming("regex-compilation");
  const patternRegex = RegexCache.getGlobalRegex(options.pattern);
  monitor.endTiming("regex-compilation");

  // 智能调用工厂函数，根据是否有自定义 i18nCall 来决定参数
  const smartCallFactory = (
    callName: string,
    key: string | number,
    rawText: string,
    interpolations?: t.ObjectExpression,
    originalText?: string
  ) => {
    // 首先尝试从规范化配置获取i18nCall
    const customI18nCall = getI18nCall(options);
    if (customI18nCall) {
      // 使用自定义的 i18nCall，传递合适的原始文本
      // 对于有插值的情况，使用 originalText 并替换实际表达式为 ${...}
      let textForCustomCall = originalText || rawText;
      if (originalText && originalText.includes("${")) {
        // 将具体的变量表达式替换为 ${...} 占位符
        textForCustomCall = originalText.replace(/\$\{[^}]+\}/g, "${...}");
      }
      // 直接调用自定义i18nCall，不使用任何封装
      return customI18nCall(callName, key, textForCustomCall);
    } else {
      // 使用默认的 createTranslationCall，支持 interpolations
      return createTranslationCall(callName, key, interpolations);
    }
  };

  // 记录待替换节点，但先不立即添加到 changes
  const recordPendingReplacement = (
    path: NodePath<t.Node>,
    originalNode: t.Node,
    replacementNode: t.Node | t.Node[],
    originalText?: string
  ) => {
    pendingReplacements.set(path, {
      originalNode,
      replacementNode,
      originalText,
      isTopLevel: true, // 先假设是顶级，后面会调整
    });
  };

  const buildTemplateLiteralFn = (
    parts: string[],
    expressions: t.Expression[]
  ): t.TemplateLiteral => {
    return buildTemplateLiteral(parts, expressions);
  };

  // 优化的上下文检测函数 - 使用缓存
  const getContextInfo = (path: NodePath<t.Node>): ContextInfo => {
    if (contextCache.has(path)) {
      monitor.recordCacheHit("context-detection");
      return contextCache.get(path)!;
    }

    monitor.recordCacheMiss("context-detection");
    const context = detectCodeContext(path);
    contextCache.set(path, context);
    return context;
  };

  const getImportInfoForContext = (context: ContextInfo): ImportInfo => {
    const importInfo = importManager.getImportInfo(context);
    // 序列化导入信息以便后续处理
    requiredImports.add(importManager.stringifyImport(importInfo));
    return importInfo;
  };

  // 创建共享处理上下文
  const sharedContext: SharedProcessingContext = {
    patternRegex,
    options,
    filePath,
    existingValueToKey,
    generatedKeysMap,
    extractedStrings,
    usedExistingKeysList,
    getContextInfo,
    getImportInfoForContext,
    smartCallFactory,
    recordPendingReplacement,
    buildTemplateLiteral: buildTemplateLiteralFn,
  };

  /**
   * 通用节点处理函数（优化版本）
   * 使用新的纯函数和节点处理器
   */
  function processNodeWithPattern<T extends t.Node>(path: NodePath<T>): void {
    // 获取节点处理器
    const processor = NodeProcessorFactory.getProcessorForNode(path.node);
    if (!processor) return;

    // 检测代码上下文
    const context = sharedContext.getContextInfo(path);
    const importInfo = sharedContext.getImportInfoForContext(context);
    const effectiveMethodName = importInfo.callName;

    // 跳过逻辑检查
    if (processor.shouldSkip(path, effectiveMethodName)) {
      return;
    }

    // 提取节点值
    const nodeValue = processor.extractValue(path.node);
    const location = buildLocationInfo(
      { filePath: sharedContext.filePath },
      path.node
    );

    // 模式匹配（使用纯函数）
    const matchResult = matchPattern(nodeValue, sharedContext.patternRegex);
    if (!matchResult.hasMatch) return;

    // 检查是否有特殊处理函数
    if (
      processor.specialHandler &&
      processor.specialHandler(path, matchResult.matches, sharedContext)
    ) {
      return;
    }

    // 处理单个匹配
    if (matchResult.matches.length === 1) {
      const match = matchResult.matches[0];
      const fullMatch = match[0];
      const extractedValue = match[1];

      const key = getKeyAndRecord(
        fullMatch,
        location,
        sharedContext.existingValueToKey,
        sharedContext.generatedKeysMap,
        sharedContext.extractedStrings,
        sharedContext.usedExistingKeysList,
        sharedContext.options
      );

      if (key === undefined) return;

      const standardizedValue =
        sharedContext.extractedStrings.find(s => s.key === key)?.value ||
        extractedValue;

      const callExpression = sharedContext.smartCallFactory(
        importInfo.callName,
        key,
        standardizedValue,
        undefined,
        standardizedValue
      );

      // 添加注释
      if (sharedContext.options.appendExtractedComment) {
        attachExtractedCommentToNode(
          callExpression,
          standardizedValue,
          sharedContext.options.extractedCommentType || "block"
        );
      }

      // 检查是否是完整替换
      const isFullReplacement = matchResult.isFullMatch;
      const replacementNode = processor.buildReplacement.single(
        callExpression,
        isFullReplacement!,
        nodeValue,
        path,
        sharedContext
      );

      sharedContext.recordPendingReplacement(path, path.node, replacementNode);
      return;
    }

    // 处理多个匹配（使用纯函数）
    const callExpressions: t.Expression[] = [];

    for (const match of matchResult.matches) {
      const fullMatch = match[0];
      const extractedValue = match[1];

      const key = getKeyAndRecord(
        fullMatch,
        location,
        sharedContext.existingValueToKey,
        sharedContext.generatedKeysMap,
        sharedContext.extractedStrings,
        sharedContext.usedExistingKeysList,
        sharedContext.options
      );

      if (key === undefined) continue;

      const standardizedValue =
        sharedContext.extractedStrings.find(s => s.key === key)?.value ||
        extractedValue;
      const callExpression = sharedContext.smartCallFactory(
        importInfo.callName,
        key,
        standardizedValue,
        undefined,
        standardizedValue
      );

      if (sharedContext.options.appendExtractedComment) {
        attachExtractedCommentToNode(
          callExpression,
          standardizedValue,
          sharedContext.options.extractedCommentType || "block"
        );
      }

      callExpressions.push(callExpression);
    }

    if (callExpressions.length > 0) {
      // 使用纯函数构建部分替换
      const partialReplacement = buildPartialReplacement(
        nodeValue,
        matchResult.matches,
        callExpressions
      );

      const replacementNode = t.isTemplateLiteral(partialReplacement)
        ? processor.buildReplacement.multiple(
            partialReplacement,
            path,
            sharedContext
          )
        : partialReplacement;

      sharedContext.recordPendingReplacement(path, path.node, replacementNode);
    }
  }

  // 开始AST遍历阶段（优化版本）
  // 温度优化：保持原有逻辑，但添加性能监控
  monitor.startTiming("ast-traversal");

  // 温度优化：清理此部分的复杂逻辑，保持简单的单次遍历
  traverse(ast, {
    StringLiteral(path) {
      monitor.incrementProcessedItems();
      processNodeWithPattern(path);
    },

    JSXAttribute(path) {
      monitor.incrementProcessedItems();
      processNodeWithPattern(path);
    },

    TemplateLiteral(path) {
      monitor.incrementProcessedItems();
      // 跳过tagged template literals
      if (tg.isTaggedTemplateExpression(path.parent)) return;

      const node = path.node;
      const location = buildLocationInfo({ filePath }, path.node);

      // 检测代码上下文
      const context = getContextInfo(path);
      const importInfo = getImportInfoForContext(context);

      // 处理带有表达式的模板字面量（使用优化的嵌套处理）
      if (node.expressions.length > 0) {
        const originalRawStringForPatternCheck = extractTemplateRawString(node);
        const singleMatchPattern = new RegExp(options.pattern);
        const match = singleMatchPattern.exec(originalRawStringForPatternCheck);

        if (match && match[1] !== undefined) {
          const translationKey = getKeyAndRecord(
            originalRawStringForPatternCheck,
            location,
            existingValueToKey,
            generatedKeysMap,
            extractedStrings,
            usedExistingKeysList,
            options
          );

          if (translationKey !== undefined) {
            // 使用优化的嵌套表达式处理函数
            const processedExpressions = processNestedExpressionsInTemplate(
              node.expressions,
              sharedContext,
              importInfo.callName,
              path
            );

            // 构建 interpolation 对象
            const interpolations =
              buildInterpolationObject(processedExpressions);

            // 获取标准化的值（包含 {arg1} 格式而不是 ${...} 格式）
            const standardizedValue =
              extractedStrings.find(s => s.key === translationKey)?.value ||
              match[1];

            const originalTemplateText = buildTemplateTextFromNode(node);
            const pattern = new RegExp(options.pattern);
            const cleanOriginalText =
              pattern.exec(originalTemplateText)?.[1] || originalTemplateText;

            const replacementNode = smartCallFactory(
              importInfo.callName,
              translationKey,
              standardizedValue,
              interpolations,
              cleanOriginalText
            );

            if (options.appendExtractedComment) {
              attachExtractedCommentToNode(
                replacementNode,
                standardizedValue,
                options.extractedCommentType || "block"
              );
            }

            recordPendingReplacement(path, path.node, replacementNode);
          }
        }
        return;
      }

      // 处理无表达式的模板字面量，使用通用处理器
      processNodeWithPattern(path);
    },

    JSXText(path) {
      monitor.incrementProcessedItems();
      processNodeWithPattern(path);
    },
  });

  monitor.endTiming("ast-traversal");

  // 分析待替换节点，标识哪些是顶级节点
  for (const [path, replacement] of pendingReplacements.entries()) {
    // 检查是否有父级节点也在待替换列表中
    const hasParentReplacement = Array.from(pendingReplacements.keys()).some(
      otherPath => {
        if (otherPath === path) return false;
        // 检查 otherPath 是否是 path 的祖先
        return path.isDescendant(otherPath);
      }
    );

    if (hasParentReplacement) {
      // 这个节点有父级替换，标记为非顶级
      replacement.isTopLevel = false;
    }
  }

  // 开始批量处理阶段
  monitor.startTiming("batch-processing");

  // 批量收集位置信息，避免重复计算
  const locationInfos: LocationInfo[] = [];
  const replacementInfos: Array<{
    replacement: PendingReplacementType;
    index: number;
  }> = [];

  let index = 0;
  for (const [, replacement] of pendingReplacements.entries()) {
    if (!replacement.isTopLevel) continue;

    const { originalNode } = replacement;
    if (originalNode.loc) {
      locationInfos.push({
        startLine: originalNode.loc.start.line,
        startColumn: originalNode.loc.start.column,
        endLine: originalNode.loc.end.line,
        endColumn: originalNode.loc.end.column,
      });

      replacementInfos.push({
        replacement,
        index,
      });

      index++;
    }
  }

  // 批量计算所有位置信息
  monitor.startTiming("batch-position-calculation");
  const positionInfos =
    positionCalculator.batchCalculatePositions(locationInfos);
  monitor.endTiming("batch-position-calculation");

  // 批量生成 ChangeDetail 对象
  monitor.startTiming("change-detail-generation");
  for (let i = 0; i < replacementInfos.length; i++) {
    const { replacement } = replacementInfos[i];
    const positionInfo = positionInfos[i];
    const { originalNode, replacementNode } = replacement;

    if (originalNode.loc) {
      const generatorOptions: GeneratorOptions = {
        jsescOption: { minimal: true },
        minified: false,
        concise: true,
      };

      const replacementCode = Array.isArray(replacementNode)
        ? generateJSXElementsCode(replacementNode, generatorOptions)
        : generate(replacementNode, generatorOptions).code;

      changes.push({
        filePath,
        original: positionInfo.text,
        replacement: replacementCode,
        line: originalNode.loc.start.line,
        column: originalNode.loc.start.column,
        endLine: originalNode.loc.end.line,
        endColumn: originalNode.loc.end.column,
        start: positionInfo.start,
        end: positionInfo.end,
        matchContext: positionInfo.matchContext,
      });
      modified = true;
    }
  }

  monitor.endTiming("change-detail-generation");
  monitor.endTiming("batch-processing");
  monitor.endTiming("total-processing");

  // 输出性能报告（仅在开发模式下）
  if (process.env.NODE_ENV === "development" || process.env.PERFORMANCE_DEBUG) {
    monitor.printReport();
  }

  return { modified, changes, requiredImports };
}
