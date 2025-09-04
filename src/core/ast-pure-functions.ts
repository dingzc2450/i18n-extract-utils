/**
 * AST工具纯函数模块
 * 提供可复用的AST操作工具函数，避免重复代码
 */

import * as t from "@babel/types";
import generate from "@babel/generator";
import type { GeneratorOptions } from "@babel/generator";
import type { LocationInfo } from "../performance";

/**
 * AST节点信息接口
 */
export interface ASTNodeInfo {
  node: t.Node;
  value: string;
  location: LocationInfo;
}

/**
 * 模式匹配结果接口
 */
export interface PatternMatchResult {
  matches: RegExpMatchArray[];
  hasMatch: boolean;
  isFullMatch: boolean;
  fullMatchStart?: number;
  fullMatchEnd?: number;
}

/**
 * 位置信息构建参数接口
 */
export interface LocationParams {
  filePath: string;
  line?: number;
  column?: number;
}

/**
 * 纯函数：创建可复用的模式匹配器
 * @param pattern - 匹配模式字符串
 * @returns 包含匹配方法的对象
 */
export function createPatternMatcher(pattern: string) {
  return {
    /**
     * 单次匹配
     */
    matchSingle: (text: string): RegExpMatchArray | null => {
      const regex = new RegExp(pattern, "g");
      regex.lastIndex = 0;
      return regex.exec(text);
    },

    /**
     * 匹配所有
     */
    matchAll: (text: string): RegExpMatchArray[] => {
      const regex = new RegExp(pattern, "g");
      return Array.from(text.matchAll(regex));
    },

    /**
     * 重置匹配器状态
     */
    reset: (): void => {
      // 对于新建的regex，重置不是必需的
    },

    /**
     * 获取原始正则表达式（用于缓存）
     */
    getRegex: (): RegExp => new RegExp(pattern, "g"),
  };
}

/**
 * 纯函数：执行模式匹配并分析结果
 * @param value - 要匹配的字符串
 * @param pattern - 匹配模式
 * @returns 匹配结果信息
 */
export function matchPattern(
  value: string,
  pattern: RegExp | string
): PatternMatchResult {
  const regex =
    typeof pattern === "string" ? new RegExp(pattern, "g") : pattern;
  regex.lastIndex = 0;

  const matches = Array.from(value.matchAll(regex));
  const hasMatch = matches.length > 0;

  let isFullMatch = false;
  let fullMatchStart: number | undefined;
  let fullMatchEnd: number | undefined;

  if (hasMatch && matches.length === 1) {
    const match = matches[0];
    fullMatchStart = match.index!;
    fullMatchEnd = fullMatchStart + match[0].length;
    isFullMatch = fullMatchStart === 0 && fullMatchEnd === value.length;
  }

  return {
    matches,
    hasMatch,
    isFullMatch,
    fullMatchStart,
    fullMatchEnd,
  };
}

/**
 * 纯函数：构建标准化的位置信息对象
 * @param params - 位置参数
 * @param node - 可选的AST节点（用于提取位置信息）
 * @returns 标准化的位置信息
 */
export function buildLocationInfo(
  params: LocationParams,
  node?: t.Node
): { filePath: string; line: number; column: number } {
  return {
    filePath: params.filePath,
    line: params.line ?? node?.loc?.start.line ?? 0,
    column: params.column ?? node?.loc?.start.column ?? 0,
  };
}

/**
 * 纯函数：构建翻译函数调用的AST节点
 * @param callName - 翻译函数名称
 * @param key - 翻译键
 * @param interpolations - 可选的插值对象
 * @returns 翻译调用的AST表达式
 */
export function buildTranslationCall(
  callName: string,
  key: string | number,
  interpolations?: t.ObjectExpression
): t.CallExpression {
  const args: t.Expression[] = [t.stringLiteral(String(key))];

  if (interpolations) {
    args.push(interpolations);
  }

  return t.callExpression(t.identifier(callName), args);
}

/**
 * 纯函数：构建模板字面量AST节点
 * @param parts - 字符串部分数组
 * @param expressions - 表达式数组
 * @returns 模板字面量AST节点
 */
export function buildTemplateLiteral(
  parts: string[],
  expressions: t.Expression[]
): t.TemplateLiteral {
  const quasis = parts.map((part, index) =>
    t.templateElement({ raw: part, cooked: part }, index === parts.length - 1)
  );

  return t.templateLiteral(quasis, expressions);
}

/**
 * 纯函数：构建插值对象AST节点
 * @param expressions - 表达式数组
 * @returns 插值对象AST节点
 */
export function buildInterpolationObject(
  expressions: t.Expression[]
): t.ObjectExpression {
  const properties = expressions.map((expr, i) =>
    t.objectProperty(t.identifier(`arg${i + 1}`), expr)
  );

  return t.objectExpression(properties);
}

/**
 * 纯函数：构建JSX属性AST节点
 * @param attributeName - 属性名称
 * @param callExpression - 翻译调用表达式
 * @returns JSX属性AST节点
 */
export function buildJSXAttribute(
  attributeName: t.JSXIdentifier | t.JSXNamespacedName,
  callExpression: t.Expression
): t.JSXAttribute {
  const jsxExpressionContainer = t.jsxExpressionContainer(callExpression);
  return t.jsxAttribute(attributeName, jsxExpressionContainer);
}

/**
 * 纯函数：构建JSX表达式容器
 * @param expression - 表达式
 * @returns JSX表达式容器
 */
export function buildJSXExpressionContainer(
  expression: t.Expression
): t.JSXExpressionContainer {
  return t.jsxExpressionContainer(expression);
}

/**
 * 纯函数：构建JSX文本节点
 * @param value - 文本值
 * @returns JSX文本节点
 */
export function buildJSXText(value: string): t.JSXText {
  return t.jsxText(value);
}

/**
 * 纯函数：分析字符串中的匹配位置并构建部分替换
 * @param originalValue - 原始字符串
 * @param matches - 匹配结果
 * @param callExpressions - 对应的调用表达式
 * @returns 模板字面量或原始表达式
 */
export function buildPartialReplacement(
  originalValue: string,
  matches: RegExpMatchArray[],
  callExpressions: t.Expression[]
): t.TemplateLiteral | t.Expression {
  if (matches.length === 0) {
    throw new Error("No matches provided for partial replacement");
  }

  if (matches.length === 1 && callExpressions.length === 1) {
    const match = matches[0];
    const matchStart = match.index!;
    const matchEnd = matchStart + match[0].length;

    // 检查是否是完整匹配
    if (matchStart === 0 && matchEnd === originalValue.length) {
      return callExpressions[0];
    }
  }

  // 构建模板字面量进行部分替换
  const parts: string[] = [];
  const expressions: t.Expression[] = [];
  let lastIndex = 0;

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const matchStart = match.index!;
    const matchEnd = matchStart + match[0].length;

    // 添加匹配前的文本
    if (matchStart > lastIndex) {
      parts.push(originalValue.substring(lastIndex, matchStart));
    } else if (parts.length === 0) {
      parts.push("");
    }

    // 添加翻译调用表达式
    expressions.push(callExpressions[i]);

    lastIndex = matchEnd;
  }

  // 添加剩余文本
  if (lastIndex < originalValue.length) {
    parts.push(originalValue.substring(lastIndex));
  } else {
    // 确保 parts 数量比 expressions 多 1
    parts.push("");
  }

  return buildTemplateLiteral(parts, expressions);
}

/**
 * 纯函数：生成JSX元素数组的代码字符串
 * @param elements - JSX元素数组
 * @param generatorOptions - 代码生成选项
 * @returns 生成的代码字符串
 */
export function generateJSXElementsCode(
  elements: t.Node[],
  generatorOptions: GeneratorOptions = {}
): string {
  if (elements.length === 0) return "";

  if (elements.length === 1) {
    const element = elements[0];
    if (t.isJSXText(element)) {
      // 单个文本节点直接返回其值
      return element.value;
    } else {
      // 表达式容器和其他节点正常生成
      return generate(element, generatorOptions).code;
    }
  }

  // 对于多个元素，需要特殊处理JSX文本和表达式的连接
  return elements
    .map(node => {
      if (t.isJSXText(node)) {
        // JSX文本节点直接返回其值，不需要额外的引号或处理
        return node.value;
      } else {
        // 表达式容器和其他节点正常生成
        return generate(node, generatorOptions).code;
      }
    })
    .join("");
}

/**
 * 纯函数：从模板字面量节点提取原始字符串
 * @param node - 模板字面量节点
 * @returns 用于模式匹配的原始字符串
 */
export function extractTemplateRawString(node: t.TemplateLiteral): string {
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
 * 纯函数：从模板字面量节点构建模板文本
 * @param node - 模板字面量节点
 * @returns 模板文本字符串
 */
export function buildTemplateTextFromNode(node: t.TemplateLiteral): string {
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
 * 纯函数：检查文本中是否包含有意义的内容（非空白字符）
 * @param text - 要检查的文本
 * @returns 是否包含有意义内容
 */
export function hasMeaningfulContent(text: string): boolean {
  return /\S/.test(text);
}

/**
 * 纯函数：创建临时AST文件结构用于遍历
 * @param expression - 要包装的表达式
 * @returns 临时文件AST结构
 */
export function createTempASTFile(expression: t.Expression): t.File {
  const tempProgram = t.program([t.expressionStatement(expression)]);
  return t.file(tempProgram, [], []);
}

/**
 * 纯函数：从临时AST文件结构中提取处理后的表达式
 * @param tempFile - 临时文件结构
 * @returns 处理后的表达式
 */
export function extractProcessedExpression(tempFile: t.File): t.Expression {
  if (!tempFile.program.body.length) {
    throw new Error("Temporary file has no statements");
  }
  const processedStatement = tempFile.program.body[0] as t.ExpressionStatement;
  return processedStatement.expression;
}
