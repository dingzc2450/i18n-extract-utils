import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";
import {
  ExtractedString,
  TransformOptions,
  UsedExistingKey,
  ChangeDetail,
} from "../types";
import { getKeyAndRecord } from "../key-manager";
import { createTranslationCall, attachExtractedCommentToNode, parseJSXTextPlaceholders } from "../core/ast-utils";
import { getDefaultPattern } from "../core/utils";
import * as tg from "../babel-type-guards";
import { isJSXAttribute } from "../babel-type-guards";

/**
 * Traverses the AST to replace matched strings/JSX/templates with translation function calls.
 * @returns An object indicating if any modifications were made and a list of detailed changes.
 */
export function replaceStringsWithTCalls(
  ast: t.File,
  existingValueToKey: Map<string, string | number>,
  extractedStrings: ExtractedString[],
  usedExistingKeysList: UsedExistingKey[],
  translationMethod: string,
  options: TransformOptions,
  filePath: string
): { modified: boolean; changes: ChangeDetail[] } {
  // ... recordChange, buildTemplateLiteral, patternRegex, etc. ...
  let modified = false;
  const changes: ChangeDetail[] = [];
  const generatedKeysMap = new Map<string, string | number>();

  const effectiveMethodName =
    translationMethod === "default" ? "t" : translationMethod;
  const patternRegex = options?.pattern
    ? new RegExp(options.pattern, "g")
    : new RegExp(getDefaultPattern().source, "g");

  // 支持自定义调用生成
  const callFactory = (options.i18nConfig && options.i18nConfig.i18nCall) || ((callName, key, rawText) => createTranslationCall(callName, key));

  const recordChange = (
    path: NodePath<t.Node>,
    originalNode: t.Node,
    replacementNode: t.Node | t.Node[]
  ) => {
    if (originalNode.loc) {
      const replacementCode = Array.isArray(replacementNode)
        ? replacementNode.map((n) => generate(n).code).join("")
        : generate(replacementNode).code;
      changes.push({
        filePath,
        original: generate(originalNode).code,
        replacement: replacementCode,
        line: originalNode.loc.start.line,
        column: originalNode.loc.start.column,
        endLine: originalNode.loc.end.line,
        endColumn: originalNode.loc.end.column,
      });
      modified = true;
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
    // ... StringLiteral, JSXAttribute, JSXText visitors ...
    StringLiteral(path) {
        // ... existing StringLiteral logic ...
        // --- Skip checks ---
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
        // --- End Skip checks ---

        const nodeValue = path.node.value;
        const location = {
            filePath,
            line: path.node.loc?.start.line ?? 0,
            column: path.node.loc?.start.column ?? 0,
        };

        patternRegex.lastIndex = 0;
        if (!patternRegex.test(nodeValue)) {
            return;
        }
        patternRegex.lastIndex = 0;

        const stringParts: string[] = [];
        const expressions: t.Expression[] = [];
        let lastIndex = 0;
        let match;
        let madeChangeInString = false;
        let firstMatchIndex = -1;
        let lastMatchedTextWithDelimiters = "";
        let lastMatch = null;

        // 支持自定义调用生成
        const callFactory = (options.i18nConfig && options.i18nConfig.i18nCall) || ((callName, key, rawText) => createTranslationCall(callName, key));

        while ((match = patternRegex.exec(nodeValue)) !== null) {
            if (firstMatchIndex === -1) {
                firstMatchIndex = match.index;
            }
            const matchStartIndex = match.index;
            const matchedTextWithDelimiters = match[0];
            lastMatchedTextWithDelimiters = matchedTextWithDelimiters;
            lastMatch = match;

            if (matchStartIndex > lastIndex) {
            stringParts.push(nodeValue.slice(lastIndex, matchStartIndex));
            }

            const translationKey = getKeyAndRecord(
            matchedTextWithDelimiters, // Pass the full matched text
            { ...location, column: location.column + matchStartIndex },
            existingValueToKey,
            generatedKeysMap,
            extractedStrings,
            usedExistingKeysList,
            options
            );

            if (translationKey !== undefined) {
            if (stringParts.length === expressions.length) {
                stringParts.push("");
            }
            // Extract the raw text without delimiters for i18nCall
            const pattern = options?.pattern
              ? new RegExp(options.pattern)
              : new RegExp(getDefaultPattern().source);
            const rawTextMatch = pattern.exec(matchedTextWithDelimiters);
            const rawText = rawTextMatch ? rawTextMatch[1] : matchedTextWithDelimiters;
            expressions.push(
                callFactory(effectiveMethodName, translationKey, rawText)
            );
            madeChangeInString = true;
            } else {
            const lastPartIndex = stringParts.length - 1;
            if (lastPartIndex >= 0) {
                stringParts[lastPartIndex] += matchedTextWithDelimiters;
            } else {
                stringParts.push(matchedTextWithDelimiters);
            }
            }
            lastIndex = patternRegex.lastIndex;
        }

        if (!madeChangeInString) {
            return;
        }

        if (lastIndex < nodeValue.length) {
            if (stringParts.length === expressions.length) {
            stringParts.push("");
            }
            stringParts[stringParts.length - 1] += nodeValue.slice(lastIndex);
        }
        if (stringParts.length === expressions.length && expressions.length > 0) {
            stringParts.push("");
        }

        const isFullReplacement =
            expressions.length === 1 &&
            firstMatchIndex === 0 &&
            lastIndex === nodeValue.length;

        const originalNode = path.node;
        let replacementNode: t.Node;

        if (isFullReplacement) {
            replacementNode = expressions[0];
            // 插入注释
            if (options.appendExtractedComment && expressions.length === 1) {
              // 修复：使用最后一次匹配到的内容
              let rawText = "";
              if (lastMatch && lastMatchedTextWithDelimiters) {
                const pattern = options?.pattern
                  ? new RegExp(options.pattern)
                  : new RegExp(getDefaultPattern().source);
                const rawTextMatch = pattern.exec(lastMatchedTextWithDelimiters);
                rawText = rawTextMatch ? rawTextMatch[1] : lastMatchedTextWithDelimiters;
              } else {
                rawText = nodeValue;
              }
              attachExtractedCommentToNode(replacementNode, rawText, options.extractedCommentType || "block");
            }
        } else if (expressions.length > 0) {
            replacementNode = buildTemplateLiteral(stringParts, expressions);
        } else {
            return;
        }

        recordChange(path, originalNode, replacementNode);
        path.replaceWith(replacementNode);
    },
    JSXAttribute(path) {
        // ... existing JSXAttribute logic ...
        if (path.node.value && tg.isStringLiteral(path.node.value)) {
            const nodeValue = path.node.value.value;
            const location = {
                filePath,
                line: path.node.loc?.start.line ?? 0,
                column: path.node.loc?.start.column ?? 0,
            };

            const singleMatchPattern = options?.pattern
                ? new RegExp(options.pattern)
                : new RegExp(getDefaultPattern().source);

            const match = singleMatchPattern.exec(nodeValue);
            if (match && match[0] === nodeValue && match[1] !== undefined) {
                const translationKey = getKeyAndRecord(
                    nodeValue, // Pass the full original value
                    location, existingValueToKey, generatedKeysMap,
                    extractedStrings, usedExistingKeysList, options
                );

                if (translationKey !== undefined) {
                    const originalNode = path.node.value;
                    const rawText = match[1]; // Extract the raw text without delimiters
                    const replacementNode = t.jsxExpressionContainer(
                        callFactory(translationMethod, translationKey, rawText)
                    );
                    // 插入注释
                    if (options.appendExtractedComment) {
                      attachExtractedCommentToNode(replacementNode.expression, rawText, options.extractedCommentType || "block");
                    }
                    recordChange(path, originalNode, replacementNode);
                    path.node.value = replacementNode;
                }
            }
        }
    },
    JSXText(path) {
        // ... existing JSXText logic ...
        const nodeValue = path.node.value;
        const location = {
            filePath,
            line: path.node.loc?.start.line ?? 0,
            column: path.node.loc?.start.column ?? 0,
        };
        patternRegex.lastIndex = 0;
        if (!patternRegex.test(nodeValue)) return;
        patternRegex.lastIndex = 0;

        const newNodes: (t.JSXText | t.JSXExpressionContainer)[] = [];
        let lastIndex = 0;
        let match;
        let madeChangeInJSXText = false;

        while ((match = patternRegex.exec(nodeValue)) !== null) {
            const matchStartIndex = match.index;
            const matchedTextWithDelimiters = match[0];

            if (matchStartIndex > lastIndex) {
                const textBefore = nodeValue.slice(lastIndex, matchStartIndex);
                if (/\S/.test(textBefore)) newNodes.push(t.jsxText(textBefore));
            }

            const translationKey = getKeyAndRecord(
                matchedTextWithDelimiters, // Pass the full matched text
                { ...location, column: location.column + matchStartIndex },
                existingValueToKey, generatedKeysMap, extractedStrings,
                usedExistingKeysList, options
            );

            if (translationKey !== undefined) {
                // Extract the raw text without delimiters for i18nCall
                const pattern = options?.pattern
                  ? new RegExp(options.pattern)
                  : new RegExp(getDefaultPattern().source);
                const rawTextMatch = pattern.exec(matchedTextWithDelimiters);
                const rawText = rawTextMatch ? rawTextMatch[1] : matchedTextWithDelimiters;
                
                // Parse JSX text placeholders to generate interpolation
                const parsedPlaceholders = parseJSXTextPlaceholders(rawText);
                
                let translationCall;
                if (parsedPlaceholders && parsedPlaceholders.interpolationObject) {
                  // Use canonical text as key and provide interpolation object
                  translationCall = createTranslationCall(
                    translationMethod, 
                    translationKey, 
                    parsedPlaceholders.interpolationObject
                  );
                } else {
                  // No placeholders, use simple call
                  translationCall = callFactory(translationMethod, translationKey, rawText);
                }
                
                newNodes.push(t.jsxExpressionContainer(translationCall));
                
                if (options.appendExtractedComment) {
                  // 只对表达式节点插入注释
                  const lastNode = newNodes[newNodes.length - 1];
                  if (t.isJSXExpressionContainer(lastNode)) {
                    // Use the canonical text for comment (with {argN} format)
                    const commentText = parsedPlaceholders ? parsedPlaceholders.canonicalText : rawText;
                    attachExtractedCommentToNode(lastNode.expression, commentText, options.extractedCommentType || "block");
                  }
                }
                madeChangeInJSXText = true;
            } else {
                 if (/\S/.test(matchedTextWithDelimiters)) {
                     newNodes.push(t.jsxText(matchedTextWithDelimiters));
                 }
            }
            lastIndex = patternRegex.lastIndex;
        }

        if (lastIndex < nodeValue.length) {
            const textAfter = nodeValue.slice(lastIndex);
             if (/\S/.test(textAfter)) {
                newNodes.push(t.jsxText(textAfter));
             }
        }

        if (newNodes.length > 0 && madeChangeInJSXText) {
            const originalNode = path.node;
            recordChange(path, originalNode, newNodes);
            path.replaceWithMultiple(newNodes);
        }
    },

    TemplateLiteral(path) {
      if (tg.isTaggedTemplateExpression(path.parent)) return;

      const node = path.node;
      const location = {
        filePath,
        line: path.node.loc?.start.line ?? 0,
        column: path.node.loc?.start.column ?? 0,
      };

      // --- Handle TemplateLiterals WITH existing expressions ---
      if (node.expressions.length > 0) {
        // Construct the string representation with placeholders for pattern matching
        let originalRawStringForPatternCheck = "";
        node.quasis.forEach((quasi, i) => {
          originalRawStringForPatternCheck += quasi.value.raw;
          if (i < node.expressions.length) {
            // Use a simple, consistent placeholder for matching purposes
            originalRawStringForPatternCheck += "${...}";
          }
        });

        // Use a non-global pattern to check if the overall structure matches
        const singleMatchPattern = options?.pattern
          ? new RegExp(options.pattern)
          : new RegExp(getDefaultPattern().source);

        const match = singleMatchPattern.exec(originalRawStringForPatternCheck);

        // Check if the structure matches the pattern
        if (match && match[1] !== undefined) {
          // --- FIX: Call getKeyAndRecord with the string containing placeholders ---
          // getKeyAndRecord will internally derive the canonical value ("...{argN}...")
          const translationKey = getKeyAndRecord(
            originalRawStringForPatternCheck, // Pass the string with ${...}
            location,
            existingValueToKey,
            generatedKeysMap,
            extractedStrings,
            usedExistingKeysList,
            options
          );
          // --- End FIX ---

          if (translationKey !== undefined) {
            // Build the interpolation object { arg1: expr1, arg2: expr2 }
            const properties = node.expressions.map((expr, i) =>
              t.objectProperty(
                t.identifier(`arg${i + 1}`), // Key is argN
                expr as t.Expression // Value is the original expression
              )
            );
            const interpolations = t.objectExpression(properties);

            const originalNode = path.node;
            // Extract the raw text without delimiters for i18nCall
            const pattern = options?.pattern
              ? new RegExp(options.pattern)
              : new RegExp(getDefaultPattern().source);
            const rawTextMatch = pattern.exec(originalRawStringForPatternCheck);
            const rawText = rawTextMatch ? rawTextMatch[1] : originalRawStringForPatternCheck;
            
            // For custom i18nCall, we need to handle interpolations differently
            if (options.i18nConfig && options.i18nConfig.i18nCall) {
              // Custom i18nCall should handle interpolations as needed
              const replacementNode = callFactory(
                translationMethod,
                translationKey,
                rawText
              );
              recordChange(path, originalNode, replacementNode);
              path.replaceWith(replacementNode);
            } else {
              // Default behavior with interpolations
              const replacementNode = createTranslationCall(
                translationMethod,
                translationKey,
                interpolations // Pass interpolations object
              );
              
              // 插入注释
              if (options.appendExtractedComment) {
                // Use the canonical text for comment (with {argN} format)
                const canonicalText = rawText.replace(/\$\{[^}]+\}/g, (match, offset) => {
                  const exprIndex = node.expressions.findIndex((expr, i) => {
                    // This is a simplified approach - in a more complex scenario,
                    // you might need to track the mapping more precisely
                    return true; // For now, just use sequential mapping
                  });
                  return `{arg${Math.floor(offset / 10) + 1}}`; // Simplified mapping
                });
                // Actually, let's use a simpler approach - derive from the translation key
                const commentText = typeof translationKey === 'string' ? translationKey : String(translationKey);
                attachExtractedCommentToNode(replacementNode, commentText, options.extractedCommentType || "block");
              }
              
              recordChange(path, originalNode, replacementNode);
              path.replaceWith(replacementNode);
            }
          }
        }
        return; // Handled this case
      }

      // --- Handle TemplateLiterals WITHOUT expressions (logic remains the same) ---
      const nodeValue = node.quasis.map((q) => q.value.raw).join("");

      patternRegex.lastIndex = 0;
      if (!patternRegex.test(nodeValue)) {
        return;
      }
      patternRegex.lastIndex = 0;

      const stringParts: string[] = [];
      const expressions: t.Expression[] = [];
      let lastIndex = 0;
      let match;
      let madeChangeInTemplate = false;
      let firstMatchIndex = -1;
      let lastMatchedTextWithDelimiters = "";
      let lastMatch = null;

      while ((match = patternRegex.exec(nodeValue)) !== null) {
        if (firstMatchIndex === -1) {
          firstMatchIndex = match.index;
        }
        const matchStartIndex = match.index;
        const matchedTextWithDelimiters = match[0];
        lastMatchedTextWithDelimiters = matchedTextWithDelimiters;
        lastMatch = match;

        if (matchStartIndex > lastIndex) {
          stringParts.push(nodeValue.slice(lastIndex, matchStartIndex));
        }

        const translationKey = getKeyAndRecord(
          matchedTextWithDelimiters, // Pass the full matched text
          { ...location, column: location.column + matchStartIndex },
          existingValueToKey,
          generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        if (translationKey !== undefined) {
          if (stringParts.length === expressions.length) {
            stringParts.push("");
          }
          // Extract the raw text without delimiters for i18nCall
          const pattern = options?.pattern
            ? new RegExp(options.pattern)
            : new RegExp(getDefaultPattern().source);
          const rawTextMatch = pattern.exec(matchedTextWithDelimiters);
          const rawText = rawTextMatch ? rawTextMatch[1] : matchedTextWithDelimiters;
          
          expressions.push(
            callFactory(translationMethod, translationKey, rawText)
          );
          madeChangeInTemplate = true;
        } else {
          const lastPartIndex = stringParts.length - 1;
          if (lastPartIndex >= 0) {
            stringParts[lastPartIndex] += matchedTextWithDelimiters;
          } else {
            stringParts.push(matchedTextWithDelimiters);
          }
        }
        lastIndex = patternRegex.lastIndex;
      }

      if (!madeChangeInTemplate) {
        return;
      }

      if (lastIndex < nodeValue.length) {
        if (stringParts.length === expressions.length) {
          stringParts.push("");
        }
        stringParts[stringParts.length - 1] += nodeValue.slice(lastIndex);
      }
      if (stringParts.length === expressions.length && expressions.length > 0) {
        stringParts.push("");
      }

      const isFullReplacement =
        expressions.length === 1 &&
        firstMatchIndex === 0 &&
        lastIndex === nodeValue.length;

      const originalNode = path.node;
      let replacementNode: t.Node;

      if (isFullReplacement) {
        replacementNode = expressions[0];
        // 插入注释
        if (options.appendExtractedComment && expressions.length === 1) {
          // 修复：使用最后一次匹配到的内容
          let rawText = "";
          if (lastMatch && lastMatchedTextWithDelimiters) {
            const pattern = options?.pattern
              ? new RegExp(options.pattern)
              : new RegExp(getDefaultPattern().source);
            const rawTextMatch = pattern.exec(lastMatchedTextWithDelimiters);
            rawText = rawTextMatch ? rawTextMatch[1] : lastMatchedTextWithDelimiters;
          } else {
            rawText = nodeValue;
          }
          attachExtractedCommentToNode(replacementNode, rawText, options.extractedCommentType || "block");
        }
      } else if (expressions.length > 0) {
        replacementNode = buildTemplateLiteral(stringParts, expressions);
      } else {
        return;
      }

      recordChange(path, originalNode, replacementNode);
      path.replaceWith(replacementNode);
    },
  });

  return { modified, changes };
}
