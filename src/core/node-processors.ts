/**
 * 节点处理器模块
 * 提供统一的AST节点处理策略和配置
 */

import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import * as tg from "../babel-type-guards";
import { isJSXAttribute } from "../babel-type-guards";
import {
  buildJSXAttribute,
  buildJSXExpressionContainer,
  buildJSXText,
  buildPartialReplacement,
  hasMeaningfulContent,
} from "./ast-pure-functions";
import { getKeyAndRecord } from "../key-manager";
import {
  attachExtractedCommentToNode,
  parseJSXTextPlaceholders,
} from "./ast-utils";
import type { SharedProcessingContext } from "./shared-context";

/**
 * 节点处理器接口
 */
export interface NodeProcessor<T extends t.Node> {
  readonly nodeType: string;

  /**
   * 从节点中提取字符串值
   */
  extractValue: (node: T) => string;

  /**
   * 检查是否应该跳过此节点
   */
  shouldSkip: (path: NodePath<T>, effectiveMethodName: string) => boolean;

  /**
   * 构建替换节点
   */
  buildReplacement: {
    /**
     * 单个匹配的替换逻辑
     */
    single: (
      callExpression: t.Expression,
      isFullReplacement: boolean,
      originalValue: string,
      path: NodePath<T>,
      context?: SharedProcessingContext
    ) => t.Node | t.Node[];

    /**
     * 多个匹配的替换逻辑
     */
    multiple: (
      templateLiteral: t.TemplateLiteral,
      path: NodePath<T>,
      context?: SharedProcessingContext
    ) => t.Node | t.Node[];
  };

  /**
   * 特殊处理函数（可选）
   * @returns true 表示已处理，false 表示继续通用逻辑
   */
  specialHandler?: (
    path: NodePath<T>,
    matches: RegExpMatchArray[],
    context: SharedProcessingContext
  ) => boolean;
}

/**
 * 字符串字面量处理器
 */
export class StringLiteralProcessor implements NodeProcessor<t.StringLiteral> {
  readonly nodeType = "StringLiteral";

  extractValue = (node: t.StringLiteral): string => node.value;

  shouldSkip = (
    path: NodePath<t.StringLiteral>,
    effectiveMethodName: string
  ): boolean => {
    return (
      // 跳过已经是翻译函数调用参数的字符串
      (tg.isCallExpression(path.parent) &&
        tg.isIdentifier(path.parent.callee) &&
        path.parent.callee.name === effectiveMethodName &&
        path.listKey === "arguments") ||
      // 跳过JSX属性中的字符串（由JSXAttribute处理器处理）
      isJSXAttribute(path.parent) ||
      // 跳过导入导出语句中的字符串
      tg.isImportDeclaration(path.parent) ||
      tg.isExportDeclaration(path.parent)
    );
  };

  buildReplacement = {
    single: (
      callExpression: t.Expression,
      isFullReplacement: boolean,
      originalValue: string,
      _path: NodePath<t.StringLiteral>,
      context?: SharedProcessingContext
    ): t.Node | t.Node[] => {
      if (isFullReplacement) {
        return callExpression;
      } else {
        // 部分替换，需要保留周围的文本，转换为模板字符串
        // 使用共享上下文中的模式
        if (!context) {
          console.warn(
            "No context provided for partial replacement, returning call expression"
          );
          return callExpression;
        }

        const pattern = new RegExp(context.patternRegex.source, "g");
        const matches = Array.from(originalValue.matchAll(pattern));

        if (matches.length > 0) {
          return buildPartialReplacement(originalValue, matches, [
            callExpression,
          ]);
        }

        // 如果没有匹配，直接返回调用表达式
        return callExpression;
      }
    },

    multiple: (templateLiteral: t.TemplateLiteral): t.TemplateLiteral => {
      return templateLiteral;
    },
  };
}

/**
 * JSX属性处理器
 */
export class JSXAttributeProcessor implements NodeProcessor<t.JSXAttribute> {
  readonly nodeType = "JSXAttribute";

  extractValue = (node: t.JSXAttribute): string => {
    if (!tg.isStringLiteral(node.value)) return "";
    return node.value.value;
  };

  shouldSkip = (path: NodePath<t.JSXAttribute>): boolean => {
    return (
      !tg.isJSXAttribute(path.node) ||
      !path.node.value ||
      !tg.isStringLiteral(path.node.value)
    );
  };

  buildReplacement = {
    single: (
      callExpression: t.Expression,
      _isFullReplacement: boolean,
      _originalValue: string,
      path: NodePath<t.JSXAttribute>,
      _context?: SharedProcessingContext
    ): t.JSXAttribute => {
      return buildJSXAttribute(path.node.name, callExpression);
    },

    multiple: (
      templateLiteral: t.TemplateLiteral,
      path: NodePath<t.JSXAttribute>,
      _context?: SharedProcessingContext
    ): t.JSXAttribute => {
      return buildJSXAttribute(path.node.name, templateLiteral);
    },
  };
}

/**
 * JSX文本处理器
 */
export class JSXTextProcessor implements NodeProcessor<t.JSXText> {
  readonly nodeType = "JSXText";

  extractValue = (node: t.JSXText): string => node.value;

  shouldSkip = (path: NodePath<t.JSXText>): boolean => {
    // 跳过只包含空白字符的文本节点
    return !path.node.value.trim();
  };

  buildReplacement = {
    single: (
      callExpression: t.Expression,
      _isFullReplacement: boolean,
      originalValue: string,
      path: NodePath<t.JSXText>,
      context?: SharedProcessingContext
    ): t.Node | t.Node[] => {
      const jsxExpressionContainer =
        buildJSXExpressionContainer(callExpression);

      // 检查是否有前后文本需要保留
      const nodeValue = originalValue;
      if (!context) {
        return jsxExpressionContainer;
      }

      const pattern = new RegExp(context.patternRegex.source, "g");
      const matches = Array.from(nodeValue.matchAll(pattern));

      if (matches.length > 0) {
        const match = matches[0];
        const matchStart = match.index!;
        const matchEnd = matchStart + match[0].length;

        const beforeText = nodeValue.substring(0, matchStart);
        const afterText = nodeValue.substring(matchEnd);
        const hasBeforeText = hasMeaningfulContent(beforeText);
        const hasAfterText = hasMeaningfulContent(afterText);

        if (!hasBeforeText && !hasAfterText) {
          // 没有前后文本，直接替换
          return jsxExpressionContainer;
        } else {
          // 有前后文本，构建多元素数组
          const elements: (t.JSXText | t.JSXExpressionContainer)[] = [];

          if (hasBeforeText) {
            elements.push(buildJSXText(beforeText));
          }

          elements.push(jsxExpressionContainer);

          if (hasAfterText) {
            elements.push(buildJSXText(afterText));
          }

          return elements;
        }
      }

      return jsxExpressionContainer;
    },

    multiple: (
      templateLiteral: t.TemplateLiteral,
      path: NodePath<t.JSXText>,
      context?: SharedProcessingContext
    ): t.Node | t.Node[] => {
      // 多个匹配的JSX文本需要特殊处理
      const nodeValue = path.node.value;
      const elements: (t.JSXText | t.JSXExpressionContainer)[] = [];
      let lastIndex = 0;

      if (!context) {
        return templateLiteral;
      }

      const pattern = new RegExp(context.patternRegex.source, "g");
      const matches = Array.from(nodeValue.matchAll(pattern));

      for (const match of matches) {
        const matchStart = match.index!;
        const matchEnd = matchStart + match[0].length;
        // const fullMatch = match[0];
        const extractedValue = match[1];

        // 添加匹配前的文本
        if (matchStart > lastIndex) {
          const beforeText = nodeValue.substring(lastIndex, matchStart);
          if (hasMeaningfulContent(beforeText)) {
            elements.push(buildJSXText(beforeText));
          }
        }

        // 这里需要重新生成调用表达式，因为每个匹配都需要独立的键
        // 注意：这个逻辑需要在实际使用时传入context来处理
        // 为了保持处理器的纯函数特性，这里暂时使用占位符
        const placeholderCall = t.callExpression(t.identifier("t"), [
          t.stringLiteral(extractedValue),
        ]);

        elements.push(buildJSXExpressionContainer(placeholderCall));
        lastIndex = matchEnd;
      }

      // 添加剩余文本
      if (lastIndex < nodeValue.length) {
        const afterText = nodeValue.substring(lastIndex);
        if (hasMeaningfulContent(afterText)) {
          elements.push(buildJSXText(afterText));
        }
      }

      return elements.length === 1 ? elements[0] : elements;
    },
  };

  specialHandler = (
    path: NodePath<t.JSXText>,
    matches: RegExpMatchArray[],
    context: SharedProcessingContext
  ): boolean => {
    // JSXText的特殊处理：处理占位符
    if (matches.length === 1) {
      const match = matches[0];
      const extractedValue = match[1];

      // 解析JSX文本占位符以生成插值
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
            buildJSXExpressionContainer(callExpression);

          // 检查是否有前后文本需要保留
          const nodeValue = path.node.value;
          const matchStart = match.index!;
          const matchEnd = matchStart + match[0].length;

          const beforeText = nodeValue.substring(0, matchStart);
          const afterText = nodeValue.substring(matchEnd);
          const hasBeforeText = hasMeaningfulContent(beforeText);
          const hasAfterText = hasMeaningfulContent(afterText);

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
              elements.push(buildJSXText(beforeText));
            }

            elements.push(jsxExpressionContainer);

            if (hasAfterText) {
              elements.push(buildJSXText(afterText));
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
  };
}

/**
 * 模板字面量处理器
 */
export class TemplateLiteralProcessor
  implements NodeProcessor<t.TemplateLiteral>
{
  readonly nodeType = "TemplateLiteral";

  extractValue = (node: t.TemplateLiteral): string => {
    return node.quasis.map(q => q.value.raw).join("");
  };

  shouldSkip = (path: NodePath<t.TemplateLiteral>): boolean => {
    // 跳过tagged template literals
    return tg.isTaggedTemplateExpression(path.parent);
  };

  buildReplacement = {
    single: (
      callExpression: t.Expression,
      isFullReplacement: boolean,
      originalValue: string,
      _path: NodePath<t.TemplateLiteral>,
      context?: SharedProcessingContext
    ): t.Node => {
      if (isFullReplacement) {
        return callExpression;
      } else {
        // 部分替换，使用模板字面量
        if (!context) {
          return callExpression;
        }

        const pattern = new RegExp(context.patternRegex.source, "g");
        const matches = Array.from(originalValue.matchAll(pattern));

        if (matches.length > 0) {
          return buildPartialReplacement(originalValue, matches, [
            callExpression,
          ]);
        }

        return callExpression;
      }
    },

    multiple: (
      templateLiteral: t.TemplateLiteral,
      _path?: NodePath<t.TemplateLiteral>,
      _context?: SharedProcessingContext
    ): t.TemplateLiteral => {
      return templateLiteral;
    },
  };
}

/**
 * 节点处理器工厂
 */
export class NodeProcessorFactory {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static processors = new Map<string, NodeProcessor<any>>([
    ["StringLiteral", new StringLiteralProcessor()],
    ["JSXAttribute", new JSXAttributeProcessor()],
    ["JSXText", new JSXTextProcessor()],
    ["TemplateLiteral", new TemplateLiteralProcessor()],
  ]);

  /**
   * 根据节点类型获取处理器
   */
  static getProcessor<T extends t.Node>(
    nodeType: string
  ): NodeProcessor<T> | undefined {
    return this.processors.get(nodeType);
  }

  /**
   * 根据AST节点获取处理器
   */
  static getProcessorForNode<T extends t.Node>(
    node: T
  ): NodeProcessor<T> | undefined {
    return this.getProcessor(node.type);
  }

  /**
   * 注册新的处理器
   */
  static registerProcessor<T extends t.Node>(
    nodeType: string,
    processor: NodeProcessor<T>
  ): void {
    this.processors.set(nodeType, processor);
  }

  /**
   * 获取所有支持的节点类型
   */
  static getSupportedNodeTypes(): string[] {
    return Array.from(this.processors.keys());
  }
}

/**
 * 导出预定义的处理器实例
 */
export const stringLiteralProcessor = new StringLiteralProcessor();
export const jsxAttributeProcessor = new JSXAttributeProcessor();
export const jsxTextProcessor = new JSXTextProcessor();
export const templateLiteralProcessor = new TemplateLiteralProcessor();
