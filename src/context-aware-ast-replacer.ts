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
  parseJSXTextPlaceholders,
} from "./core/ast-utils";
import type { NormalizedTransformOptions } from "./core/config-normalizer";
import { getI18nCall } from "./core/config-normalizer";
import * as tg from "./babel-type-guards";
import type { ContextInfo } from "./context-detector";
import { detectCodeContext } from "./context-detector";
import type { SmartImportManager, ImportInfo } from "./smart-import-manager";
import { isJSXAttribute } from "./babel-type-guards";
// 性能优化工具
import {
  CodePositionCalculator,
  PerformanceMonitor,
  RegexCache,
  type LocationInfo,
} from "./performance";

/**
 * 节点处理器配置接口
 */
interface NodeProcessorConfig<T extends t.Node> {
  // 节点值提取函数
  extractValue: (node: T) => string;

  // 跳过条件检查函数
  shouldSkip: (path: NodePath<T>, effectiveMethodName: string) => boolean;

  // 替换节点构建函数
  buildReplacement: {
    single: (
      callExpression: t.Expression,
      isFullReplacement: boolean,
      originalValue: string,
      path: NodePath<T>
    ) => t.Node | t.Node[];
    multiple: (
      templateLiteral: t.TemplateLiteral,
      path: NodePath<T>
    ) => t.Node | t.Node[];
  };

  // 特殊处理函数（可选）
  specialHandler?: (
    path: NodePath<T>,
    matches: RegExpMatchArray[],
    context: SharedProcessingContext
  ) => boolean;
}

/**
 * 共享处理上下文
 */
interface SharedProcessingContext {
  patternRegex: RegExp;
  options: NormalizedTransformOptions;
  filePath: string;
  existingValueToKey: Map<string, string | number>;
  generatedKeysMap: Map<string, string | number>;
  extractedStrings: ExtractedString[];
  usedExistingKeysList: UsedExistingKey[];
  getContextInfo: (path: NodePath<t.Node>) => ContextInfo;
  getImportInfoForContext: (context: ContextInfo) => ImportInfo;
  smartCallFactory: (
    callName: string,
    key: string | number,
    rawText: string,
    interpolations?: t.ObjectExpression,
    originalText?: string
  ) => t.Expression;
  recordPendingReplacement: (
    path: NodePath<t.Node>,
    originalNode: t.Node,
    replacementNode: t.Node | t.Node[],
    originalText?: string
  ) => void;
  buildTemplateLiteral: (
    parts: string[],
    expressions: t.Expression[]
  ) => t.TemplateLiteral;
}

/**
 * 处理模板字面量表达式中的嵌套字符串和模板字面量
 * 这是一个纯函数，专门用于递归处理嵌套结构
 */
function processNestedExpressionsInTemplate(
  expressions: (t.Expression | t.TSType)[],
  context: SharedProcessingContext,
  importCallName: string,
  _basePath: NodePath<t.Node>
): t.Expression[] {
  return expressions
    .filter((expr): expr is t.Expression => t.isExpression(expr))
    .map(expr => {
      // 克隆表达式并递归替换其中的字符串字面量
      const clonedExpr = t.cloneNode(expr);

      // 创建一个临时的文件结构来包装表达式，以便traverse可以正确处理
      const tempProgram = t.program([t.expressionStatement(clonedExpr)]);
      const tempFile = t.file(tempProgram, [], []);

      // 使用 traverse 遍历表达式，查找并替换嵌套的字符串字面量和模板字面量
      traverse(tempFile, {
        StringLiteral(nestedPath) {
          processNestedStringLiteral(nestedPath, context, importCallName);
        },

        TemplateLiteral(nestedTemplatePath) {
          processNestedTemplateLiteral(
            nestedTemplatePath,
            context,
            importCallName
          );
        },
      });

      // 从临时文件结构中提取处理后的表达式
      const processedStatement = tempProgram.body[0] as t.ExpressionStatement;
      return processedStatement.expression;
    });
}

/**
 * 处理嵌套的字符串字面量
 */
function processNestedStringLiteral(
  nestedPath: NodePath<t.StringLiteral>,
  context: SharedProcessingContext,
  importCallName: string
): void {
  const nodeValue = nestedPath.node.value;

  // 检查是否匹配模式
  const pattern = new RegExp(context.options.pattern);
  const match = pattern.exec(nodeValue);

  if (match && match[1] !== undefined) {
    const fullMatch = match[0];

    // 构建嵌套字符串的位置信息
    const nestedLocation = {
      filePath: context.filePath,
      line: nestedPath.node.loc?.start.line ?? 0,
      column: nestedPath.node.loc?.start.column ?? 0,
    };

    // 主动调用 getKeyAndRecord 提取这个嵌套字符串
    const nestedKey = getKeyAndRecord(
      fullMatch,
      nestedLocation,
      context.existingValueToKey,
      context.generatedKeysMap,
      context.extractedStrings,
      context.usedExistingKeysList,
      context.options
    );

    if (nestedKey !== undefined) {
      // 创建翻译调用的AST节点
      const callExpression = t.callExpression(t.identifier(importCallName), [
        t.stringLiteral(String(nestedKey)),
      ]);

      nestedPath.replaceWith(callExpression);
    }
  }
}

/**
 * 处理嵌套的模板字面量
 */
function processNestedTemplateLiteral(
  nestedTemplatePath: NodePath<t.TemplateLiteral>,
  context: SharedProcessingContext,
  importCallName: string
): void {
  // 跳过tagged template literals
  if (tg.isTaggedTemplateExpression(nestedTemplatePath.parent)) return;

  const nestedNode = nestedTemplatePath.node;

  // 如果嵌套的模板字面量有表达式，递归处理
  if (nestedNode.expressions.length > 0) {
    // 构建字符串表示以进行模式匹配
    let nestedOriginalRawString = "";
    nestedNode.quasis.forEach((quasi, i) => {
      nestedOriginalRawString += quasi.value.raw;
      if (i < nestedNode.expressions.length) {
        nestedOriginalRawString += "${...}";
      }
    });

    // 检查是否匹配模式
    const singleMatchPattern = new RegExp(context.options.pattern);
    const nestedMatch = singleMatchPattern.exec(nestedOriginalRawString);

    if (nestedMatch && nestedMatch[1] !== undefined) {
      // 构建嵌套模板字面量的位置信息
      const nestedLocation = {
        filePath: context.filePath,
        line: nestedNode.loc?.start.line ?? 0,
        column: nestedNode.loc?.start.column ?? 0,
      };

      // 主动调用 getKeyAndRecord 提取这个嵌套模板字面量
      const nestedKey = getKeyAndRecord(
        nestedOriginalRawString,
        nestedLocation,
        context.existingValueToKey,
        context.generatedKeysMap,
        context.extractedStrings,
        context.usedExistingKeysList,
        context.options
      );

      if (nestedKey !== undefined) {
        // 递归处理嵌套模板字面量的表达式
        const nestedProcessedExpressions = processNestedExpressionsInTemplate(
          nestedNode.expressions,
          context,
          importCallName,
          nestedTemplatePath
        );

        // 构建嵌套模板字面量的 interpolation 对象
        const nestedProperties = nestedProcessedExpressions.map(
          (nestedExpr, i) =>
            t.objectProperty(
              t.identifier(`arg${i + 1}`),
              nestedExpr as t.Expression
            )
        );
        const nestedInterpolations = t.objectExpression(nestedProperties);

        // 获取标准化后的值
        const nestedStandardizedValue =
          context.extractedStrings.find(s => s.key === nestedKey)?.value ||
          nestedMatch[1];

        // 创建翻译调用替换嵌套模板字面量
        const nestedReplacementNode = context.smartCallFactory(
          importCallName,
          nestedKey,
          nestedStandardizedValue,
          nestedInterpolations
        );

        nestedTemplatePath.replaceWith(nestedReplacementNode);
      }
    }
  }
}

/**
 * 处理条件表达式中的字符串字面量
 * 专门处理三元表达式 condition ? t("key1") : t("key2") 的情况
 * 目前未使用，保留以备后用
 */
function _processConditionalExpression(
  conditionalExpr: t.ConditionalExpression,
  context: SharedProcessingContext,
  importCallName: string
): t.ConditionalExpression {
  let consequent = conditionalExpr.consequent;
  let alternate = conditionalExpr.alternate;

  // 处理 consequent
  if (t.isStringLiteral(consequent)) {
    consequent = processConditionalStringLiteral(
      consequent,
      context,
      importCallName
    );
  }

  // 处理 alternate
  if (t.isStringLiteral(alternate)) {
    alternate = processConditionalStringLiteral(
      alternate,
      context,
      importCallName
    );
  }

  return t.conditionalExpression(conditionalExpr.test, consequent, alternate);
}

/**
 * 处理条件表达式中的字符串字面量节点
 */
function processConditionalStringLiteral(
  stringLiteral: t.StringLiteral,
  context: SharedProcessingContext,
  importCallName: string
): t.Expression {
  const nodeValue = stringLiteral.value;
  const pattern = new RegExp(context.options.pattern);
  const match = pattern.exec(nodeValue);

  if (match && match[1] !== undefined) {
    const fullMatch = match[0];

    const deepLocation = {
      filePath: context.filePath,
      line: stringLiteral.loc?.start.line ?? 0,
      column: stringLiteral.loc?.start.column ?? 0,
    };

    const deepKey = getKeyAndRecord(
      fullMatch,
      deepLocation,
      context.existingValueToKey,
      context.generatedKeysMap,
      context.extractedStrings,
      context.usedExistingKeysList,
      context.options
    );

    if (deepKey !== undefined) {
      return t.callExpression(t.identifier(importCallName), [
        t.stringLiteral(String(deepKey)),
      ]);
    }
  }

  return stringLiteral;
}

/**
 * 构建模板字面量的字符串表示用于模式匹配
 */
function buildRawStringForPatternCheck(node: t.TemplateLiteral): string {
  let rawString = "";
  node.quasis.forEach((quasi, i) => {
    rawString += quasi.value.raw;
    if (i < node.expressions.length) {
      rawString += "${...}";
    }
  });
  return rawString;
}

/**
 * 从模板字面量节点构建原始文本
 */
function buildTemplateTextFromNode(node: t.TemplateLiteral): string {
  let templateText = "";
  node.quasis.forEach((quasi, i) => {
    templateText += quasi.value.raw;
    if (i < node.expressions.length) {
      templateText += "${...}";
    }
  });
  return templateText;
}

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
    {
      originalNode: t.Node;
      replacementNode: t.Node | t.Node[];
      originalText?: string;
      isTopLevel: boolean;
    }
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

  const buildTemplateLiteral = (
    parts: string[],
    expressions: t.Expression[]
  ): t.TemplateLiteral => {
    const quasis = parts.map((part, index) =>
      t.templateElement({ raw: part, cooked: part }, index === parts.length - 1)
    );
    return t.templateLiteral(quasis, expressions);
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
    buildTemplateLiteral,
  };

  /**
   * 通用节点处理函数
   */
  function processNodeWithPattern<T extends t.Node>(
    path: NodePath<T>,
    config: NodeProcessorConfig<T>
  ): void {
    // 检测代码上下文
    const context = sharedContext.getContextInfo(path);
    const importInfo = sharedContext.getImportInfoForContext(context);
    const effectiveMethodName = importInfo.callName;

    // 跳过逻辑检查
    if (config.shouldSkip(path, effectiveMethodName)) {
      return;
    }

    // 提取节点值
    const nodeValue = config.extractValue(path.node);
    const location = {
      filePath: sharedContext.filePath,
      line: path.node.loc?.start.line ?? 0,
      column: path.node.loc?.start.column ?? 0,
    };

    // 模式匹配
    sharedContext.patternRegex.lastIndex = 0;
    const matches = Array.from(nodeValue.matchAll(sharedContext.patternRegex));

    if (matches.length === 0) return;

    // 检查是否有特殊处理函数
    if (
      config.specialHandler &&
      config.specialHandler(path, matches, sharedContext)
    ) {
      return;
    }

    // 处理单个匹配
    if (matches.length === 1) {
      const match = matches[0];
      const fullMatch = match[0];
      const extractedValue = match[1];
      const matchStart = match.index!;
      const matchEnd = matchStart + fullMatch.length;

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
      const isFullReplacement =
        matchStart === 0 && matchEnd === nodeValue.length;
      const replacementNode = config.buildReplacement.single(
        callExpression,
        isFullReplacement,
        nodeValue,
        path
      );

      sharedContext.recordPendingReplacement(path, path.node, replacementNode);
      return;
    }

    // 处理多个匹配
    const parts: string[] = [];
    const expressions: t.Expression[] = [];
    let lastIndex = 0;

    for (const match of matches) {
      const matchStart = match.index!;
      const matchEnd = matchStart + match[0].length;
      const fullMatch = match[0];
      const extractedValue = match[1];

      // 添加匹配前的文本
      if (matchStart > lastIndex) {
        parts.push(nodeValue.substring(lastIndex, matchStart));
      } else if (parts.length === 0) {
        parts.push("");
      }

      // 处理提取的值
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

      expressions.push(callExpression);
      parts.push("");
      lastIndex = matchEnd;
    }

    // 添加剩余文本
    if (lastIndex < nodeValue.length) {
      parts.push(nodeValue.substring(lastIndex));
    }

    if (expressions.length > 0) {
      const templateLiteral = sharedContext.buildTemplateLiteral(
        parts,
        expressions
      );
      const replacementNode = config.buildReplacement.multiple(
        templateLiteral,
        path
      );
      sharedContext.recordPendingReplacement(path, path.node, replacementNode);
    }
  }

  // 创建各节点类型的配置对象
  const stringLiteralConfig: NodeProcessorConfig<t.StringLiteral> = {
    extractValue: node => node.value,
    shouldSkip: (path, effectiveMethodName) => {
      return (
        (tg.isCallExpression(path.parent) &&
          tg.isIdentifier(path.parent.callee) &&
          path.parent.callee.name === effectiveMethodName &&
          path.listKey === "arguments") ||
        isJSXAttribute(path.parent) ||
        tg.isImportDeclaration(path.parent) ||
        tg.isExportDeclaration(path.parent)
      );
    },
    buildReplacement: {
      single: (callExpression, isFullReplacement, originalValue, _path) => {
        if (isFullReplacement) {
          return callExpression;
        } else {
          // 部分替换，需要保留周围的文本，转换为模板字符串
          // 重新进行模式匹配以获取正确的位置信息
          const nodeValue = originalValue;
          sharedContext.patternRegex.lastIndex = 0;
          const matches = Array.from(
            nodeValue.matchAll(sharedContext.patternRegex)
          );

          if (matches.length > 0) {
            const match = matches[0];
            const matchStart = match.index!;
            const matchEnd = matchStart + match[0].length;

            const parts: string[] = [];
            const expressions: t.Expression[] = [];

            // 添加匹配前的文本
            if (matchStart > 0) {
              parts.push(nodeValue.substring(0, matchStart));
            } else {
              parts.push("");
            }

            // 添加翻译调用
            expressions.push(callExpression);
            parts.push("");

            // 添加匹配后的文本
            if (matchEnd < nodeValue.length) {
              parts[parts.length - 1] = nodeValue.substring(matchEnd);
            }

            return sharedContext.buildTemplateLiteral(parts, expressions);
          }

          // 如果没有匹配，直接返回调用表达式
          return callExpression;
        }
      },
      multiple: templateLiteral => templateLiteral,
    },
  };

  const jsxAttributeConfig: NodeProcessorConfig<t.JSXAttribute> = {
    extractValue: node => {
      if (!tg.isStringLiteral(node.value)) return "";
      return node.value.value;
    },
    shouldSkip: path => {
      return (
        !tg.isJSXAttribute(path.node) ||
        !path.node.value ||
        !tg.isStringLiteral(path.node.value)
      );
    },
    buildReplacement: {
      single: (callExpression, _isFullReplacement, _originalValue, path) => {
        const jsxExpressionContainer = t.jsxExpressionContainer(callExpression);
        return t.jsxAttribute(path.node.name, jsxExpressionContainer);
      },
      multiple: (templateLiteral, path) => {
        const jsxExpressionContainer =
          t.jsxExpressionContainer(templateLiteral);
        return t.jsxAttribute(path.node.name, jsxExpressionContainer);
      },
    },
  };

  const jsxTextConfig: NodeProcessorConfig<t.JSXText> = {
    extractValue: node => node.value,
    shouldSkip: path => {
      return !path.node.value.trim(); // 跳过只包含空白字符的文本节点
    },
    buildReplacement: {
      single: (callExpression, _isFullReplacement, originalValue, _path) => {
        const jsxExpressionContainer = t.jsxExpressionContainer(callExpression);

        // 检查是否有前后文本需要保留
        const nodeValue = originalValue;
        const matches = Array.from(
          nodeValue.matchAll(sharedContext.patternRegex)
        );
        if (matches.length > 0) {
          const match = matches[0];
          const matchStart = match.index!;
          const matchEnd = matchStart + match[0].length;

          const beforeText = nodeValue.substring(0, matchStart);
          const afterText = nodeValue.substring(matchEnd);
          const hasBeforeText = /\S/.test(beforeText);
          const hasAfterText = /\S/.test(afterText);

          if (!hasBeforeText && !hasAfterText) {
            // 没有前后文本，直接替换
            return jsxExpressionContainer;
          } else {
            // 有前后文本，构建多元素数组
            const elements: (t.JSXText | t.JSXExpressionContainer)[] = [];

            if (hasBeforeText) {
              elements.push(t.jsxText(beforeText));
            }

            elements.push(jsxExpressionContainer);

            if (hasAfterText) {
              elements.push(t.jsxText(afterText));
            }

            return elements;
          }
        }

        return jsxExpressionContainer;
      },
      multiple: (_templateLiteral, path) => {
        // 多个匹配的JSX文本需要特殊处理
        const nodeValue = path.node.value;
        const elements: (t.JSXText | t.JSXExpressionContainer)[] = [];
        let lastIndex = 0;

        const matches = Array.from(
          nodeValue.matchAll(sharedContext.patternRegex)
        );

        for (const match of matches) {
          const matchStart = match.index!;
          const matchEnd = matchStart + match[0].length;
          const fullMatch = match[0];
          const extractedValue = match[1];

          // 添加匹配前的文本
          if (matchStart > lastIndex) {
            const beforeText = nodeValue.substring(lastIndex, matchStart);
            if (/\S/.test(beforeText)) {
              elements.push(t.jsxText(beforeText));
            }
          }

          // 处理提取的值 - 这里需要重新生成调用表达式
          const location = {
            filePath: sharedContext.filePath,
            line: path.node.loc?.start.line ?? 0,
            column: path.node.loc?.start.column ?? 0,
          };

          const key = getKeyAndRecord(
            fullMatch,
            location,
            sharedContext.existingValueToKey,
            sharedContext.generatedKeysMap,
            sharedContext.extractedStrings,
            sharedContext.usedExistingKeysList,
            sharedContext.options
          );

          if (key !== undefined) {
            // Parse JSX text placeholders to generate interpolation
            const parsedPlaceholders = parseJSXTextPlaceholders(extractedValue);

            let callExpression;
            if (parsedPlaceholders && parsedPlaceholders.interpolationObject) {
              // Use canonical text as key and provide interpolation object
              callExpression = sharedContext.smartCallFactory(
                sharedContext.getImportInfoForContext(
                  sharedContext.getContextInfo(path)
                ).callName,
                key,
                parsedPlaceholders.canonicalText,
                parsedPlaceholders.interpolationObject
              );
            } else {
              // No placeholders, use simple call
              callExpression = sharedContext.smartCallFactory(
                sharedContext.getImportInfoForContext(
                  sharedContext.getContextInfo(path)
                ).callName,
                key,
                extractedValue,
                undefined,
                extractedValue
              );
            }

            if (sharedContext.options.appendExtractedComment) {
              // Use the canonical text for comment (with {argN} format)
              const commentText = parsedPlaceholders
                ? parsedPlaceholders.canonicalText
                : extractedValue;
              attachExtractedCommentToNode(
                callExpression,
                commentText,
                sharedContext.options.extractedCommentType || "block"
              );
            }

            elements.push(t.jsxExpressionContainer(callExpression));
          }

          lastIndex = matchEnd;
        }

        // 添加剩余文本
        if (lastIndex < nodeValue.length) {
          const afterText = nodeValue.substring(lastIndex);
          if (/\S/.test(afterText)) {
            elements.push(t.jsxText(afterText));
          }
        }

        return elements.length === 1 ? elements[0] : elements;
      },
    },
    specialHandler: (path, matches, context) => {
      // JSXText 的特殊处理：处理占位符
      if (matches.length === 1) {
        const match = matches[0];
        const extractedValue = match[1];

        // Parse JSX text placeholders to generate interpolation
        const parsedPlaceholders = parseJSXTextPlaceholders(extractedValue);

        if (parsedPlaceholders && parsedPlaceholders.interpolationObject) {
          // 有占位符的情况，需要特殊处理
          const location = {
            filePath: context.filePath,
            line: path.node.loc?.start.line ?? 0,
            column: path.node.loc?.start.column ?? 0,
          };

          const key = getKeyAndRecord(
            match[0],
            location,
            context.existingValueToKey,
            context.generatedKeysMap,
            context.extractedStrings,
            context.usedExistingKeysList,
            context.options
          );

          if (key !== undefined) {
            const callExpression = context.smartCallFactory(
              context.getImportInfoForContext(context.getContextInfo(path))
                .callName,
              key,
              parsedPlaceholders.canonicalText,
              parsedPlaceholders.interpolationObject
            );

            if (context.options.appendExtractedComment) {
              attachExtractedCommentToNode(
                callExpression,
                parsedPlaceholders.canonicalText,
                context.options.extractedCommentType || "block"
              );
            }

            const jsxExpressionContainer =
              t.jsxExpressionContainer(callExpression);

            // 检查是否有前后文本需要保留
            const nodeValue = path.node.value;
            const matchStart = match.index!;
            const matchEnd = matchStart + match[0].length;

            const beforeText = nodeValue.substring(0, matchStart);
            const afterText = nodeValue.substring(matchEnd);
            const hasBeforeText = /\S/.test(beforeText);
            const hasAfterText = /\S/.test(afterText);

            if (!hasBeforeText && !hasAfterText) {
              // 没有前后文本，直接替换
              context.recordPendingReplacement(
                path,
                path.node,
                jsxExpressionContainer
              );
            } else {
              // 有前后文本，构建多元素数组
              const elements: (t.JSXText | t.JSXExpressionContainer)[] = [];

              if (hasBeforeText) {
                elements.push(t.jsxText(beforeText));
              }

              elements.push(jsxExpressionContainer);

              if (hasAfterText) {
                elements.push(t.jsxText(afterText));
              }

              context.recordPendingReplacement(
                path,
                path.node,
                elements,
                nodeValue
              );
            }

            return true; // 表示已处理
          }
        }
      }

      return false; // 表示未处理，继续通用逻辑
    },
  };

  // 开始AST遍历阶段
  monitor.startTiming("ast-traversal");

  traverse(ast, {
    StringLiteral(path) {
      monitor.incrementProcessedItems();
      processNodeWithPattern(path, stringLiteralConfig);
    },

    JSXAttribute(path) {
      monitor.incrementProcessedItems();
      processNodeWithPattern(path, jsxAttributeConfig);
    },

    TemplateLiteral(path) {
      monitor.incrementProcessedItems();
      // 跳过tagged template literals
      if (tg.isTaggedTemplateExpression(path.parent)) return;

      const node = path.node;
      const location = {
        filePath,
        line: path.node.loc?.start.line ?? 0,
        column: path.node.loc?.start.column ?? 0,
      };

      // 检测代码上下文
      const context = getContextInfo(path);
      const importInfo = getImportInfoForContext(context);

      // 处理带有表达式的模板字面量
      if (node.expressions.length > 0) {
        const originalRawStringForPatternCheck =
          buildRawStringForPatternCheck(node);
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
            // 使用提取的纯函数处理表达式中的嵌套内容
            const processedExpressions = processNestedExpressionsInTemplate(
              node.expressions,
              sharedContext,
              importInfo.callName,
              path
            );

            // 构建 interpolation 对象
            const properties = processedExpressions.map((expr, i) =>
              t.objectProperty(
                t.identifier(`arg${i + 1}`),
                expr as t.Expression
              )
            );
            const interpolations = t.objectExpression(properties);

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

      // 处理无表达式的模板字面量
      const templateLiteralConfig: NodeProcessorConfig<t.TemplateLiteral> = {
        extractValue: node => node.quasis.map(q => q.value.raw).join(""),
        shouldSkip: () => false,
        buildReplacement: {
          single: (callExpression, isFullReplacement, originalValue, _path) => {
            if (isFullReplacement) {
              return callExpression;
            } else {
              // 部分替换，使用模板字面量
              const nodeValue = originalValue;
              const matches = Array.from(
                nodeValue.matchAll(sharedContext.patternRegex)
              );
              if (matches.length > 0) {
                const match = matches[0];
                const matchStart = match.index!;
                const matchEnd = matchStart + match[0].length;
                const parts: string[] = [];
                const expressions: t.Expression[] = [];

                if (matchStart > 0) {
                  parts.push(nodeValue.substring(0, matchStart));
                } else {
                  parts.push("");
                }

                expressions.push(callExpression);
                parts.push("");

                if (matchEnd < nodeValue.length) {
                  parts[parts.length - 1] = nodeValue.substring(matchEnd);
                }

                return sharedContext.buildTemplateLiteral(parts, expressions);
              }
              return callExpression;
            }
          },
          multiple: templateLiteral => templateLiteral,
        },
      };

      processNodeWithPattern(path, templateLiteralConfig);
    },

    JSXText(path) {
      monitor.incrementProcessedItems();
      processNodeWithPattern(path, jsxTextConfig);
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
    replacement: any;
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

/**
 * 正确生成 JSX 元素数组的代码
 * 处理 JSX 文本节点和表达式容器的正确连接
 */
function generateJSXElementsCode(
  elements: t.Node[],
  generatorOptions: GeneratorOptions
): string {
  if (elements.length === 0) return "";
  if (elements.length === 1) {
    if (t.isJSXText(elements[0])) {
      // 单个文本节点直接返回其值
      return elements[0].value;
    } else {
      // 表达式容器和其他节点正常生成
      return generate(elements[0], generatorOptions).code;
    }
  }

  // 对于多个元素，需要特殊处理 JSX 文本和表达式的连接
  return elements
    .map(node => {
      if (t.isJSXText(node)) {
        // JSX 文本节点直接返回其值，不需要额外的引号或处理
        return node.value;
      } else {
        // 表达式容器和其他节点正常生成
        return generate(node, generatorOptions).code;
      }
    })
    .join("");
}
