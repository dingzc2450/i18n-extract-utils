/**
 * 嵌套表达式处理模块
 * 提供处理模板字面量和其他嵌套结构中的表达式的纯函数
 */

import type { NodePath } from "@babel/traverse";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import * as tg from "../babel-type-guards";
import { getKeyAndRecord } from "../key-manager";
import {
  createTempASTFile,
  extractProcessedExpression,
  buildLocationInfo,
  buildTranslationCall,
  buildInterpolationObject,
  extractTemplateRawString,
} from "./ast-pure-functions";
import type {
  SharedProcessingContext,
  NestedProcessingResult,
  KeyGenerationContext,
} from "./shared-context";

/**
 * 嵌套节点信息接口
 */
export interface NestedNodeInfo {
  node: t.Node;
  nodeType: string;
  value: string;
  location: {
    filePath: string;
    line: number;
    column: number;
  };
  parentPath: NodePath<t.Node>;
}

/**
 * 嵌套处理选项接口
 */
export interface NestedProcessingOptions {
  pattern: RegExp;
  importCallName: string;
  filePath: string;
}

/**
 * 纯函数：处理模板字面量表达式中的嵌套字符串和模板字面量
 * 避免在主遍历中进行嵌套traverse调用
 * @param expressions - 表达式数组
 * @param context - 共享处理上下文
 * @param importCallName - 导入调用名称
 * @param basePath - 基础路径
 * @returns 处理后的表达式数组
 */
export function processNestedExpressionsInTemplate(
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

      // 创建临时AST文件结构来包装表达式，以便traverse可以正确处理
      const tempFile = createTempASTFile(clonedExpr);

      // 使用traverse遍历表达式，查找并替换嵌套的字符串字面量和模板字面量
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
      return extractProcessedExpression(tempFile);
    });
}

/**
 * 纯函数：处理嵌套的字符串字面量
 * @param nestedPath - 嵌套字符串字面量路径
 * @param context - 共享处理上下文
 * @param importCallName - 导入调用名称
 */
export function processNestedStringLiteral(
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
    const nestedLocation = buildLocationInfo(
      { filePath: context.filePath },
      nestedPath.node
    );

    // 主动调用getKeyAndRecord提取这个嵌套字符串
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
      const callExpression = buildTranslationCall(importCallName, nestedKey);
      nestedPath.replaceWith(callExpression);
    }
  }
}

/**
 * 纯函数：处理嵌套的模板字面量
 * @param nestedTemplatePath - 嵌套模板字面量路径
 * @param context - 共享处理上下文
 * @param importCallName - 导入调用名称
 */
export function processNestedTemplateLiteral(
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
    const nestedOriginalRawString = extractTemplateRawString(nestedNode);

    // 检查是否匹配模式
    const singleMatchPattern = new RegExp(context.options.pattern);
    const nestedMatch = singleMatchPattern.exec(nestedOriginalRawString);

    if (nestedMatch && nestedMatch[1] !== undefined) {
      // 构建嵌套模板字面量的位置信息
      const nestedLocation = buildLocationInfo(
        { filePath: context.filePath },
        nestedNode
      );

      // 主动调用getKeyAndRecord提取这个嵌套模板字面量
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

        // 构建嵌套模板字面量的interpolation对象
        const nestedInterpolations = buildInterpolationObject(
          nestedProcessedExpressions
        );

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
 * 纯函数：处理条件表达式中的字符串字面量
 * 专门处理三元表达式 condition ? t("key1") : t("key2") 的情况
 * @param conditionalExpr - 条件表达式
 * @param context - 共享处理上下文
 * @param importCallName - 导入调用名称
 * @returns 处理后的条件表达式
 */
export function processConditionalExpression(
  conditionalExpr: t.ConditionalExpression,
  context: SharedProcessingContext,
  importCallName: string
): t.ConditionalExpression {
  let consequent = conditionalExpr.consequent;
  let alternate = conditionalExpr.alternate;

  // 处理consequent
  if (t.isStringLiteral(consequent)) {
    consequent = processConditionalStringLiteral(
      consequent,
      context,
      importCallName
    );
  }

  // 处理alternate
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
 * 纯函数：处理条件表达式中的字符串字面量节点
 * @param stringLiteral - 字符串字面量节点
 * @param context - 共享处理上下文
 * @param importCallName - 导入调用名称
 * @returns 处理后的表达式
 */
export function processConditionalStringLiteral(
  stringLiteral: t.StringLiteral,
  context: SharedProcessingContext,
  importCallName: string
): t.Expression {
  const nodeValue = stringLiteral.value;
  const pattern = new RegExp(context.options.pattern);
  const match = pattern.exec(nodeValue);

  if (match && match[1] !== undefined) {
    const fullMatch = match[0];

    const deepLocation = buildLocationInfo(
      { filePath: context.filePath },
      stringLiteral
    );

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
      return buildTranslationCall(importCallName, deepKey);
    }
  }

  return stringLiteral;
}

/**
 * 纯函数：递归处理AST节点中的所有嵌套字符串
 * 使用单次遍历替代多次嵌套traverse调用
 * @param node - 根节点
 * @param pattern - 匹配模式
 * @param processor - 节点处理函数
 * @returns 处理后的节点
 */
export function processASTNodeRecursively(
  node: t.Node,
  pattern: RegExp,
  processor: (node: t.Node) => t.Node | null
): t.Node {
  const clonedNode = t.cloneNode(node);
  const tempFile = createTempASTFile(
    t.isExpression(clonedNode) ? clonedNode : t.identifier("temp")
  );

  traverse(tempFile, {
    enter(path) {
      const processedNode = processor(path.node);
      if (processedNode) {
        path.replaceWith(processedNode);
      }
    },
  });

  return extractProcessedExpression(tempFile);
}

/**
 * 嵌套节点收集器
 * 在单次遍历中收集所有嵌套节点，避免重复遍历
 */
export class NestedNodeCollector {
  private collectedNodes: NestedNodeInfo[] = [];

  /**
   * 在单次遍历中收集所有嵌套节点
   * @param rootNode - 根节点
   * @param filePath - 文件路径
   * @returns 收集的嵌套节点信息
   */
  collectNestedNodes(rootNode: t.Node, filePath: string): NestedNodeInfo[] {
    this.collectedNodes = [];

    if (t.isExpression(rootNode)) {
      const tempFile = createTempASTFile(rootNode);

      traverse(tempFile, {
        StringLiteral: path => {
          this.addNestedNode(path, "StringLiteral", path.node.value, filePath);
        },

        TemplateLiteral: path => {
          if (!tg.isTaggedTemplateExpression(path.parent)) {
            const value = extractTemplateRawString(path.node);
            this.addNestedNode(path, "TemplateLiteral", value, filePath);
          }
        },

        JSXText: path => {
          this.addNestedNode(path, "JSXText", path.node.value, filePath);
        },
      });
    }

    return this.collectedNodes;
  }

  /**
   * 批量处理收集的嵌套节点
   * @param nodes - 收集的节点信息
   * @param context - 处理上下文
   * @returns 处理结果
   */
  processCollectedNodes(
    nodes: NestedNodeInfo[],
    context: KeyGenerationContext & {
      pattern: RegExp;
      importCallName: string;
      filePath: string;
    }
  ): NestedProcessingResult {
    const processedExpressions: t.Expression[] = [];
    const extractedKeys: (string | number)[] = [];
    let hasNestedMatches = false;

    for (const nodeInfo of nodes) {
      const matches = Array.from(nodeInfo.value.matchAll(context.pattern));

      if (matches.length > 0) {
        hasNestedMatches = true;

        for (const match of matches) {
          if (match[1] !== undefined) {
            const key = getKeyAndRecord(
              match[0],
              nodeInfo.location,
              context.existingValueToKey,
              context.generatedKeysMap,
              context.extractedStrings,
              context.usedExistingKeysList,
              context.options
            );

            if (key !== undefined) {
              extractedKeys.push(key);
              processedExpressions.push(
                buildTranslationCall(context.importCallName, key)
              );
            }
          }
        }
      }
    }

    return {
      processedExpressions,
      hasNestedMatches,
      extractedKeys,
    };
  }

  private addNestedNode(
    path: NodePath<t.Node>,
    nodeType: string,
    value: string,
    filePath: string
  ): void {
    this.collectedNodes.push({
      node: path.node,
      nodeType,
      value,
      location: buildLocationInfo({ filePath }, path.node),
      parentPath: path as NodePath<t.Node>,
    });
  }
}

/**
 * 优化的嵌套表达式处理器
 * 减少traverse调用次数，提高性能
 */
export class OptimizedNestedExpressionHandler {
  private collector = new NestedNodeCollector();

  /**
   * 处理模板字面量中的表达式（优化版本）
   * @param expressions - 表达式数组
   * @param context - 处理上下文
   * @param importCallName - 导入调用名称
   * @returns 处理结果
   */
  processTemplateExpressions(
    expressions: (t.Expression | t.TSType)[],
    context: SharedProcessingContext,
    importCallName: string
  ): NestedProcessingResult {
    const processedExpressions: t.Expression[] = [];
    const extractedKeys: (string | number)[] = [];
    let hasNestedMatches = false;

    for (const expr of expressions) {
      if (!t.isExpression(expr)) continue;

      // 收集嵌套节点
      const nestedNodes = this.collector.collectNestedNodes(
        expr,
        context.filePath
      );

      if (nestedNodes.length > 0) {
        // 批量处理嵌套节点
        const result = this.collector.processCollectedNodes(nestedNodes, {
          ...context,
          pattern: context.patternRegex,
          importCallName,
          filePath: context.filePath,
        });

        hasNestedMatches = hasNestedMatches || result.hasNestedMatches;
        extractedKeys.push(...result.extractedKeys);

        // 应用处理结果到原始表达式
        const processedExpr = this.applyNestedProcessing(expr, result);
        processedExpressions.push(processedExpr);
      } else {
        // 没有嵌套内容，直接使用原始表达式
        processedExpressions.push(expr);
      }
    }

    return {
      processedExpressions,
      hasNestedMatches,
      extractedKeys,
    };
  }

  private applyNestedProcessing(
    originalExpr: t.Expression,
    result: NestedProcessingResult
  ): t.Expression {
    // 如果有嵌套匹配，需要应用处理结果
    if (result.hasNestedMatches && result.processedExpressions.length > 0) {
      // 简化处理：如果只有一个处理结果，直接返回
      if (result.processedExpressions.length === 1) {
        return result.processedExpressions[0];
      }
      // 多个结果需要更复杂的合并逻辑（根据实际需求实现）
    }

    return originalExpr;
  }
}

/**
 * 导出优化后的处理函数
 */
export const optimizedNestedHandler = new OptimizedNestedExpressionHandler();
