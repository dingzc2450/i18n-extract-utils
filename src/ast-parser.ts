import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator"; // <-- Import generator
import { ExtractedString, TransformOptions } from "./types";
import fs from "fs";

const DEFAULT_PATTERN = /___(.+?)___/g;

export function extractStringsFromCode(
  code: string,
  filePath: string,
  options?: TransformOptions
): ExtractedString[] {
  const extractedStrings: ExtractedString[] = [];
  // Ensure pattern is created correctly for the loop
  const pattern = options?.pattern
    ? new RegExp(options.pattern, "g")
    : new RegExp(DEFAULT_PATTERN.source, "g");

  let match;
  while ((match = pattern.exec(code)) !== null) {
    const value = match[1];
    const startIndex = match.index;

    // 计算行和列
    const upToMatch = code.slice(0, startIndex);
    const lines = upToMatch.split("\n");
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;

    extractedStrings.push({
      value,
      filePath,
      line,
      column,
    });
  }

  return extractedStrings;
}

export function hasTranslationHook(
  code: string,
  hookName: string = "useTranslation"
): boolean {
  try {
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    let hasHook = false;

    traverse(ast, {
      CallExpression(path) {
        if (
          t.isIdentifier(path.node.callee) &&
          path.node.callee.name === hookName
        ) {
          hasHook = true;
          path.stop();
        }
      },
    });

    return hasHook;
  } catch (error) {
    console.error(`Error analyzing code: ${error}`);
    return false;
  }
}

// ReplacementInfo is no longer needed
// interface ReplacementInfo { ... }

export function transformCode(
  filePath: string,
  options: TransformOptions
): { code: string; extractedStrings: ExtractedString[] } {
  const code = fs.readFileSync(filePath, "utf8");
  // Extract strings first, as the AST modification will change the code structure
  const extractedStrings = extractStringsFromCode(code, filePath, options);

  const translationMethod = options.translationMethod || "t";
  const hookName = options.hookName || "useTranslation";
  const hookImport = options.hookImport || "react-i18next";

  // 如果没有需要翻译的字符串，直接返回原代码
  if (extractedStrings.length === 0) {
    return { code, extractedStrings };
  }

  // 使用 AST 来进行更精确的替换
  try {
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      // tokens and ranges might not be strictly necessary for direct modification + generation
      // tokens: true,
      // ranges: true,
    });

    // No longer need replacements array
    // const replacements: ReplacementInfo[] = [];

    let modified = false; // Track if any modifications were made

    traverse(ast, {
      // 处理 JSX 属性中的国际化文本
      JSXAttribute(path) {
        if (path.node.value && t.isStringLiteral(path.node.value)) {
          const value = path.node.value.value;
          // Create a new RegExp instance each time
          const pattern = options?.pattern
            ? new RegExp(options.pattern)
            : new RegExp(DEFAULT_PATTERN.source);
          const match = pattern.exec(value);

          if (match) {
            const textToTranslate = match[1];
            // Directly replace the StringLiteral value with a JSXExpressionContainer
            path.node.value = t.jsxExpressionContainer(
              t.callExpression(
                t.identifier(translationMethod),
                [t.stringLiteral(textToTranslate)] // Use original text for translation key
              )
            );
            modified = true;
            // No need to push to replacements
          }
        }
      },

      // 处理字符串字面量中的国际化文本
      StringLiteral(path) {
        // Skip if it's part of a JSXAttribute (already handled) or ImportDeclaration
        if (
          path.parentPath.isJSXAttribute() ||
          path.parentPath.isImportDeclaration()
        ) {
          return;
        }

        const value = path.node.value;
        // Create a new RegExp instance each time
        const pattern = options?.pattern
          ? new RegExp(options.pattern)
          : new RegExp(DEFAULT_PATTERN.source);
        const match = pattern.exec(value);

        if (match) {
          const textToTranslate = match[1];
          // Replace the StringLiteral node with a CallExpression node
          path.replaceWith(
            t.callExpression(
              t.identifier(translationMethod),
              [t.stringLiteral(textToTranslate)] // Use original text for translation key
            )
          );
          modified = true;
          // No need to push to replacements
        }
      },

      // 处理 JSX 文本中的国际化文本
      JSXText(path) {
        const value = path.node.value;
        // Use the global pattern for multiple matches
        const pattern = options?.pattern
          ? new RegExp(options.pattern, "g")
          : new RegExp(DEFAULT_PATTERN.source, "g");
        let match;
        let lastIndex = 0;
        const newNodes: (t.JSXText | t.JSXExpressionContainer)[] = [];

        while ((match = pattern.exec(value)) !== null) {
          const textToTranslate = match[1];
          const matchStart = match.index;
          const matchEnd = matchStart + match[0].length;

          // Add preceding text if any
          if (matchStart > lastIndex) {
            const textNode = t.jsxText(value.substring(lastIndex, matchStart));
            if (textNode.value.trim()) newNodes.push(textNode); // Avoid empty text nodes
          }

          // Add the translation expression
          newNodes.push(
            t.jsxExpressionContainer(
              t.callExpression(
                t.identifier(translationMethod),
                [t.stringLiteral(textToTranslate)] // Use original text for translation key
              )
            )
          );

          lastIndex = matchEnd;
        }

        // Add remaining text if any
        if (lastIndex < value.length) {
          const textNode = t.jsxText(value.substring(lastIndex));
          if (textNode.value.trim()) newNodes.push(textNode); // Avoid empty text nodes
        }

        // Replace the original JSXText node if modifications were made
        if (
          newNodes.length > 0 &&
          (newNodes.length > 1 ||
            !t.isJSXText(newNodes[0]) ||
            newNodes[0].value !== value)
        ) {
          // Only replace if there's actually a change
          path.replaceWithMultiple(newNodes);
          modified = true;
        }
        // No need to push to replacements
      },

      // 处理模板字符串中的国际化文本
      TemplateLiteral(path) {
        // Skip if it's part of a TaggedTemplateExpression (like styled-components)
        if (path.parentPath.isTaggedTemplateExpression()) {
          return;
        }
        // For simple template literals (no expressions)
        if (
          path.node.quasis.length === 1 &&
          path.node.expressions.length === 0
        ) {
          const value = path.node.quasis[0].value.raw;
          // Create a new RegExp instance each time
          const pattern = options?.pattern
            ? new RegExp(options.pattern)
            : new RegExp(DEFAULT_PATTERN.source);
          const match = pattern.exec(value);

          if (match) {
            const textToTranslate = match[1];
            // Replace the TemplateLiteral node with a CallExpression node
            path.replaceWith(
              t.callExpression(
                t.identifier(translationMethod),
                [t.stringLiteral(textToTranslate)] // Use original text for translation key
              )
            );
            modified = true;
            // No need to push to replacements
          }
        }
        // Complex template literals with expressions are harder to handle reliably without potentially breaking logic.
        // Could add logic here to split them if needed, similar to JSXText.
      },

    });

    // If no modifications were made to the AST, return original code
    if (!modified) {
      return { code, extractedStrings };
    }

    // --- AST-based Hook Insertion ---
    // Check if hook needs to be added
    const needsHook = !hasTranslationHook(code, hookName) && modified;
    let importAdded = false;
    let hookCallAdded = false;

    if (needsHook) {
      traverse(ast, {
        Program: {
          enter(path) {
            // Check for existing import
            let importExists = false;
            path.node.body.forEach((node) => {
              if (
                t.isImportDeclaration(node) &&
                node.source.value === hookImport
              ) {
                node.specifiers.forEach((spec) => {
                  if (
                    t.isImportSpecifier(spec) &&
                    t.isIdentifier(spec.imported) &&
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

              // Find the correct insertion point after directives like 'use client' or comments
              let insertIndex = 0;
              for (let i = 0; i < path.node.body.length; i++) {
                const node = path.node.body[i];
                // Check for directives ('use client', 'use server', etc.)
                if (
                  t.isExpressionStatement(node) &&
                  t.isStringLiteral(node.expression)
                ) {
                  insertIndex = i + 1;
                  continue; // Keep checking after the directive
                }
                // Check for top-level comments attached to the first non-directive node
                if (
                  i === 0 &&
                  node.leadingComments &&
                  node.leadingComments.length > 0
                ) {
                  // If the first node has leading comments, insert after it.
                  // This assumes comments belong logically before the first statement.
                  // A more robust check might involve comment ranges, but this is simpler.
                  insertIndex = i + 1;
                  // If the first node is already an import, we still want to insert after potential comments/directives
                  // but before other code, so we might break here or continue depending on desired placement relative to other imports.
                  // For simplicity, let's place it after the first block of directives/comments.
                }

                // Stop searching for insertion point if we hit a non-directive/non-comment node
                // or an import declaration (we want to group imports, typically)
                if (
                  !t.isExpressionStatement(node) ||
                  !t.isStringLiteral(node.expression)
                ) {
                  // If it's not a directive, we've found where imports *should* start
                  // If it's already an import, insert at its position to group them
                  if (t.isImportDeclaration(node)) {
                    insertIndex = i;
                  }
                  break;
                }
              }

              // Insert the import declaration at the determined index
              path.node.body.splice(insertIndex, 0, importDeclaration);
              importAdded = true;
            }
          },
        },
       
      // Find the first suitable function body to insert the hook call
      "FunctionDeclaration|FunctionExpression|ArrowFunctionExpression": (
        path
      ) => {
        // Only check if hook is needed
        if (!needsHook) return;

        // 检查是否是嵌套函数，如果是嵌套在另一个函数内部，则不添加hook
        if (path.findParent(p => t.isFunction(p.node))) {
          return; // 这是嵌套函数，不应该添加hook
        }

        // Basic check: is this a component function?
        // More robust checks could verify if it returns JSX, etc.
        if (t.isFunction(path.node) && path.node.body && t.isBlockStatement(path.node.body)) {
          // 其余代码保持不变...
          let callExists = false;
          path.node.body.body.forEach((stmt) => {
            if (t.isVariableDeclaration(stmt)) {
              stmt.declarations.forEach((decl) => {
                if (
                  t.isVariableDeclarator(decl) &&
                  t.isObjectPattern(decl.id) && // Check for const { t }
                  t.isCallExpression(decl.init) &&
                  t.isIdentifier(decl.init.callee) &&
                  decl.init.callee.name === hookName
                ) {
                  callExists = true;
                }
              });
            }
          });

          if (!callExists) {
            // Create const { t } = useTranslation();
            const hookIdentifier = t.identifier(translationMethod);
            const objectPattern = t.objectPattern([
              t.objectProperty(hookIdentifier, hookIdentifier, false, true), // { t } or { translationMethod }
            ]);
            const callExpression = t.callExpression(
              t.identifier(hookName),
              []
            );
            const variableDeclarator = t.variableDeclarator(
              objectPattern,
              callExpression
            );
            const variableDeclaration = t.variableDeclaration("const", [
              variableDeclarator,
            ]);

            // Add hook call to the beginning of the function body with proper formatting
            if (t.isBlockStatement(path.node.body)) {
              path.node.body.body.unshift(variableDeclaration);
              hookCallAdded = true;
            }
          }
        }
        // Don't stop traversal - we need to process all component functions
      },
      });
    }

    // Generate code from the modified AST, preserving formatting where possible
    let { code: transformedCode } = generate(ast, {
      retainLines: true, // Set to true to better preserve code structure
      compact: false,
      comments: true,
      jsescOption: { minimal: true },
      shouldPrintComment: () => true, // Preserve all comments
    });

    // Post-process the generated code to ensure proper formatting of inserted hooks
    if (importAdded || hookCallAdded) {
      // Fix potential formatting issues with hook calls and imports
      transformedCode = transformedCode
        // Ensure hook declarations have their own line
        .replace(
          /(\{|\})\s*(const\s*\{\s*[a-zA-Z0-9_]+\s*\}\s*=\s*useTranslation\(\);)/g, 
          "$1\n  $2"
        )
        // Ensure closing brackets after hook declarations have proper spacing
        .replace(
          /(const\s*\{\s*[a-zA-Z0-9_]+\s*\}\s*=\s*useTranslation\(\);)(\S)/g,
          "$1\n  $2"
        )
        // Ensure import declarations are properly spaced
        .replace(
          /(import\s*\{\s*[a-zA-Z0-9_]+\s*\}\s*from\s*['"][^'"]+['"];)(\S)/g,
          "$1\n$2"
        );
    }

    return { code: transformedCode, extractedStrings };
  } catch (error) {
    // ... (keep existing fallback logic) ...
    console.error(`Error performing AST-based transformation: ${error}`);
    console.error("Falling back to simple regex replacement");
    let transformedCode = code;
    const fallbackPattern = options?.pattern
      ? new RegExp(options.pattern, "g")
      : DEFAULT_PATTERN;
    transformedCode = transformedCode.replace(
      fallbackPattern,
      (match, p1) => `${translationMethod}("${p1.replace(/"/g, '\\"')}")`
    );

    // Fallback hook insertion with improved formatting
    const hasHookAlready = hasTranslationHook(code, hookName);
    if (!hasHookAlready && extractedStrings.length > 0) {
      if (
        !transformedCode.includes(`import { ${hookName} } from '${hookImport}'`)
      ) {
        // Ensure import is on its own line with proper spacing
        transformedCode = `import { ${hookName} } from '${hookImport}';\n${transformedCode}`;
      }
      const functionComponentRegex =
        /(function\s+\w+\s*\(.*?\)\s*\{|const\s+\w+\s*=\s*\(.*?\)\s*=>\s*\{)/g;
      if (
        !transformedCode.includes(
          `const { ${translationMethod} } = ${hookName}()`
        )
      ) {
        // Place hook declaration on its own line with proper indentation
        transformedCode = transformedCode.replace(
          functionComponentRegex,
          `$1\n  const { ${translationMethod} } = ${hookName}();\n`
        );
      }
    }
    return { code: transformedCode, extractedStrings };
  }
}
