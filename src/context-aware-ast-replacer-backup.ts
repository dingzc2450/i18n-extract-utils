import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";
import {
  ExtractedString,
  TransformOptions,
  UsedExistingKey,
  ChangeDetail,
} from "./types";
import { getKeyAndRecord } from "./key-manager";
import {
  createTranslationCall,
  attachExtractedCommentToNode,
  parseJSXTextPlaceholders,
} from "./ast-utils";
import { getDefaultPattern } from "./string-extractor";
import * as tg from "./babel-type-guards";
import { isJSXAttribute } from "./frameworks/react-support";
import { StringReplacer } from "./string-replacer";
import { detectCodeContext, ContextInfo } from "./context-detector";
import { SmartImportManager, ImportInfo } from "./smart-import-manager";

/**
 * 上下文感知的AST替换器
 * 根据代码上下文智能选择处理策略
 */
export function collectContextAwareReplacementInfo(
  ast: t.File,
  originalCode: string,
  existingValueToKey: Map<string, string | number>,
  extractedStrings: ExtractedString[],
  usedExistingKeysList: UsedExistingKey[],
  importManager: SmartImportManager,
  options: TransformOptions,
  filePath: string
): {
  modified: boolean;
  changes: ChangeDetail[];
  requiredImports: Set<string>;
} {
  let modified = false;
  const changes: ChangeDetail[] = [];
  const generatedKeysMap = new Map<string, string | number>();
  const requiredImports = new Set<string>();
  const contextCache = new Map<NodePath<t.Node>, ContextInfo>();

  const patternRegex = options?.pattern
    ? new RegExp(options.pattern, "g")
    : new RegExp(getDefaultPattern().source, "g");

  // 支持自定义调用生成 - 智能调用工厂函数，根据是否有自定义 i18nCall 来决定参数
  const smartCallFactory = (callName: string, key: string | number, rawText: string, interpolations?: t.ObjectExpression) => {
    if (options.i18nConfig && options.i18nConfig.i18nCall) {
      // 使用自定义的 i18nCall，只传递原来的3个参数
      return options.i18nConfig.i18nCall(callName, key, rawText);
    } else {
      // 使用默认的 createTranslationCall，支持 interpolations
      return createTranslationCall(callName, key, interpolations);
    }
  };

  const recordChange = (
    path: NodePath<t.Node>,
    originalNode: t.Node,
    replacementNode: t.Node | t.Node[],
    originalText?: string
  ) => {
    if (originalNode.loc) {
      const generatorOptions = { 
        jsescOption: { minimal: true },
        minified: false, // 不压缩变量名，保持可读性
        concise: true   // 使用简洁格式
      };
      const replacementCode = Array.isArray(replacementNode)
        ? generateJSXElementsCode(replacementNode, generatorOptions)
        : generate(replacementNode, generatorOptions).code;

      const originalNodeCode = originalText || generate(originalNode, generatorOptions).code;

      // 从原始代码中提取真实的原始文本
      const realOriginalText = extractOriginalText(
        originalCode,
        originalNode.loc.start.line,
        originalNode.loc.start.column,
        originalNode.loc.end.line,
        originalNode.loc.end.column
      );

      // 计算精确位置
      const { start, end } = StringReplacer.calculatePosition(
        originalCode,
        originalNode.loc.start.line,
        originalNode.loc.start.column,
        realOriginalText.length
      );

      // 生成上下文匹配信息
      const matchContext = StringReplacer.generateMatchContext(
        originalCode,
        originalNode.loc.start.line,
        originalNode.loc.start.column,
        realOriginalText
      );

      changes.push({
        filePath,
        original: realOriginalText,
        replacement: replacementCode,
        line: originalNode.loc.start.line,
        column: originalNode.loc.start.column,
        endLine: originalNode.loc.end.line,
        endColumn: originalNode.loc.end.column,
        start,
        end,
        matchContext,
      });
      modified = true;
    }
  };

  const extractOriginalText = (
    code: string,
    startLine: number,
    startColumn: number,
    endLine: number,
    endColumn: number
  ): string => {
    const lines = code.split('\n');
    
    if (startLine === endLine) {
      // 单行情况
      return lines[startLine - 1].substring(startColumn, endColumn);
    } else {
      // 多行情况
      let result = '';
      for (let i = startLine - 1; i < endLine; i++) {
        if (i === startLine - 1) {
          // 第一行：从startColumn开始
          result += lines[i].substring(startColumn);
        } else if (i === endLine - 1) {
          // 最后一行：到endColumn结束
          result += '\n' + lines[i].substring(0, endColumn);
        } else {
          // 中间行：完整行
          result += '\n' + lines[i];
        }
      }
      return result;
    }
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

  const getContextInfo = (path: NodePath<t.Node>): ContextInfo => {
    if (contextCache.has(path)) {
      return contextCache.get(path)!;
    }

    const context = detectCodeContext(path);
    contextCache.set(path, context);
    return context;
  };

  const getImportInfoForContext = (context: ContextInfo): ImportInfo => {
    const importInfo = importManager.getImportInfo(context);
    // 序列化导入信息以便后续处理
    requiredImports.add(JSON.stringify(importInfo));
    return importInfo;
  };

  traverse(ast, {
    StringLiteral(path) {
      // 添加跳过逻辑 - 参考 enhanced-ast-replacer.ts
      if (
        path.parentPath &&
        isJSXAttribute(path.parentPath.node) &&
        path.parentPath.node.value === path.node
      ) {
        return;
      }

      // 检测代码上下文
      const context = getContextInfo(path);
      const importInfo = getImportInfoForContext(context);
      const effectiveMethodName = importInfo.callName;

      // 跳过已经是翻译调用的字符串
      if (
        (tg.isCallExpression(path.parent) &&
        tg.isIdentifier(path.parent.callee) &&
        path.parent.callee.name === effectiveMethodName &&
        path.listKey === "arguments") ||
        tg.isImportDeclaration(path.parent) ||
        tg.isExportDeclaration(path.parent)
      ) {
        return;
      }

      const nodeValue = path.node.value;
      const location = {
        filePath,
        line: path.node.loc?.start.line ?? 0,
        column: path.node.loc?.start.column ?? 0,
      };

      patternRegex.lastIndex = 0;
      const matches = Array.from(nodeValue.matchAll(patternRegex));

      if (matches.length === 0) return;

      if (matches.length === 1) {
        // 单个匹配的情况
        const match = matches[0];
        const fullMatch = match[0];
        const extractedValue = match[1];

        const key = getKeyAndRecord(
          fullMatch,
          location,
          existingValueToKey,
          generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        if (key === undefined) return;

        // 从 extractedStrings 中获取标准化后的值
        const standardizedValue =
          extractedStrings.find((s) => s.key === key)?.value || extractedValue;

        const callExpression = smartCallFactory(
          importInfo.callName,
          key,
          standardizedValue
        );

        // 如果需要添加注释
        if (options.appendExtractedComment) {
          attachExtractedCommentToNode(
            callExpression,
            standardizedValue,
            options.extractedCommentType || "block"
          );
        }

        recordChange(path, path.node, callExpression);
        return;
      }

      // 处理多个匹配的情况 - 构建模板字符串
      const parts: string[] = [];
      const expressions: t.Expression[] = [];
      let lastIndex = 0;

      for (const match of matches) {
        const matchStart = match.index!;
        const matchEnd = matchStart + match[0].length;
        const fullMatch = match[0];
        const extractedValue = match[1];

        // 添加匹配前的文本部分
        if (matchStart > lastIndex) {
          parts.push(nodeValue.substring(lastIndex, matchStart));
        }

        // 处理提取的值
        const key = getKeyAndRecord(
          fullMatch,
          location,
          existingValueToKey,
          generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        if (key === undefined) continue;

        const standardizedValue =
          extractedStrings.find((s) => s.key === key)?.value || extractedValue;
        const callExpression = smartCallFactory(
          importInfo.callName,
          key,
          standardizedValue
        );

        if (options.appendExtractedComment) {
          attachExtractedCommentToNode(
            callExpression,
            standardizedValue,
            options.extractedCommentType || "block"
          );
        }

        expressions.push(callExpression);
        parts.push(""); // 为表达式占位

        lastIndex = matchEnd;
      }

      // 添加剩余的文本
      if (lastIndex < nodeValue.length) {
        parts.push(nodeValue.substring(lastIndex));
      }

      const templateLiteral = buildTemplateLiteral(parts, expressions);
      recordChange(path, path.node, templateLiteral);
    },
        );

        if (key === undefined) continue;

        const standardizedValue =
          extractedStrings.find((s) => s.key === key)?.value || extractedValue;
        const callExpression = callFactory(
          importInfo.callName,
          key,
          standardizedValue
        );

        if (options.appendExtractedComment) {
          attachExtractedCommentToNode(
            callExpression,
            standardizedValue,
            options.extractedCommentType || "block"
          );
        }

        expressions.push(callExpression);
        parts.push("");

        lastIndex = matchEnd;
      }

      // 添加剩余的文本
      if (lastIndex < nodeValue.length) {
        parts.push(nodeValue.substring(lastIndex));
      }

      const templateLiteral = buildTemplateLiteral(parts, expressions);
      recordChange(path, path.node, templateLiteral);
    },

    JSXAttribute(path) {
      if (!isJSXAttribute(path.node) || !path.node.value) return;
      if (!t.isStringLiteral(path.node.value)) return;

      const nodeValue = path.node.value.value;
      const location = {
        filePath,
        line: path.node.loc?.start.line ?? 0,
        column: path.node.loc?.start.column ?? 0,
      };

      patternRegex.lastIndex = 0;
      const matches = Array.from(nodeValue.matchAll(patternRegex));

      if (matches.length === 0) return;

      // 检测代码上下文
      const context = getContextInfo(path);
      const importInfo = getImportInfoForContext(context);

      if (matches.length === 1) {
        // 单个匹配的JSX属性
        const match = matches[0];
        const fullMatch = match[0];
        const extractedValue = match[1];

        const key = getKeyAndRecord(
          fullMatch,
          location,
          existingValueToKey,
          generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        if (key === undefined) return;

        const standardizedValue =
          extractedStrings.find((s) => s.key === key)?.value || extractedValue;
        const callExpression = callFactory(
          importInfo.callName,
          key,
          standardizedValue
        );

        if (options.appendExtractedComment) {
          attachExtractedCommentToNode(
            callExpression,
            standardizedValue,
            options.extractedCommentType || "block"
          );
        }

        const jsxExpressionContainer = t.jsxExpressionContainer(callExpression);
        const newAttr = t.jsxAttribute(path.node.name, jsxExpressionContainer);

        recordChange(path, path.node, newAttr);
        return;
      }

      // 处理多个匹配的JSX属性
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
        }

        // 处理提取的值
        const key = getKeyAndRecord(
          fullMatch,
          location,
          existingValueToKey,
          generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        if (key === undefined) continue;

        const standardizedValue =
          extractedStrings.find((s) => s.key === key)?.value || extractedValue;
        const callExpression = callFactory(
          importInfo.callName,
          key,
          standardizedValue
        );

        if (options.appendExtractedComment) {
          attachExtractedCommentToNode(
            callExpression,
            standardizedValue,
            options.extractedCommentType || "block"
          );
        }

        expressions.push(callExpression);
        parts.push("");

        lastIndex = matchEnd;
      }

      // 添加剩余的文本
      if (lastIndex < nodeValue.length) {
        parts.push(nodeValue.substring(lastIndex));
      }

      const templateLiteral = buildTemplateLiteral(parts, expressions);
      const jsxExpressionContainer = t.jsxExpressionContainer(templateLiteral);
      const newAttr = t.jsxAttribute(path.node.name, jsxExpressionContainer);

      recordChange(path, path.node, newAttr);
    },

    TemplateLiteral(path) {
      const quasis = path.node.quasis;
      const expressions = path.node.expressions;

      // 重构模板字符串成完整字符串以进行模式匹配
      let fullText = "";
      const textParts: {
        text: string;
        isExpression: boolean;
        index: number;
      }[] = [];

      for (let i = 0; i < quasis.length; i++) {
        const quasi = quasis[i];
        const quasiText = quasi.value.raw;
        fullText += quasiText;
        textParts.push({ text: quasiText, isExpression: false, index: i });

        if (i < expressions.length) {
          const expr = expressions[i];
          const placeholderText = `\${${generate(expr).code}}`;
          fullText += placeholderText;
          textParts.push({
            text: placeholderText,
            isExpression: true,
            index: i,
          });
        }
      }

      // 在完整文本中查找匹配
      patternRegex.lastIndex = 0;
      const matches = Array.from(fullText.matchAll(patternRegex));

      if (matches.length === 0) {
        return; // 没有匹配，保持原样
      }

      // 检测代码上下文
      const context = getContextInfo(path);
      const importInfo = getImportInfoForContext(context);

      // 如果有匹配，处理第一个匹配（简化处理）
      const match = matches[0];
      const fullMatch = match[0];
      const extractedValue = match[1];

      const location = {
        filePath,
        line: path.node.loc?.start.line ?? 0,
        column: path.node.loc?.start.column ?? 0,
      };

      const key = getKeyAndRecord(
        fullMatch,
        location,
        existingValueToKey,
        generatedKeysMap,
        extractedStrings,
        usedExistingKeysList,
        options
      );

      if (key === undefined) return;

      // 从 extractedStrings 中获取标准化后的值用于注释
      const standardizedValue =
        extractedStrings.find((s) => s.key === key)?.value || extractedValue;

      const callExpression = callFactory(
        importInfo.callName,
        key,
        standardizedValue
      );

      if (options.appendExtractedComment) {
        attachExtractedCommentToNode(
          callExpression,
          standardizedValue,
          options.extractedCommentType || "block"
        );
      }

      // 替换整个模板字符串为调用表达式
      recordChange(path, path.node, callExpression);
    },

    JSXText(path) {
      const nodeValue = path.node.value;

      // 跳过只包含空白字符的文本节点
      if (!nodeValue.trim()) return;

      const location = {
        filePath,
        line: path.node.loc?.start.line ?? 0,
        column: path.node.loc?.start.column ?? 0,
      };

      patternRegex.lastIndex = 0;
      const matches = Array.from(nodeValue.matchAll(patternRegex));

      if (matches.length === 0) return;

      // 检测代码上下文
      const context = getContextInfo(path);
      const importInfo = getImportInfoForContext(context);

      if (matches.length === 1) {
        // 单个匹配的JSX文本
        const match = matches[0];
        const fullMatch = match[0];
        const extractedValue = match[1];

        const key = getKeyAndRecord(
          fullMatch,
          location,
          existingValueToKey,
          generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        if (key === undefined) return;

        const standardizedValue =
          extractedStrings.find((s) => s.key === key)?.value || extractedValue;
        const callExpression = callFactory(
          importInfo.callName,
          key,
          standardizedValue
        );

        if (options.appendExtractedComment) {
          attachExtractedCommentToNode(
            callExpression,
            standardizedValue,
            options.extractedCommentType || "block"
          );
        }

        const jsxExpressionContainer = t.jsxExpressionContainer(callExpression);

        recordChange(path, path.node, jsxExpressionContainer);
        return;
      }

      // 处理多个匹配的JSX文本
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
        }

        // 处理提取的值
        const key = getKeyAndRecord(
          fullMatch,
          location,
          existingValueToKey,
          generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        if (key === undefined) continue;

        const standardizedValue =
          extractedStrings.find((s) => s.key === key)?.value || extractedValue;
        const callExpression = callFactory(
          importInfo.callName,
          key,
          standardizedValue
        );

        if (options.appendExtractedComment) {
          attachExtractedCommentToNode(
            callExpression,
            standardizedValue,
            options.extractedCommentType || "block"
          );
        }

        expressions.push(callExpression);
        parts.push("");

        lastIndex = matchEnd;
      }

      // 添加剩余的文本
      if (lastIndex < nodeValue.length) {
        parts.push(nodeValue.substring(lastIndex));
      }

      const templateLiteral = buildTemplateLiteral(parts, expressions);
      const jsxExpressionContainer = t.jsxExpressionContainer(templateLiteral);

      recordChange(path, path.node, jsxExpressionContainer);
    },
  });

  return { modified, changes, requiredImports };
}

/**
 * 构建模板字符串
 */
const buildTemplateLiteral = (
  parts: string[],
  expressions: t.Expression[]
): t.TemplateLiteral => {
  const quasis = parts.map((part, index) =>
    t.templateElement({ raw: part, cooked: part }, index === parts.length - 1)
  );
  return t.templateLiteral(quasis, expressions);
};
