import type { NodePath } from "@babel/traverse";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";
import type { ExtractedString, UsedExistingKey, ChangeDetail } from "./types";
import { getKeyAndRecord } from "./key-manager";
import {
  createTranslationCall,
  attachExtractedCommentToNode,
  parseJSXTextPlaceholders,
} from "./core/ast-utils";
import { getDefaultPattern } from "./core/utils";
import type { NormalizedTransformOptions } from "./core/config-normalizer";
import { getI18nCall } from "./core/config-normalizer";
import * as tg from "./babel-type-guards";
import { StringReplacer } from "./string-replacer";
import type { ContextInfo } from "./context-detector";
import { detectCodeContext } from "./context-detector";
import type { SmartImportManager, ImportInfo } from "./smart-import-manager";
import { isJSXAttribute } from "./babel-type-guards";

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
  options: NormalizedTransformOptions,
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

  const patternRegex = options?.pattern
    ? new RegExp(options.pattern, "g")
    : new RegExp(getDefaultPattern().source, "g");

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

  const extractOriginalText = (
    code: string,
    startLine: number,
    startColumn: number,
    endLine: number,
    endColumn: number
  ): string => {
    const lines = code.split("\n");

    if (startLine === endLine) {
      // 单行情况
      return lines[startLine - 1].substring(startColumn, endColumn);
    } else {
      // 多行情况
      let result = "";
      for (let i = startLine - 1; i < endLine; i++) {
        if (i === startLine - 1) {
          // 第一行：从startColumn开始
          result += lines[i].substring(startColumn);
        } else if (i === endLine - 1) {
          // 最后一行：到endColumn结束
          result += "\n" + lines[i].substring(0, endColumn);
        } else {
          // 中间行：完整行
          result += "\n" + lines[i];
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
      // 检测代码上下文
      const context = getContextInfo(path);
      const importInfo = getImportInfoForContext(context);
      const effectiveMethodName = importInfo.callName;

      // 跳过逻辑
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

      if (matches.length === 1) {
        // 单个匹配的情况 - 检查是否是完整替换还是部分替换
        const match = matches[0];
        const fullMatch = match[0];
        const extractedValue = match[1];
        const matchStart = match.index!;
        const matchEnd = matchStart + fullMatch.length;

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
          extractedStrings.find(s => s.key === key)?.value || extractedValue;

        const callExpression = smartCallFactory(
          importInfo.callName,
          key,
          standardizedValue,
          undefined,
          standardizedValue // 传递原始文本用于自定义 i18nCall
        );

        // 如果需要添加注释
        if (options.appendExtractedComment) {
          attachExtractedCommentToNode(
            callExpression,
            standardizedValue,
            options.extractedCommentType || "block"
          );
        }

        // 检查是否是完整替换（整个字符串就是模式）
        const isFullReplacement =
          matchStart === 0 && matchEnd === nodeValue.length;

        if (isFullReplacement) {
          // 完整替换，直接使用callExpression
          recordPendingReplacement(path, path.node, callExpression);
        } else {
          // 部分替换，需要保留周围的文本，转换为模板字符串
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

          const templateLiteral = buildTemplateLiteral(parts, expressions);
          recordPendingReplacement(path, path.node, templateLiteral);
        }
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
          extractedStrings.find(s => s.key === key)?.value || extractedValue;
        const callExpression = smartCallFactory(
          importInfo.callName,
          key,
          standardizedValue,
          undefined,
          standardizedValue // 传递原始文本用于自定义 i18nCall
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
      recordPendingReplacement(path, path.node, templateLiteral);
    },

    JSXAttribute(path) {
      if (!tg.isJSXAttribute(path.node) || !path.node.value) return;
      if (!tg.isStringLiteral(path.node.value)) return;

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
          extractedStrings.find(s => s.key === key)?.value || extractedValue;
        const callExpression = smartCallFactory(
          importInfo.callName,
          key,
          standardizedValue,
          undefined,
          standardizedValue // 传递原始文本用于自定义 i18nCall
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

        recordPendingReplacement(path, path.node, newAttr);
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
          extractedStrings.find(s => s.key === key)?.value || extractedValue;
        const callExpression = smartCallFactory(
          importInfo.callName,
          key,
          standardizedValue,
          undefined,
          standardizedValue // 传递原始文本用于自定义 i18nCall
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

      recordPendingReplacement(path, path.node, newAttr);
    },

    TemplateLiteral(path) {
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

      // --- Handle TemplateLiterals WITH existing expressions ---
      if (node.expressions.length > 0) {
        // 构建字符串表示以进行模式匹配，使用占位符
        let originalRawStringForPatternCheck = "";
        node.quasis.forEach((quasi, i) => {
          originalRawStringForPatternCheck += quasi.value.raw;
          if (i < node.expressions.length) {
            // 使用简单一致的占位符进行匹配
            originalRawStringForPatternCheck += "${...}";
          }
        });

        // 使用非全局模式检查整体结构是否匹配
        const singleMatchPattern = options?.pattern
          ? new RegExp(options.pattern)
          : new RegExp(getDefaultPattern().source);

        const match = singleMatchPattern.exec(originalRawStringForPatternCheck);

        // 检查结构是否匹配模式
        if (match && match[1] !== undefined) {
          // 调用 getKeyAndRecord 处理包含占位符的字符串
          // getKeyAndRecord 会内部派生规范值 ("...{argN}...")
          const translationKey = getKeyAndRecord(
            originalRawStringForPatternCheck, // 传递包含 ${...} 的字符串
            location,
            existingValueToKey,
            generatedKeysMap,
            extractedStrings,
            usedExistingKeysList,
            options
          );

          if (translationKey !== undefined) {
            // 处理表达式中的嵌套字符串替换
            const processedExpressions = node.expressions.map(expr => {
              // 克隆表达式并递归替换其中的字符串字面量
              const clonedExpr = t.cloneNode(expr);

              // 使用 traverse 遍历表达式，查找并替换嵌套的字符串字面量和模板字面量
              traverse(
                clonedExpr as any,
                {
                  StringLiteral(nestedPath) {
                    const nodeValue = nestedPath.node.value;

                    // 检查是否匹配模式
                    const pattern = options?.pattern
                      ? new RegExp(options.pattern)
                      : new RegExp(getDefaultPattern().source);

                    const match = pattern.exec(nodeValue);
                    if (match && match[1] !== undefined) {
                      // 这是一个可提取的字符串，主动提取它
                      // const extractedValue = match[1];
                      const fullMatch = match[0];

                      // 构建嵌套字符串的位置信息
                      const nestedLocation = {
                        filePath,
                        line: nestedPath.node.loc?.start.line ?? location.line,
                        column:
                          nestedPath.node.loc?.start.column ?? location.column,
                      };

                      // 主动调用 getKeyAndRecord 提取这个嵌套字符串
                      const nestedKey = getKeyAndRecord(
                        fullMatch,
                        nestedLocation,
                        existingValueToKey,
                        generatedKeysMap,
                        extractedStrings,
                        usedExistingKeysList,
                        options
                      );

                      if (nestedKey !== undefined) {
                        // 创建翻译调用的AST节点
                        const callExpression = t.callExpression(
                          t.identifier(importInfo.callName),
                          [t.stringLiteral(String(nestedKey))]
                        );

                        nestedPath.replaceWith(callExpression);
                      }
                    }
                  },

                  TemplateLiteral(nestedTemplatePath) {
                    // 递归处理嵌套的模板字面量
                    // 跳过tagged template literals
                    if (
                      tg.isTaggedTemplateExpression(nestedTemplatePath.parent)
                    )
                      return;

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
                      const singleMatchPattern = options?.pattern
                        ? new RegExp(options.pattern)
                        : new RegExp(getDefaultPattern().source);

                      const nestedMatch = singleMatchPattern.exec(
                        nestedOriginalRawString
                      );

                      if (nestedMatch && nestedMatch[1] !== undefined) {
                        // 构建嵌套模板字面量的位置信息
                        const nestedLocation = {
                          filePath,
                          line: nestedNode.loc?.start.line ?? location.line,
                          column:
                            nestedNode.loc?.start.column ?? location.column,
                        };

                        // 主动调用 getKeyAndRecord 提取这个嵌套模板字面量
                        const nestedKey = getKeyAndRecord(
                          nestedOriginalRawString,
                          nestedLocation,
                          existingValueToKey,
                          generatedKeysMap,
                          extractedStrings,
                          usedExistingKeysList,
                          options
                        );

                        if (nestedKey !== undefined) {
                          // 递归处理嵌套模板字面量的表达式
                          const nestedProcessedExpressions =
                            nestedNode.expressions.map(nestedExpr => {
                              // 对于嵌套表达式，我们直接检查是否有匹配的字符串字面量
                              // 由于这已经是相当深的嵌套，我们保持简单的处理方式
                              if (t.isConditionalExpression(nestedExpr)) {
                                // 处理三元表达式 condition ? t("key1") : t("key2")
                                let consequent = nestedExpr.consequent;
                                let alternate = nestedExpr.alternate;

                                // 处理 consequent
                                if (t.isStringLiteral(consequent)) {
                                  const consequentValue = consequent.value;
                                  const pattern = options?.pattern
                                    ? new RegExp(options.pattern)
                                    : new RegExp(getDefaultPattern().source);

                                  const match = pattern.exec(consequentValue);
                                  if (match && match[1] !== undefined) {
                                    // const extractedValue = match[1];
                                    const fullMatch = match[0];

                                    const deepLocation = {
                                      filePath,
                                      line:
                                        consequent.loc?.start.line ??
                                        location.line,
                                      column:
                                        consequent.loc?.start.column ??
                                        location.column,
                                    };

                                    const deepKey = getKeyAndRecord(
                                      fullMatch,
                                      deepLocation,
                                      existingValueToKey,
                                      generatedKeysMap,
                                      extractedStrings,
                                      usedExistingKeysList,
                                      options
                                    );

                                    if (deepKey !== undefined) {
                                      consequent = t.callExpression(
                                        t.identifier(importInfo.callName),
                                        [t.stringLiteral(String(deepKey))]
                                      );
                                    }
                                  }
                                }

                                // 处理 alternate
                                if (t.isStringLiteral(alternate)) {
                                  const alternateValue = alternate.value;
                                  const pattern = options?.pattern
                                    ? new RegExp(options.pattern)
                                    : new RegExp(getDefaultPattern().source);

                                  const match = pattern.exec(alternateValue);
                                  if (match && match[1] !== undefined) {
                                    // const extractedValue = match[1];
                                    const fullMatch = match[0];

                                    const deepLocation = {
                                      filePath,
                                      line:
                                        alternate.loc?.start.line ??
                                        location.line,
                                      column:
                                        alternate.loc?.start.column ??
                                        location.column,
                                    };

                                    const deepKey = getKeyAndRecord(
                                      fullMatch,
                                      deepLocation,
                                      existingValueToKey,
                                      generatedKeysMap,
                                      extractedStrings,
                                      usedExistingKeysList,
                                      options
                                    );

                                    if (deepKey !== undefined) {
                                      alternate = t.callExpression(
                                        t.identifier(importInfo.callName),
                                        [t.stringLiteral(String(deepKey))]
                                      );
                                    }
                                  }
                                }

                                return t.conditionalExpression(
                                  nestedExpr.test,
                                  consequent,
                                  alternate
                                );
                              }

                              return nestedExpr;
                            });

                          // 构建嵌套模板字面量的 interpolation 对象
                          const nestedProperties =
                            nestedProcessedExpressions.map((nestedExpr, i) =>
                              t.objectProperty(
                                t.identifier(`arg${i + 1}`),
                                nestedExpr as t.Expression
                              )
                            );
                          const nestedInterpolations =
                            t.objectExpression(nestedProperties);

                          // 获取标准化后的值
                          const nestedStandardizedValue =
                            extractedStrings.find(s => s.key === nestedKey)
                              ?.value || nestedMatch[1];

                          // 创建翻译调用替换嵌套模板字面量
                          const nestedReplacementNode = smartCallFactory(
                            importInfo.callName,
                            nestedKey,
                            nestedStandardizedValue,
                            nestedInterpolations
                          );

                          nestedTemplatePath.replaceWith(nestedReplacementNode);
                        }
                      }
                    }
                  },
                },
                path.scope,
                path
              );

              return clonedExpr;
            });

            // 构建 interpolation 对象 { arg1: expr1, arg2: expr2 }
            const properties = processedExpressions.map((expr, i) =>
              t.objectProperty(
                t.identifier(`arg${i + 1}`), // key 是 argN
                expr as t.Expression // value 是处理后的表达式
              )
            );
            const interpolations = t.objectExpression(properties);

            const originalNode = path.node;
            // 提取去除分隔符的原始文本用于 i18nCall
            const pattern = options?.pattern
              ? new RegExp(options.pattern)
              : new RegExp(getDefaultPattern().source);
            const rawTextMatch = pattern.exec(originalRawStringForPatternCheck);
            const rawText = rawTextMatch
              ? rawTextMatch[1]
              : originalRawStringForPatternCheck;

            // 从 extractedStrings 中获取标准化后的值
            const standardizedValue =
              extractedStrings.find(s => s.key === translationKey)?.value ||
              rawText;

            // 构造原始模板字符串文本，去除分隔符并将实际的表达式替换为 ${...} 占位符
            let originalTemplateText = "";
            node.quasis.forEach((quasi, i) => {
              originalTemplateText += quasi.value.raw;
              if (i < node.expressions.length) {
                originalTemplateText += "${...}";
              }
            });

            // 去除分隔符，得到干净的原始文本
            const cleanOriginalText =
              pattern.exec(originalTemplateText)?.[1] || originalTemplateText;

            const replacementNode = smartCallFactory(
              importInfo.callName,
              translationKey,
              standardizedValue,
              interpolations, // 传递 interpolations 对象
              cleanOriginalText // 传递去除分隔符的原始文本用于自定义 i18nCall
            );

            // 插入注释
            if (options.appendExtractedComment) {
              attachExtractedCommentToNode(
                replacementNode,
                standardizedValue,
                options.extractedCommentType || "block"
              );
            }

            recordPendingReplacement(path, originalNode, replacementNode);
          }
        }
        return; // 处理了有表达式的情况，不继续执行
      }

      // --- Handle TemplateLiterals WITHOUT expressions (原有逻辑) ---
      const nodeValue = node.quasis.map(q => q.value.raw).join("");

      patternRegex.lastIndex = 0;
      if (!patternRegex.test(nodeValue)) {
        return;
      }
      patternRegex.lastIndex = 0;

      // 处理无表达式的模板字符串
      const matches = Array.from(nodeValue.matchAll(patternRegex));

      if (matches.length === 1) {
        // 单个匹配 - 检查是否是完整替换还是部分替换
        const match = matches[0];
        const fullMatch = match[0];
        const extractedValue = match[1];
        const matchStart = match.index!;
        const matchEnd = matchStart + fullMatch.length;

        const key = getKeyAndRecord(
          fullMatch,
          location,
          existingValueToKey,
          generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        if (key !== undefined) {
          const callExpression = smartCallFactory(
            importInfo.callName,
            key,
            extractedValue,
            undefined,
            extractedValue
          );

          if (options.appendExtractedComment) {
            attachExtractedCommentToNode(
              callExpression,
              extractedValue,
              options.extractedCommentType || "block"
            );
          }

          // 检查是否是完整替换（整个模板字符串就是模式）
          const isFullReplacement =
            matchStart === 0 && matchEnd === nodeValue.length;

          if (isFullReplacement) {
            // 完整替换，直接使用callExpression
            recordPendingReplacement(path, path.node, callExpression);
          } else {
            // 部分替换，需要保留周围的文本
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

            const templateLiteral = buildTemplateLiteral(parts, expressions);
            recordPendingReplacement(path, path.node, templateLiteral);
          }
        }
      } else if (matches.length > 1) {
        // 多个匹配，构建混合的模板字面量
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
            const beforeText = nodeValue.substring(lastIndex, matchStart);
            parts.push(beforeText);
          } else if (parts.length === 0) {
            parts.push("");
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

          if (key !== undefined) {
            const callExpression = smartCallFactory(
              importInfo.callName,
              key,
              extractedValue,
              undefined,
              extractedValue
            );

            if (options.appendExtractedComment) {
              attachExtractedCommentToNode(
                callExpression,
                extractedValue,
                options.extractedCommentType || "block"
              );
            }

            expressions.push(callExpression);
            parts.push("");
          } else {
            // 如果无法生成key，保留原文本
            const currentPart = parts[parts.length - 1] || "";
            parts[parts.length - 1] = currentPart + fullMatch;
          }

          lastIndex = matchEnd;
        }

        // 添加剩余文本
        if (lastIndex < nodeValue.length) {
          const afterText = nodeValue.substring(lastIndex);
          if (parts.length > 0) {
            parts[parts.length - 1] += afterText;
          } else {
            parts.push(afterText);
          }
        }

        if (expressions.length > 0) {
          const templateLiteral = buildTemplateLiteral(parts, expressions);
          recordPendingReplacement(path, path.node, templateLiteral);
        }
      }
      return;
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
        const matchStart = match.index!;
        const matchEnd = matchStart + fullMatch.length;

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

        // Parse JSX text placeholders to generate interpolation
        const parsedPlaceholders = parseJSXTextPlaceholders(extractedValue);

        let callExpression;
        if (parsedPlaceholders && parsedPlaceholders.interpolationObject) {
          // Use canonical text as key and provide interpolation object
          callExpression = smartCallFactory(
            importInfo.callName,
            key,
            parsedPlaceholders.canonicalText,
            parsedPlaceholders.interpolationObject
          );
        } else {
          // No placeholders, use simple call
          callExpression = smartCallFactory(
            importInfo.callName,
            key,
            extractedValue,
            undefined,
            extractedValue
          );
        }

        if (options.appendExtractedComment) {
          // Use the canonical text for comment (with {argN} format)
          const commentText = parsedPlaceholders
            ? parsedPlaceholders.canonicalText
            : extractedValue;
          attachExtractedCommentToNode(
            callExpression,
            commentText,
            options.extractedCommentType || "block"
          );
        }

        const jsxExpressionContainer = t.jsxExpressionContainer(callExpression);

        // 检查是否有前后文本需要保留
        const beforeText = nodeValue.substring(0, matchStart);
        const afterText = nodeValue.substring(matchEnd);
        const hasBeforeText = /\S/.test(beforeText);
        const hasAfterText = /\S/.test(afterText);

        if (!hasBeforeText && !hasAfterText) {
          // 没有前后文本，直接替换
          recordPendingReplacement(path, path.node, jsxExpressionContainer);
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

          recordPendingReplacement(path, path.node, elements, nodeValue);
        }
        return;
      }

      // 处理多个匹配的JSX文本
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
          if (/\S/.test(beforeText)) {
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
            importInfo.callName,
            key,
            parsedPlaceholders.canonicalText,
            parsedPlaceholders.interpolationObject
          );
        } else {
          // No placeholders, use simple call
          callExpression = smartCallFactory(
            importInfo.callName,
            key,
            extractedValue,
            undefined,
            extractedValue
          );
        }

        if (options.appendExtractedComment) {
          // Use the canonical text for comment (with {argN} format)
          const commentText = parsedPlaceholders
            ? parsedPlaceholders.canonicalText
            : extractedValue;
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
        if (/\S/.test(afterText)) {
          elements.push(t.jsxText(afterText));
        }
      }

      if (elements.length === 1) {
        recordPendingReplacement(path, path.node, elements[0]);
      } else if (elements.length > 1) {
        // 对于多个元素，我们需要替换整个JSX元素的children
        // 记录一个特殊的多元素替换
        recordPendingReplacement(path, path.node, elements, nodeValue);
      }
    },
  });

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

  // 只处理顶级替换，避免嵌套冲突

  for (const [, replacement] of pendingReplacements.entries()) {
    if (!replacement.isTopLevel) continue; // 跳过非顶级替换

    const { originalNode, replacementNode } = replacement;

    if (originalNode.loc) {
      const generatorOptions = {
        jsescOption: { minimal: true },
        minified: false,
        concise: true,
      };
      const replacementCode = Array.isArray(replacementNode)
        ? generateJSXElementsCode(replacementNode, generatorOptions)
        : generate(replacementNode, generatorOptions).code;

      const realOriginalText = extractOriginalText(
        originalCode,
        originalNode.loc.start.line,
        originalNode.loc.start.column,
        originalNode.loc.end.line,
        originalNode.loc.end.column
      );

      const { start, end } = StringReplacer.calculatePosition(
        originalCode,
        originalNode.loc.start.line,
        originalNode.loc.start.column,
        realOriginalText.length
      );

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
  }

  return { modified, changes, requiredImports };
}

/**
 * 正确生成 JSX 元素数组的代码
 * 处理 JSX 文本节点和表达式容器的正确连接
 */
function generateJSXElementsCode(
  elements: t.Node[],
  generatorOptions: any
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
