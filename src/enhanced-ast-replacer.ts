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
import { createTranslationCall, attachExtractedCommentToNode, parseJSXTextPlaceholders } from "./ast-utils";
import { getDefaultPattern } from "./string-extractor";
import * as tg from "./babel-type-guards";
import { isJSXAttribute } from './frameworks/react-support';
import { StringReplacer } from "./string-replacer";

/**
 * 增强的AST替换器 - 收集替换信息而不直接修改AST
 * 支持基于字符串的精确替换，保持原始代码格式
 */
export function collectReplacementInfo(
  ast: t.File,
  originalCode: string,
  existingValueToKey: Map<string, string | number>,
  extractedStrings: ExtractedString[],
  usedExistingKeysList: UsedExistingKey[],
  translationMethod: string,
  options: TransformOptions,
  filePath: string
): { modified: boolean; changes: ChangeDetail[] } {
  let modified = false;
  const changes: ChangeDetail[] = [];
  const generatedKeysMap = new Map<string, string | number>();

  const effectiveMethodName =
    translationMethod === "default" ? "t" : translationMethod;
  const patternRegex = options?.pattern
    ? new RegExp(options.pattern, "g")
    : new RegExp(getDefaultPattern().source, "g");


  // 智能调用工厂函数，根据是否有自定义 i18nCall 来决定参数
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
        // compact: true,  // 生成紧凑的单行代码
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
    exprs: t.Expression[]
  ): t.TemplateLiteral => {
    const quasis = parts.map((part, i) =>
      t.templateElement({ raw: part, cooked: part }, i === parts.length - 1)
    );
    return t.templateLiteral(quasis, exprs);
  };

  traverse(ast, {
    StringLiteral(path) {
      // Skip checks - 保持原有的跳过逻辑
      if (
        (tg.isCallExpression(path.parent) &&
        tg.isIdentifier(path.parent.callee) &&
        path.parent.callee.name === effectiveMethodName &&
        path.listKey === "arguments") ||
        isJSXAttribute(path.parent) ||
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

      // 处理单个匹配情况
      if (matches.length === 1) {
        const match = matches[0];
        const fullMatch = match[0]; // 完整匹配，包含模式标记
        const extractedValue = match[1]; // 提取的内容
        
        const key = getKeyAndRecord(
          fullMatch, // 使用完整匹配而不是提取的内容
          location,
          existingValueToKey,
          generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        if (key === undefined) return;

        const callExpression = smartCallFactory(effectiveMethodName, key, extractedValue);
        
        // 如果需要添加注释
        if (options.appendExtractedComment) {
          attachExtractedCommentToNode(
            callExpression,
            extractedValue,
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
        const fullMatch = match[0]; // 完整匹配
        const extractedValue = match[1]; // 提取的内容

        // 添加匹配前的文本部分
        if (matchStart > lastIndex) {
          parts.push(nodeValue.substring(lastIndex, matchStart));
        }

        // 处理提取的值
        const key = getKeyAndRecord(
          fullMatch, // 使用完整匹配
          location,
          existingValueToKey,
          generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        if (key === undefined) continue;

        const callExpression = smartCallFactory(effectiveMethodName, key, extractedValue);
        expressions.push(callExpression);
        parts.push(""); // 为表达式占位

        lastIndex = matchEnd;
      }

      // 添加最后剩余的文本
      if (lastIndex < nodeValue.length) {
        parts.push(nodeValue.substring(lastIndex));
      }

      const templateLiteral = buildTemplateLiteral(parts, expressions);
      recordChange(path, path.node, templateLiteral);
    },

    JSXAttribute(path) {
      if (!tg.isJSXAttribute(path.node) || !path.node.value) return;

      const attrValue = path.node.value;
      if (!tg.isStringLiteral(attrValue)) return;

      const nodeValue = attrValue.value;
      const location = {
        filePath,
        line: attrValue.loc?.start.line ?? 0,
        column: attrValue.loc?.start.column ?? 0,
      };

      patternRegex.lastIndex = 0;
      const matches = Array.from(nodeValue.matchAll(patternRegex));

      if (matches.length === 0) return;

      if (matches.length === 1) {
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

        const callExpression = smartCallFactory(effectiveMethodName, key, extractedValue);
        
        if (options.appendExtractedComment) {
          attachExtractedCommentToNode(
            callExpression,
            extractedValue,
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

        if (matchStart > lastIndex) {
          parts.push(nodeValue.substring(lastIndex, matchStart));
        }

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

        const callExpression = smartCallFactory(effectiveMethodName, key, extractedValue);
        expressions.push(callExpression);
        parts.push("");

        lastIndex = matchEnd;
      }

      if (lastIndex < nodeValue.length) {
        parts.push(nodeValue.substring(lastIndex));
      }

      const templateLiteral = buildTemplateLiteral(parts, expressions);
      const jsxExpressionContainer = t.jsxExpressionContainer(templateLiteral);
      const newAttr = t.jsxAttribute(path.node.name, jsxExpressionContainer);
      
      recordChange(path, path.node, newAttr);
    },

    JSXText(path) {
      const nodeValue = path.node.value;
      const location = {
        filePath,
        line: path.node.loc?.start.line ?? 0,
        column: path.node.loc?.start.column ?? 0,
      };

      patternRegex.lastIndex = 0;
      const matches = Array.from(nodeValue.matchAll(patternRegex));

      if (matches.length === 0) return;

      const elements: (t.JSXText | t.JSXExpressionContainer)[] = [];
      let lastIndex = 0;

      for (const match of matches) {
        const matchStart = match.index!;
        const matchEnd = matchStart + match[0].length;
        const fullMatch = match[0];
        const extractedValue = match[1];

        // 添加匹配前的文本
        if (matchStart > lastIndex) {
          const beforeText = nodeValue.substring(lastIndex, matchStart);
          if (beforeText.trim()) {
            elements.push(t.jsxText(beforeText));
          }
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

        // Parse JSX text placeholders to generate interpolation
        const parsedPlaceholders = parseJSXTextPlaceholders(extractedValue);
        
        let callExpression;
        if (parsedPlaceholders && parsedPlaceholders.interpolationObject) {
          // Use canonical text as key and provide interpolation object
          callExpression = smartCallFactory(
            effectiveMethodName, 
            key, 
            extractedValue,
            parsedPlaceholders.interpolationObject
          );
        } else {
          // No placeholders, use simple call
          callExpression = smartCallFactory(effectiveMethodName, key, extractedValue);
        }
        
        if (options.appendExtractedComment) {
          // Use the canonical text for comment (with {argN} format)
          const commentText = parsedPlaceholders ? parsedPlaceholders.canonicalText : extractedValue;
          attachExtractedCommentToNode(
            callExpression,
            commentText,
            options.extractedCommentType || "block"
          );
        }

        elements.push(t.jsxExpressionContainer(callExpression));
        lastIndex = matchEnd;
      }

      // 添加剩余文本
      if (lastIndex < nodeValue.length) {
        const afterText = nodeValue.substring(lastIndex);
        if (afterText.trim()) {
          elements.push(t.jsxText(afterText));
        }
      }

      if (elements.length === 1) {
        recordChange(path, path.node, elements[0]);
      } else if (elements.length > 1) {
        // 对于多个元素，我们需要替换整个JSX元素的children
        // 记录一个特殊的多元素替换
        recordChange(path, path.node, elements, nodeValue);
      }
    },
    TemplateLiteral(path) {
      const quasis = path.node.quasis;
      const expressions = path.node.expressions;
      
      // 重构模板字符串成完整字符串以进行模式匹配
      let fullText = "";
      const textParts: { text: string; isExpression: boolean; index: number }[] = [];
      
      for (let i = 0; i < quasis.length; i++) {
        const quasi = quasis[i];
        const quasiText = quasi.value.raw;
        fullText += quasiText;
        textParts.push({ text: quasiText, isExpression: false, index: i });
        
        if (i < expressions.length) {
          const expr = expressions[i];
          const placeholderText = `\${${generate(expr).code}}`;
          fullText += placeholderText;
          textParts.push({ text: placeholderText, isExpression: true, index: i });
        }
      }

      // 在完整文本中查找匹配
      patternRegex.lastIndex = 0;
      const matches = Array.from(fullText.matchAll(patternRegex));
      
      if (matches.length === 0) {
        return; // 没有匹配，保持原样
      }

      // 如果有匹配，处理第一个匹配（简化处理）
      const match = matches[0];
      const fullMatch = match[0];
      const extractedValue = match[1];
      
      const location = {
        filePath,
        line: path.node.loc?.start.line ?? 0,
        column: path.node.loc?.start.column ?? 0,
      };

      // 处理提取的值 - 让 key-manager 处理标准化
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

      // 检查是否有表达式需要处理为 interpolations
      let interpolations: t.ObjectExpression | undefined;
      if (expressions.length > 0) {
        // 构建 interpolation 对象 { arg1: expr1, arg2: expr2 }
        const properties = expressions.map((expr, i) =>
          t.objectProperty(
            t.identifier(`arg${i + 1}`),
            expr as t.Expression
          )
        );
        interpolations = t.objectExpression(properties);
      }

      // 从 extractedStrings 中获取标准化后的值用于注释
      const standardizedValue = extractedStrings.find(s => s.key === key)?.value || extractedValue;

      const callExpression = smartCallFactory(effectiveMethodName, key, standardizedValue, interpolations);
      
      if (options.appendExtractedComment) {
        attachExtractedCommentToNode(
          callExpression,
          standardizedValue, // 使用标准化后的内容作为注释
          options.extractedCommentType || "block"
        );
      }

      // 替换整个模板字符串为调用表达式
      recordChange(path, path.node, callExpression);
    },
  });

  return { modified, changes };
}

/**
 * 正确生成 JSX 元素数组的代码
 * 处理 JSX 文本节点和表达式容器的正确连接
 */
function generateJSXElementsCode(elements: t.Node[], generatorOptions: any): string {
  if (elements.length === 0) return "";
  if (elements.length === 1) return generate(elements[0], generatorOptions).code;
  
  // 对于多个元素，需要特殊处理 JSX 文本和表达式的连接
  return elements.map(node => {
    if (t.isJSXText(node)) {
      // JSX 文本节点直接返回其值，不需要额外的引号或处理
      return node.value;
    } else {
      // 表达式容器和其他节点正常生成
      return generate(node, generatorOptions).code;
    }
  }).join("");
}

