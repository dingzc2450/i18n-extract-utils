import type { NormalizedTransformOptions } from "../../core/config-normalizer";
import type {
  ExtractedString,
  ExistingValueToKeyMapType,
  UsedExistingKey,
  ChangeDetail,
} from "../../types";
import * as t from "@babel/types";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import { getKeyAndRecord } from "../../key-manager";
import { attachExtractedCommentToNode } from "../../core/ast-utils";
import { getTranslationCallee } from "./call-resolver";
import { addI18nSetupToScript } from "./i18n-setup-injector";
import { applyCodeChanges } from "../../core/shared-utils";

export function processVueScript(
  script: string,
  isSetup: boolean,
  options: NormalizedTransformOptions,
  extractedStrings: ExtractedString[],
  usedExistingKeysList: UsedExistingKey[],
  existingValueToKeyMap: ExistingValueToKeyMapType,
  filePath: string,
  generatedKeysMap: Map<string, string | number>,
  scriptOptions?: {
    noImport?: boolean;
    translationMethod?: string;
    useThisInScript?: boolean;
    templateNeedsHook?: boolean;
  }
): { code: string } {
  if (!script) return { code: script };

  try {
    const quickRegex = new RegExp(options.pattern);
    const hasPattern = quickRegex.test(script);
    if (!hasPattern && scriptOptions?.templateNeedsHook !== true) {
      return { code: script };
    }

    const ast = parse(script, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });

    const translationMethod =
      scriptOptions?.translationMethod ||
      options.normalizedI18nConfig.i18nImport?.name;
    const useThisInScript = scriptOptions?.useThisInScript === true;
    const hookName = options.normalizedI18nConfig.i18nImport.importName;
    const hookSource = options.normalizedI18nConfig.i18nImport?.source;

    const extractedCommentType = options.extractedCommentType;
    const appendExtractedComment = options.appendExtractedComment;

    const useStringReplacement = scriptOptions?.noImport === true;

    if (useStringReplacement) {
      const scriptChanges = collectScriptChanges(
        ast,
        script,
        translationMethod!,
        extractedStrings,
        usedExistingKeysList,
        options,
        existingValueToKeyMap,
        filePath,
        useThisInScript,
        appendExtractedComment,
        extractedCommentType,
        generatedKeysMap
      );

      const updatedScript =
        scriptChanges.length > 0
          ? applyCodeChanges(script, scriptChanges)
          : script;

      return { code: updatedScript };
    }

    // setup + 语句级注释
    const beforeScriptExtractedCount = extractedStrings.length;
    if (isSetup && appendExtractedComment) {
      const callExpressionMap = new Map<t.CallExpression, string>();

      traverse(ast, {
        StringLiteral(path) {
          const { value } = path.node;
          if (!value) return;

          const pattern = new RegExp(options.pattern, "g");
          const matches = [...value.matchAll(pattern)];
          if (matches.length === 0) return;

          for (const match of matches) {
            const fullMatch = match[0];
            const extractedValue = match[1];
            if (!extractedValue) continue;

            const key = getKeyAndRecord(
              fullMatch,
              {
                filePath,
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
              },
              existingValueToKeyMap,
              generatedKeysMap,
              extractedStrings,
              usedExistingKeysList,
              options
            );

            const callee = getTranslationCallee(
              translationMethod!,
              useThisInScript
            );
            const callExpr = t.callExpression(callee, [
              t.stringLiteral(String(key)),
            ]);

            callExpressionMap.set(callExpr, extractedValue);
            path.replaceWith(callExpr);
            path.skip();
          }
        },
      });

      if (callExpressionMap.size > 0) {
        traverse(ast, {
          CallExpression(path) {
            if (callExpressionMap.has(path.node)) {
              const extractedValue = callExpressionMap.get(path.node)!;
              const statement = path.findParent(p => p.isStatement());

              if (statement) {
                if (!statement.node.trailingComments) {
                  statement.node.trailingComments = [];
                }
                if (extractedCommentType === "line") {
                  statement.node.trailingComments.push({
                    type: "CommentLine",
                    value: ` ${extractedValue} `,
                  } as t.CommentLine);
                } else {
                  statement.node.trailingComments.push({
                    type: "CommentBlock",
                    value: ` ${extractedValue} `,
                  } as t.CommentBlock);
                }
              } else {
                attachExtractedCommentToNode(
                  path.node,
                  extractedValue,
                  extractedCommentType
                );
              }
            }
          },
        });
      }
    } else {
      processScriptStrings(
        ast,
        translationMethod!,
        extractedStrings,
        usedExistingKeysList,
        options,
        existingValueToKeyMap,
        filePath,
        useThisInScript,
        generatedKeysMap
      );
    }

    const afterScriptExtractedCount = extractedStrings.length;
    const scriptDelta = afterScriptExtractedCount - beforeScriptExtractedCount;
    const needsImport =
      !(scriptOptions?.noImport ?? false) &&
      (scriptDelta > 0 || scriptOptions?.templateNeedsHook === true);

    addI18nSetupToScript(
      ast,
      translationMethod!,
      hookName,
      hookSource!,
      isSetup,
      needsImport
    );

    const { code } = generate(ast, {
      retainLines: true,
      compact: false,
      jsescOption: { minimal: true },
    });

    return { code };
  } catch (error) {
    console.error("Error processing Vue script:", error);
    throw error;
  }
}

export function processScriptStrings(
  ast: t.File,
  translationMethod: string,
  extractedStrings: ExtractedString[],
  usedExistingKeysList: UsedExistingKey[],
  options: NormalizedTransformOptions,
  existingValueToKeyMap: ExistingValueToKeyMapType,
  filePath: string,
  useThisInScript: boolean = false,
  generatedKeysMap?: Map<string, string | number>
) {
  const patternRegex = new RegExp(options.pattern, "g");
  const localGeneratedKeysMap =
    generatedKeysMap ?? new Map<string, string | number>();

  const createCallExpression = (key: string) => {
    const callee = getTranslationCallee(translationMethod, useThisInScript);
    return t.callExpression(callee, [t.stringLiteral(String(key))]);
  };

  traverse(ast, {
    StringLiteral(path) {
      const { value } = path.node;
      if (!value) return;

      const matches = [...value.matchAll(patternRegex)];
      if (matches.length === 0) return;

      for (const match of matches) {
        const fullMatch = match[0];
        const extractedValue = match[1];
        if (!extractedValue) continue;

        const key = getKeyAndRecord(
          fullMatch,
          {
            filePath,
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
          },
          existingValueToKeyMap,
          localGeneratedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        const callExpr = createCallExpression(String(key));
        if (options.appendExtractedComment) {
          const commentType = options.extractedCommentType || "line";
          attachExtractedCommentToNode(callExpr, extractedValue, commentType);
        }

        path.replaceWith(callExpr);
        path.skip();
      }
    },
    TemplateLiteral(path) {
      const { quasis, expressions } = path.node;
      if (quasis.length === 0) return;

      let hasMatch = false;
      for (const quasi of quasis) {
        const value = quasi.value.raw;
        if (!value) continue;
        const matches = [...value.matchAll(patternRegex)];
        if (matches.length > 0) {
          hasMatch = true;
          break;
        }
      }
      if (!hasMatch) return;

      const parts: t.Expression[] = [];

      for (let i = 0; i < quasis.length; i++) {
        const quasi = quasis[i];
        const value = quasi.value.raw;

        if (value) {
          const matches = [...value.matchAll(patternRegex)];
          if (matches.length > 0) {
            let lastIndex = 0;
            for (const match of matches) {
              const fullMatch = match[0];
              const extractedValue = match[1];
              const matchIndex = match.index!;

              if (matchIndex > lastIndex) {
                const beforeText = value.substring(lastIndex, matchIndex);
                if (beforeText) {
                  parts.push(t.stringLiteral(beforeText));
                }
              }

              const key = getKeyAndRecord(
                fullMatch,
                {
                  filePath,
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                },
                existingValueToKeyMap,
                localGeneratedKeysMap,
                extractedStrings,
                usedExistingKeysList,
                options
              );

              const callExpr = createCallExpression(String(key));
              if (options.appendExtractedComment) {
                attachExtractedCommentToNode(callExpr, extractedValue, "block");
              }

              parts.push(callExpr);
              lastIndex = matchIndex + fullMatch.length;
            }

            if (lastIndex < value.length) {
              const afterText = value.substring(lastIndex);
              if (afterText) {
                parts.push(t.stringLiteral(afterText));
              }
            }
          } else {
            parts.push(t.stringLiteral(value));
          }
        }

        if (i < expressions.length) {
          const expr = expressions[i];
          if (expr) {
            parts.push(expr as t.Expression);
          }
        }
      }

      if (parts.length > 0) {
        let result: t.Expression = parts[0];
        for (let i = 1; i < parts.length; i++) {
          result = t.binaryExpression("+", result, parts[i]);
        }
        path.replaceWith(result);
      }
      path.skip();
    },
  });
}

function collectScriptChanges(
  ast: t.File,
  originalScript: string,
  translationMethod: string,
  extractedStrings: ExtractedString[],
  usedExistingKeysList: UsedExistingKey[],
  options: NormalizedTransformOptions,
  existingValueToKeyMap: ExistingValueToKeyMapType,
  filePath: string,
  useThisInScript: boolean,
  appendExtractedComment?: boolean,
  extractedCommentType?: "block" | "line",
  generatedKeysMap?: Map<string, string | number>
): ChangeDetail[] {
  const patternRegex = new RegExp(options.pattern, "g");
  const changes: ChangeDetail[] = [];
  const localGeneratedKeysMap =
    generatedKeysMap ?? new Map<string, string | number>();

  const createCallExpression = (key: string, originalText: string) => {
    const callee = getTranslationCallee(translationMethod, useThisInScript);
    const callExpr = t.callExpression(callee, [t.stringLiteral(String(key))]);

    if (appendExtractedComment) {
      attachExtractedCommentToNode(
        callExpr,
        originalText,
        extractedCommentType || "block"
      );
    }

    return callExpr;
  };

  const recordChange = (node: t.Node, replacementNode: t.Node) => {
    if (!node.loc) return;

    const start = node.start ?? 0;
    const end = node.end ?? start;
    const originalSegment = originalScript.slice(start, end);

    const replacement = generate(replacementNode, {
      jsescOption: { minimal: true },
      compact: false,
    }).code;

    changes.push({
      filePath,
      original: originalSegment,
      replacement,
      line: node.loc.start.line,
      column: node.loc.start.column,
      endLine: node.loc.end.line,
      endColumn: node.loc.end.column,
      start,
      end,
    });
  };

  traverse(ast, {
    StringLiteral(path) {
      const { value } = path.node;
      if (!value) return;

      const matches = [...value.matchAll(patternRegex)];
      if (matches.length === 0) return;

      const match = matches[0];
      const fullMatch = match[0];
      const extractedValue = match[1];
      if (!extractedValue) return;

      const key = getKeyAndRecord(
        fullMatch,
        {
          filePath,
          line: path.node.loc?.start.line || 0,
          column: path.node.loc?.start.column || 0,
        },
        existingValueToKeyMap,
        localGeneratedKeysMap,
        extractedStrings,
        usedExistingKeysList,
        options
      );

      if (key === undefined) return;

      const callExpr = createCallExpression(String(key), extractedValue);
      recordChange(path.node, callExpr);
      path.skip();
    },
    TemplateLiteral(path) {
      const { quasis, expressions } = path.node;
      if (quasis.length === 0) return;

      let hasReplacement = false;
      const parts: t.Expression[] = [];

      for (let i = 0; i < quasis.length; i++) {
        const quasi = quasis[i];
        const rawValue = quasi.value.raw;

        if (rawValue) {
          const matches = [...rawValue.matchAll(patternRegex)];
          if (matches.length > 0) {
            hasReplacement = true;
            let lastIndex = 0;

            for (const match of matches) {
              const fullMatch = match[0];
              const extractedValue = match[1];
              const matchIndex = match.index ?? 0;

              if (matchIndex > lastIndex) {
                const beforeText = rawValue.slice(lastIndex, matchIndex);
                if (beforeText) {
                  parts.push(t.stringLiteral(beforeText));
                }
              }

              const key = getKeyAndRecord(
                fullMatch,
                {
                  filePath,
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                },
                existingValueToKeyMap,
                localGeneratedKeysMap,
                extractedStrings,
                usedExistingKeysList,
                options
              );

              if (key !== undefined) {
                const callExpr = createCallExpression(
                  String(key),
                  extractedValue
                );
                parts.push(callExpr);
              }

              lastIndex = matchIndex + fullMatch.length;
            }

            if (lastIndex < rawValue.length) {
              const afterText = rawValue.slice(lastIndex);
              if (afterText) {
                parts.push(t.stringLiteral(afterText));
              }
            }
          } else {
            parts.push(t.stringLiteral(rawValue));
          }
        }

        if (i < expressions.length) {
          const expr = expressions[i];
          if (expr) {
            parts.push(t.cloneNode(expr, true) as t.Expression);
          }
        }
      }

      if (!hasReplacement) return;

      let replacementExpr = parts[0];
      for (let i = 1; i < parts.length; i++) {
        replacementExpr = t.binaryExpression("+", replacementExpr, parts[i]);
      }

      recordChange(path.node, replacementExpr);
      path.skip();
    },
  });

  return changes;
}
