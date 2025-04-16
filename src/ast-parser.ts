import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";
import { ExtractedString, TransformOptions } from "./types";
import fs from "fs";
import { extractStringsFromCode, getDefaultPattern } from "./string-extractor"; // Import from new module
import { hasTranslationHook } from "./hook-utils"; // Import from new module
import { formatGeneratedCode } from "./code-formatter"; // Import from new module

/**
 * Transforms the code in a file by replacing tagged strings with translation function calls,
 * adding necessary imports and hook calls.
 * @param filePath The path to the file to transform.
 * @param options Transformation options.
 * @returns An object containing the transformed code and a list of extracted strings.
 */
export function transformCode(
  filePath: string,
  options: TransformOptions
): { code: string; extractedStrings: ExtractedString[] } {
  const code = fs.readFileSync(filePath, "utf8");

  // 1. Extract strings AND generate keys first
  const extractedStrings = extractStringsFromCode(code, filePath, options);

  const translationMethod = options.translationMethod || "t";
  const hookName = options.hookName || "useTranslation";
  const hookImport = options.hookImport || "react-i18next";
  const defaultPattern = getDefaultPattern(); // Get default pattern if needed

  // If no strings to translate, return early
  if (extractedStrings.length === 0) {
    return { code, extractedStrings };
  }

  // Create a map for quick lookup of key by value during traversal
  const valueToKeyMap = new Map(extractedStrings.map(s => [s.value, s.key]));

  // 2. Perform AST-based transformations
  try {
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    let modified = false; // Track if any modifications were made

    // --- String Replacement Traversal ---
    traverse(ast, {
      // Visitor functions for JSXAttribute, StringLiteral, JSXText, TemplateLiteral
      // remain largely the same, but ensure they use the correct pattern logic
      JSXAttribute(path) {
        if (path.node.value && t.isStringLiteral(path.node.value)) {
          const value = path.node.value.value;
          const pattern = options?.pattern
            ? new RegExp(options.pattern) // Non-global for single match check
            : new RegExp(defaultPattern.source); // Use source from default
          const match = pattern.exec(value);

          if (match) {
            const textToTranslate = match[1];
            const translationKey = valueToKeyMap.get(textToTranslate) ?? textToTranslate;
            path.node.value = t.jsxExpressionContainer(
              t.callExpression(t.identifier(translationMethod), [
                t.stringLiteral(translationKey),
              ])
            );
            modified = true;
          }
        }
      },
      StringLiteral(path) {
        if (
          path.parentPath.isJSXAttribute() ||
          path.parentPath.isImportDeclaration()
        ) {
          return;
        }
        const value = path.node.value;
        const pattern = options?.pattern
          ? new RegExp(options.pattern) // Non-global
          : new RegExp(defaultPattern.source);
        const match = pattern.exec(value);
        if (match) {
          const textToTranslate = match[1];
          const translationKey = valueToKeyMap.get(textToTranslate) ?? textToTranslate;
          path.replaceWith(
            t.callExpression(t.identifier(translationMethod), [
              t.stringLiteral(translationKey),
            ])
          );
          modified = true;
        }
      },
      JSXText(path) {
        const value = path.node.value;
        const pattern = options?.pattern
          ? new RegExp(options.pattern, "g") // Global for multiple matches
          : new RegExp(defaultPattern.source, "g");
        let match;
        let lastIndex = 0;
        const newNodes: (t.JSXText | t.JSXExpressionContainer)[] = [];

        while ((match = pattern.exec(value)) !== null) {
          const textToTranslate = match[1];
          const translationKey = valueToKeyMap.get(textToTranslate) ?? textToTranslate;
          const matchStart = match.index;
          const matchEnd = matchStart + match[0].length;

          if (matchStart > lastIndex) {
            const textNode = t.jsxText(value.substring(lastIndex, matchStart));
            if (textNode.value.trim()) newNodes.push(textNode);
          }

          newNodes.push(
            t.jsxExpressionContainer(
              t.callExpression(t.identifier(translationMethod), [
                t.stringLiteral(translationKey),
              ])
            )
          );
          lastIndex = matchEnd;
        }

        if (lastIndex < value.length) {
          const textNode = t.jsxText(value.substring(lastIndex));
          if (textNode.value.trim()) newNodes.push(textNode);
        }

        if (
          newNodes.length > 0 &&
          (newNodes.length > 1 ||
            !t.isJSXText(newNodes[0]) ||
            newNodes[0].value !== value)
        ) {
          path.replaceWithMultiple(newNodes);
          modified = true;
        }
      },
      TemplateLiteral(path) {
        if (path.parentPath.isTaggedTemplateExpression()) {
          return;
        }
        if (
          path.node.quasis.length === 1 &&
          path.node.expressions.length === 0
        ) {
          const value = path.node.quasis[0].value.raw;
          const pattern = options?.pattern
            ? new RegExp(options.pattern) // Non-global
            : new RegExp(defaultPattern.source);
          const match = pattern.exec(value);
          if (match) {
            const textToTranslate = match[1];
            const translationKey = valueToKeyMap.get(textToTranslate) ?? textToTranslate;
            path.replaceWith(
              t.callExpression(t.identifier(translationMethod), [
                t.stringLiteral(translationKey),
              ])
            );
            modified = true;
          }
        }
      },
    });

    // If no strings were replaced, return original code
    if (!modified) {
      return { code, extractedStrings };
    }

    // --- Hook Insertion Logic ---
    // Check if hook needs to be added using the dedicated function
    const needsHook = !hasTranslationHook(code, hookName) && modified;
    let importAdded = false;
    let hookCallAdded = false;

    if (needsHook) {
      // Traversal logic to add import and hook call remains here for now
      // This could also be moved to hook-utils.ts if desired
      traverse(ast, {
        Program: {
          enter(path) {
            // Logic to check for existing import and add if missing
            // (Keep the existing robust logic for finding insertion point)
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

            if (!importExists) {
              const importSpecifier = t.importSpecifier(
                t.identifier(hookName),
                t.identifier(hookName)
              );
              const importDeclaration = t.importDeclaration(
                [importSpecifier],
                t.stringLiteral(hookImport)
              );

              let lastDirectiveIndex = -1;
              let lastImportIndex = -1;
              for (let i = 0; i < path.node.body.length; i++) {
                const node = path.node.body[i];
                if (
                  t.isExpressionStatement(node) &&
                  t.isStringLiteral(node.expression) &&
                  path.node.directives?.some(
                    (dir) => t.isStringLiteral(node.expression) && dir.value.value === node.expression.value
                  )
                ) {
                  lastDirectiveIndex = i;
                } else if (t.isImportDeclaration(node)) {
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
        "FunctionDeclaration|FunctionExpression|ArrowFunctionExpression": (
          path
        ) => {
          // Logic to check if it's a non-nested function and add hook call if missing
          // (Keep the existing logic)
          if (!needsHook || path.findParent((p) => t.isFunction(p.node))) {
            return;
          }

          if (
            t.isFunction(path.node) &&
            path.node.body &&
            t.isBlockStatement(path.node.body)
          ) {
            let callExists = false;
            path.node.body.body.forEach((stmt) => {
              if (t.isVariableDeclaration(stmt)) {
                stmt.declarations.forEach((decl) => {
                  if (
                    t.isVariableDeclarator(decl) &&
                    t.isObjectPattern(decl.id) &&
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
              const hookIdentifier = t.identifier(translationMethod);
              const objectPattern = t.objectPattern([
                t.objectProperty(hookIdentifier, hookIdentifier, false, true),
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
              path.node.body.body.unshift(variableDeclaration);
              hookCallAdded = true;
            }
          }
        },
      });
    }

    // 3. Generate code from the modified AST
    let { code: generatedCode } = generate(ast, {
      retainLines: true,
      compact: false,
      comments: true,
      shouldPrintComment: () => true,
    });

    // 4. Format the generated code using the dedicated function
    const transformedCode = formatGeneratedCode(
      generatedCode,
      importAdded,
      hookCallAdded
    );

    return { code: transformedCode, extractedStrings };
  } catch (error) {
    // --- Fallback Logic ---
    console.error(`Error performing AST-based transformation: ${error}`);
    console.error("Falling back to simple regex replacement");
    // Keep the existing fallback logic using regex replacement and simple string insertion
    // This part doesn't use the new modules as it's a simpler, non-AST approach.
    let transformedCode = code;
    const fallbackPattern = options?.pattern
      ? new RegExp(options.pattern, "g")
      : new RegExp(defaultPattern.source, "g"); // Use default pattern source
    transformedCode = transformedCode.replace(
      fallbackPattern,
      (match, p1) => `${translationMethod}("${p1.replace(/"/g, '\\"')}")`
    );

    const hasHookAlready = hasTranslationHook(code, hookName); // Still use hook check
    if (!hasHookAlready && extractedStrings.length > 0) {
      // Fallback import insertion (less precise positioning)
      if (
        !transformedCode.includes(`import { ${hookName} } from '${hookImport}'`)
      ) {
        // Basic insertion at the top after potential directives
        const lines = transformedCode.split("\n");
        let insertLine = 0;
        for (let i = 0; i < lines.length; i++) {
          const trimmedLine = lines[i].trim();
          if (
            trimmedLine.startsWith("'use ") ||
            trimmedLine.startsWith('"use ')
          ) {
            insertLine = i + 1;
          } else if (
            trimmedLine !== "" &&
            !trimmedLine.startsWith("//") &&
            !trimmedLine.startsWith("/*")
          ) {
            // Stop if we hit actual code before finding directives
            break;
          }
        }
        lines.splice(
          insertLine,
          0,
          `import { ${hookName} } from '${hookImport}';`,
          ""
        ); // Add import and a blank line
        transformedCode = lines.join("\n");
      }
      // Fallback hook call insertion
      const functionComponentRegex =
        /(function\s+\w+\s*\(.*?\)\s*\{|const\s+\w+\s*=\s*\(.*?\)\s*=>\s*\{)/g;
      if (
        !transformedCode.includes(
          `const { ${translationMethod} } = ${hookName}()`
        )
      ) {
        transformedCode = transformedCode.replace(
          functionComponentRegex,
          `$1\n  const { ${translationMethod} } = ${hookName}();\n`
        );
      }
    }
    return { code: transformedCode, extractedStrings };
  }
}

export { extractStringsFromCode };
