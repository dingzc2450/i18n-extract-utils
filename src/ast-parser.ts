import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";
import { ExtractedString, TransformOptions, UsedExistingKey } from "./types";
import fs from "fs";
import { extractStringsFromCode, getDefaultPattern } from "./string-extractor";
import { hasTranslationHook } from "./hook-utils";
import { formatGeneratedCode } from "./code-formatter";
import * as tg from "./babel-type-guards"; // 引入类型辅助工具
import { fallbackTransform } from "./fallback-transform"; // 新增

// Helper function to create the replacement CallExpression node
function createTranslationCall(
  methodName: string,
  translationKey: string | number
): t.CallExpression {
  // If the user specified 'default' as the method, assume the actual function is 't'
  const effectiveMethodName = methodName === "default" ? "t" : methodName;
  return t.callExpression(t.identifier(effectiveMethodName), [
    typeof translationKey === "string"
      ? t.stringLiteral(translationKey)
      : t.numericLiteral(translationKey),
  ]);
}

/**
 * 工具函数：尝试将字符串节点替换为 t(key) 调用
 * @param nodeValue 原始字符串
 * @param pattern 匹配正则
 * @param valueToKeyMap value->key映射
 * @returns 匹配到则返回 {textToTranslate, translationKey}，否则 undefined
 */
function getTranslationMatch(
  nodeValue: string,
  pattern: RegExp,
  valueToKeyMap: Map<string, string | number>
): { textToTranslate: string; translationKey: string | number } | undefined {
  const match = pattern.exec(nodeValue);
  if (match && match[1] !== undefined) {
    const textToTranslate = match[1];
    const translationKey = valueToKeyMap.get(textToTranslate);
    if (translationKey !== undefined) {
      return { textToTranslate, translationKey };
    }
  }
  return undefined;
}

/**
 * 工具函数：警告未找到 key 的情况
 */
function warnNoKey(filePath: string, text: string, context: string) {
  console.warn(
    `[${filePath}] Warning: Found match "${text}" in ${context} but no key in valueToKeyMap.`
  );
}

/**
 * Traverses the AST to replace matched strings with translation function calls.
 * @param ast The Babel AST root node.
 * @param valueToKeyMap Map of string values to their translation keys.
 * @param translationMethod The name of the translation function (or 'default').
 * @param options Transformation options.
 * @param filePath The path of the file being processed (for warnings).
 * @returns { modified: boolean } Indicates if any replacements were made.
 */
function replaceStringsWithTCalls(
  ast: t.File,
  valueToKeyMap: Map<string, string | number>,
  translationMethod: string,
  options: TransformOptions,
  filePath: string
): { modified: boolean } {
  let modified = false;
  const defaultPattern = getDefaultPattern(); // Get default pattern if needed

  traverse(ast, {
    JSXAttribute(path) {
      if (path.node.value && tg.isStringLiteral(path.node.value)) {
        const attrValue = path.node.value.value;
        const testPattern = options?.pattern
          ? new RegExp(options.pattern)
          : new RegExp(defaultPattern.source);
        const matchResult = getTranslationMatch(
          attrValue,
          testPattern,
          valueToKeyMap
        );

        if (matchResult) {
          path.node.value = t.jsxExpressionContainer(
            createTranslationCall(translationMethod, matchResult.translationKey)
          );
          modified = true;
        } else {
          const match = testPattern.exec(attrValue);
          if (match && match[1] !== undefined) {
            warnNoKey(filePath, match[1], "JSX attribute");
          }
        }
      }
    },
    StringLiteral(path) {
      if (
        tg.isJSXAttribute(path.parent) ||
        tg.isImportDeclaration(path.parent) ||
        tg.isExportDeclaration(path.parent)
      ) {
        return;
      }
      const literalValue = path.node.value;
      const testPattern = options?.pattern
        ? new RegExp(options.pattern)
        : new RegExp(defaultPattern.source);
      const matchResult = getTranslationMatch(
        literalValue,
        testPattern,
        valueToKeyMap
      );

      if (matchResult) {
        path.replaceWith(
          createTranslationCall(translationMethod, matchResult.translationKey)
        );
        modified = true;
      } else {
        const match = testPattern.exec(literalValue);
        if (match && match[1] !== undefined) {
          warnNoKey(filePath, match[1], "StringLiteral");
        }
      }
    },
    JSXText(path) {
      const textValue = path.node.value;
      const globalPattern = options?.pattern
        ? new RegExp(options.pattern, "g")
        : new RegExp(defaultPattern.source, "g");
      let match;
      let lastIndex = 0;
      const newNodes: (t.JSXText | t.JSXExpressionContainer)[] = [];
      let textModified = false;

      globalPattern.lastIndex = 0;

      while ((match = globalPattern.exec(textValue)) !== null) {
        if (match[1] === undefined) continue;

        const textToTranslate = match[1];
        const translationKey = valueToKeyMap.get(textToTranslate);

        if (translationKey !== undefined) {
          const matchStart = match.index;
          const matchEnd = matchStart + match[0].length;

          if (matchStart > lastIndex) {
            const precedingText = textValue.substring(lastIndex, matchStart);
            if (/\S/.test(precedingText)) {
              newNodes.push(t.jsxText(precedingText));
            }
          }

          newNodes.push(
            t.jsxExpressionContainer(
              createTranslationCall(translationMethod, translationKey)
            )
          );
          lastIndex = matchEnd;
          textModified = true;
        } else {
          warnNoKey(filePath, textToTranslate, "JSXText");
          lastIndex = match.index + match[0].length;
          globalPattern.lastIndex = lastIndex;
        }
      }

      if (lastIndex < textValue.length) {
        const remainingText = textValue.substring(lastIndex);
        if (/\S/.test(remainingText)) {
          newNodes.push(t.jsxText(remainingText));
        }
      }

      if (textModified && newNodes.length > 0) {
        if (
          newNodes.length === 1 &&
          tg.isJSXText(newNodes[0]) &&
          newNodes[0].value === textValue
        ) {
          // No effective change
        } else {
          path.replaceWithMultiple(newNodes);
          modified = true;
        }
      }
    },
    TemplateLiteral(path) {
      if (tg.isTaggedTemplateExpression(path.parent)) {
        return;
      }
      if (path.node.quasis.length === 1 && path.node.expressions.length === 0) {
        const templateValue = path.node.quasis[0].value.raw;
        const testPattern = options?.pattern
          ? new RegExp(options.pattern)
          : new RegExp(defaultPattern.source);
        const matchResult = getTranslationMatch(
          templateValue,
          testPattern,
          valueToKeyMap
        );

        if (matchResult) {
          path.replaceWith(
            createTranslationCall(translationMethod, matchResult.translationKey)
          );
          modified = true;
        } else {
          const match = testPattern.exec(templateValue);
          if (match && match[1] !== undefined) {
            warnNoKey(filePath, match[1], "TemplateLiteral");
          }
        }
      }
    },
  });

  return { modified };
}

/**
 * Traverses the AST to add the translation hook import and call if necessary.
 * @param ast The Babel AST root node.
 * @param translationMethod The name of the translation function (or 'default').
 * @param hookName The name of the translation hook.
 * @param hookImport The import source for the hook.
 * @returns { importAdded: boolean, hookCallAdded: boolean } Flags indicating additions.
 */
function addHookAndImport(
  ast: t.File,
  translationMethod: string,
  hookName: string,
  hookImport: string
): { importAdded: boolean; hookCallAdded: boolean } {
  let importAdded = false;
  let hookCallAdded = false;

  traverse(ast, {
    Program: {
      enter(path) {
        // Check if import already exists
        let importExists = false;
        path.node.body.forEach((node) => {
          if (
            tg.isImportDeclaration(node) &&
            node.source.value === hookImport
          ) {
            node.specifiers.forEach((spec) => {
              if (
                tg.isImportSpecifier(spec) &&
                tg.isIdentifier(spec.imported) &&
                spec.imported.name === hookName
              ) {
                importExists = true;
              }
            });
          }
        });

        // Add import if it doesn't exist
        if (!importExists) {
          const importSpecifier = t.importSpecifier(
            t.identifier(hookName),
            t.identifier(hookName)
          );
          const importDeclaration = t.importDeclaration(
            [importSpecifier],
            t.stringLiteral(hookImport)
          );

          // Find the correct insertion point (after directives and other imports)
          let lastDirectiveIndex = -1;
          let lastImportIndex = -1;
          for (let i = 0; i < path.node.body.length; i++) {
            const node = path.node.body[i];
            if (
              tg.isExpressionStatement(node) &&
              tg.isStringLiteral(node.expression) &&
              path.node.directives?.some(
                (dir) =>
                  dir.value.value ===
                  (tg.isStringLiteral(node.expression)
                    ? node.expression.value
                    : "")
              )
            ) {
              lastDirectiveIndex = i;
            } else if (tg.isImportDeclaration(node)) {
              lastImportIndex = i;
            }
          }
          let insertIndex = 0;
          if (lastImportIndex !== -1) {
            insertIndex = lastImportIndex + 1;
          } else if (lastDirectiveIndex !== -1) {
            insertIndex = lastDirectiveIndex + 1;
          }
          path.node.body.splice(insertIndex, 0, importDeclaration);
          importAdded = true;
        }
      },
    },
    "FunctionDeclaration|FunctionExpression|ArrowFunctionExpression": (path) => {
      // 跳过嵌套函数
      if (path.findParent((p) => tg.isFunction(p.node))) {
        return;
      }

      // 检查是否为组件（返回JSX）或自定义hook（函数名以use开头）
      let returnsJSX = false;
      let isCustomHook = false;

      // 检查函数名
      if (
        tg.isFunction(path.node) && 
        (tg.isFunctionDeclaration(path.node) || tg.isFunctionExpression(path.node)) && 
        path.node.id && 
        /^use[A-Z\d_]/.test(path.node.id.name)
      ) {
        isCustomHook = true;
      }

      // 检查是否返回JSX
      path.traverse({
        ReturnStatement(returnPath) {
          if (
            returnPath.node.argument &&
            (tg.isJSXElement(returnPath.node.argument) ||
              tg.isJSXFragment(returnPath.node.argument))
          ) {
            returnsJSX = true;
            returnPath.stop();
          }
        },
      });

      // 检查函数体内是否有 t(...) 调用
      let hasTCall = false;
      path.traverse({
        CallExpression(callPath) {
          if (
            tg.isIdentifier(callPath.node.callee) &&
            callPath.node.callee.name === "t"
          ) {
            hasTCall = true;
            callPath.stop();
          }
        },
      });

      // 组件 或 自定义hook且用到t()，都插入hook语句
      if (
        ((returnsJSX || (isCustomHook && hasTCall)) &&
          tg.isFunction(path.node) &&
          path.node.body &&
          tg.isBlockStatement(path.node.body))
      ) {
        // Check if the hook call already exists
        let callExists = false;
        path.node.body.body.forEach((stmt) => {
          if (tg.isVariableDeclaration(stmt)) {
            stmt.declarations.forEach((decl) => {
              if (
                tg.isVariableDeclarator(decl) &&
                tg.isCallExpression(decl.init) &&
                tg.isIdentifier(decl.init.callee) &&
                decl.init.callee.name === hookName
              ) {
                if (tg.isIdentifier(decl.id) || tg.isObjectPattern(decl.id)) {
                  callExists = true;
                }
              }
            });
          }
        });

        // Add hook call if it doesn't exist
        if (!callExists) {
          const callExpression = t.callExpression(t.identifier(hookName), []);
          let variableDeclarator;

          if (translationMethod === "default") {
            variableDeclarator = t.variableDeclarator(
              t.identifier("t"),
              callExpression
            );
          } else {
            const hookIdentifier = t.identifier(translationMethod);
            const objectPattern = t.objectPattern([
              t.objectProperty(hookIdentifier, hookIdentifier, false, true),
            ]);
            variableDeclarator = t.variableDeclarator(
              objectPattern,
              callExpression
            );
          }

          const variableDeclaration = t.variableDeclaration("const", [
            variableDeclarator,
          ]);
          path.node.body.body.unshift(variableDeclaration);
          hookCallAdded = true;
        }
      }
    },
  });

  return { importAdded, hookCallAdded };
}

export function transformCode(
  filePath: string,
  options: TransformOptions,
  existingValueToKey?: Map<string, string | number>
): {
  code: string;
  extractedStrings: ExtractedString[];
  usedExistingKeysList: UsedExistingKey[];
} {
  const code = fs.readFileSync(filePath, "utf8");

  // 1. Extract strings AND generate keys first
  const { extractedStrings, usedExistingKeysList } = extractStringsFromCode(
    code,
    filePath,
    options,
    existingValueToKey
  );

  const translationMethod = options.translationMethod || "t";
  const hookName = options.hookName || "useTranslation";
  const hookImport = options.hookImport || "react-i18next";

  if (extractedStrings.length === 0) {
    return { code, extractedStrings, usedExistingKeysList };
  }

  // Create a map for quick lookup of key by value during traversal
  const valueToKeyMap = new Map(extractedStrings.map((s) => [s.value, s.key]));

  try {
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    // --- Step 1: Replace Strings ---
    const { modified } = replaceStringsWithTCalls(
      ast,
      valueToKeyMap,
      translationMethod,
      options,
      filePath
    );

    // If no strings were replaced, return original code (or code after extraction if keys were generated)
    if (!modified) {
      // Generate code even if no replacements, in case comments/formatting changed
      // let { code: generatedCode } = generate(ast, { /* ... generate options ... */ });
      // Potentially format here if needed, though less critical if no changes
      return { code, extractedStrings, usedExistingKeysList };
    }

    // --- Step 2: Add Hook and Import if needed ---
    const hookAlreadyExists = hasTranslationHook(code, hookName); // Check original code
    const needsHook = !hookAlreadyExists && modified;
    let importAdded = false;
    let hookCallAdded = false;

    if (needsHook) {
      const addResult = addHookAndImport(
        ast,
        translationMethod,
        hookName,
        hookImport
      );
      importAdded = addResult.importAdded;
      hookCallAdded = addResult.hookCallAdded;
    }

    // --- Step 3: Generate Final Code ---
    let { code: generatedCode } = generate(ast, {
      retainLines: true,
      compact: false,
      comments: true,
      jsescOption: { minimal: true },
    });

    // --- Step 4: Format Generated Code ---
    const transformedCode = formatGeneratedCode(
      generatedCode,
      importAdded,
      hookCallAdded,
      hookName,
      hookImport,
      translationMethod,
    );

    return { code: transformedCode, extractedStrings, usedExistingKeysList };
  } catch (error) {
    console.error(`[${filePath}] Error during AST transformation: ${error}`);
    if (error instanceof Error) {
      console.error(error.stack);
    }
    console.error(
      `[${filePath}] Falling back to simple regex replacement (key generation not supported in fallback)`
    );
    // Use the fallback transform
    const transformedCode = fallbackTransform(code, extractedStrings, options);
    return { code: transformedCode, extractedStrings, usedExistingKeysList };
  }
}
