import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";
import { ExtractedString, TransformOptions } from "./types";
import fs from "fs";
import { extractStringsFromCode, getDefaultPattern } from "./string-extractor";
import { hasTranslationHook } from "./hook-utils";
import { formatGeneratedCode } from "./code-formatter";

// Helper function to create the replacement CallExpression node
function createTranslationCall(
  methodName: string,
  translationKey: string | number
): t.CallExpression {
  return t.callExpression(t.identifier(methodName), [
    typeof translationKey === "string"
      ? t.stringLiteral(translationKey)
      : t.numericLiteral(translationKey),
  ]);
}

export function transformCode(
  filePath: string,
  options: TransformOptions
): { code: string; extractedStrings: ExtractedString[] } {
  const code = fs.readFileSync(filePath, "utf8");
  // console.log(`[${filePath}] Original Code:\n${code}`); // Debugging

  // 1. Extract strings AND generate keys first
  const extractedStrings = extractStringsFromCode(code, filePath, options);
  // console.log(`[${filePath}] Extracted Strings:`, extractedStrings); // Debugging

  const translationMethod = options.translationMethod || "t";
  const hookName = options.hookName || "useTranslation";
  const hookImport = options.hookImport || "react-i18next";
  const defaultPattern = getDefaultPattern();

  if (extractedStrings.length === 0) {
    // console.log(`[${filePath}] No strings extracted, returning original code.`); // Debugging
    return { code, extractedStrings };
  }

  // Create a map for quick lookup of key by value during traversal
  const valueToKeyMap = new Map(extractedStrings.map((s) => [s.value, s.key]));
  // console.log(`[${filePath}] Value-to-Key Map:`, valueToKeyMap); // Debugging

  try {
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    let modified = false; // Track if *any* AST modification happened

    // --- String Replacement Traversal ---
    // console.log(`[${filePath}] Starting String Replacement Traversal...`); // Debugging
    traverse(ast, {
      JSXAttribute(path) {
        if (path.node.value && t.isStringLiteral(path.node.value)) {
          const attrValue = path.node.value.value;
          // Use a non-global regex for testing the attribute value
          // Create a new RegExp instance each time to avoid state issues with lastIndex
          const testPattern = options?.pattern
            ? new RegExp(options.pattern)
            : new RegExp(defaultPattern.source); // No 'g' flag
          const match = testPattern.exec(attrValue);

          if (match && match[1] !== undefined) {
            // Ensure capture group exists
            const textToTranslate = match[1];
            const translationKey = valueToKeyMap.get(textToTranslate);
            // console.log(`[${filePath}] JSXAttribute Match: value="${textToTranslate}", key="${translationKey}"`); // Debugging

            if (translationKey !== undefined) {
              // Replace the StringLiteral value with a JSXExpressionContainer containing the t() call
              path.node.value = t.jsxExpressionContainer(
                createTranslationCall(translationMethod, translationKey)
              );
              modified = true; // Mark modification
              // console.log(`[${filePath}] JSXAttribute Replaced.`); // Debugging
            } else {
              console.warn(
                `[${filePath}] Warning: Found match "${textToTranslate}" in JSX attribute but no key in valueToKeyMap.`
              );
            }
          }
        }
      },
      StringLiteral(path) {
        // Skip if part of JSX attribute (handled above) or import/export declaration
        if (
          path.parentPath.isJSXAttribute() ||
          path.parentPath.isImportDeclaration() ||
          path.parentPath.isExportDeclaration()
        ) {
          return;
        }
        const literalValue = path.node.value;
        const testPattern = options?.pattern
          ? new RegExp(options.pattern)
          : new RegExp(defaultPattern.source); // No 'g' flag
        const match = testPattern.exec(literalValue);

        if (match && match[1] !== undefined) {
          const textToTranslate = match[1];
          const translationKey = valueToKeyMap.get(textToTranslate);
          // console.log(`[${filePath}] StringLiteral Match: value="${textToTranslate}", key="${translationKey}"`); // Debugging

          if (translationKey !== undefined) {
            // Replace the StringLiteral node with the t() call expression
            path.replaceWith(
              createTranslationCall(translationMethod, translationKey)
            );
            modified = true; // Mark modification
            // console.log(`[${filePath}] StringLiteral Replaced.`); // Debugging
          } else {
            console.warn(
              `[${filePath}] Warning: Found match "${textToTranslate}" in StringLiteral but no key in valueToKeyMap.`
            );
          }
        }
      },
      JSXText(path) {
        const textValue = path.node.value;
        // Use global pattern for potentially multiple replacements within JSX text
        const globalPattern = options?.pattern
          ? new RegExp(options.pattern, "g")
          : new RegExp(defaultPattern.source, "g");
        let match;
        let lastIndex = 0;
        const newNodes: (t.JSXText | t.JSXExpressionContainer)[] = [];
        let textModified = false; // Track modification specifically for this node

        // Reset lastIndex for each JSXText node
        globalPattern.lastIndex = 0;

        while ((match = globalPattern.exec(textValue)) !== null) {
          if (match[1] === undefined) continue; // Skip if capture group is empty

          const textToTranslate = match[1];
          const translationKey = valueToKeyMap.get(textToTranslate);
          // console.log(`[${filePath}] JSXText Match: value="${textToTranslate}", key="${translationKey}"`); // Debugging

          if (translationKey !== undefined) {
            const matchStart = match.index;
            // Use match[0].length to determine the end, more reliable than lastIndex with potential zero-width matches
            const matchEnd = matchStart + match[0].length;

            // Add preceding text if any
            if (matchStart > lastIndex) {
              const precedingText = textValue.substring(lastIndex, matchStart);
              // Only add if it contains non-whitespace characters
              if (/\S/.test(precedingText)) {
                newNodes.push(t.jsxText(precedingText));
              }
            }

            // Add the translation call expression
            newNodes.push(
              t.jsxExpressionContainer(
                createTranslationCall(translationMethod, translationKey)
              )
            );
            lastIndex = matchEnd;
            textModified = true; // Mark this node as modified
          } else {
            console.warn(
              `[${filePath}] Warning: Found match "${textToTranslate}" in JSXText but no key in valueToKeyMap.`
            );
            // If key not found, advance lastIndex to avoid infinite loop on non-key matches
            // Use match[0].length to advance past the matched pattern
            lastIndex = match.index + match[0].length;
            // Ensure exec loop continues correctly even if key not found
            globalPattern.lastIndex = lastIndex;
          }
        }

        // Add remaining text if any
        if (lastIndex < textValue.length) {
          const remainingText = textValue.substring(lastIndex);
          if (/\S/.test(remainingText)) {
            // Only add if it contains non-whitespace
            newNodes.push(t.jsxText(remainingText));
          }
        }

        // Replace the original JSXText node if modifications were made
        if (textModified && newNodes.length > 0) {
          // Check if the only node is the original text (no actual replacement needed)
          if (
            newNodes.length === 1 &&
            t.isJSXText(newNodes[0]) &&
            newNodes[0].value === textValue
          ) {
            // No effective change, do nothing
          } else {
            path.replaceWithMultiple(newNodes);
            modified = true; // Mark overall modification
            // console.log(`[${filePath}] JSXText Replaced.`); // Debugging
          }
        }
      },
      TemplateLiteral(path) {
        // Skip tagged template literals
        if (path.parentPath.isTaggedTemplateExpression()) {
          return;
        }
        // Only handle simple template literals without expressions
        if (
          path.node.quasis.length === 1 &&
          path.node.expressions.length === 0
        ) {
          const templateValue = path.node.quasis[0].value.raw; // Use raw value
          const testPattern = options?.pattern
            ? new RegExp(options.pattern)
            : new RegExp(defaultPattern.source); // No 'g' flag
          const match = testPattern.exec(templateValue);

          if (match && match[1] !== undefined) {
            const textToTranslate = match[1];
            const translationKey = valueToKeyMap.get(textToTranslate);
            // console.log(`[${filePath}] TemplateLiteral Match: value="${textToTranslate}", key="${translationKey}"`); // Debugging

            if (translationKey !== undefined) {
              path.replaceWith(
                createTranslationCall(translationMethod, translationKey)
              );
              modified = true; // Mark modification
              // console.log(`[${filePath}] TemplateLiteral Replaced.`); // Debugging
            } else {
              console.warn(
                `[${filePath}] Warning: Found match "${textToTranslate}" in TemplateLiteral but no key in valueToKeyMap.`
              );
            }
          }
        }
      },
    }); // End String Replacement Traversal

    // console.log(`[${filePath}] String Replacement Traversal Complete. Modified: ${modified}`); // Debugging

    // If no strings were replaced by the first traversal, return original code
    if (!modified) {
      // console.log(`[${filePath}] No modifications made, returning original code.`); // Debugging
      return { code, extractedStrings };
    }

    // --- Hook Insertion Logic ---
    // Check original code for hook existence, and if any modifications were made
    const hookAlreadyExists = hasTranslationHook(code, hookName);
    const needsHook = !hookAlreadyExists && modified; // Use the 'modified' flag determined above
    let importAdded = false;
    let hookCallAdded = false;

    // console.log(`[${filePath}] Hook Check: hookAlreadyExists=${hookAlreadyExists}, modified=${modified}, needsHook=${needsHook}`); // Debugging

    if (needsHook) {
      // console.log(`[${filePath}] Entering Hook Insertion Traversal...`); // Debugging
      // Traverse the *modified* AST again to add imports and hooks
      traverse(ast, {
        Program: {
          enter(path) {
            // Check if import already exists in the potentially modified AST
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
              // console.log(`[${filePath}] Adding import for ${hookName} from ${hookImport}`); // Debugging
              const importSpecifier = t.importSpecifier(
                t.identifier(hookName),
                t.identifier(hookName)
              );
              const importDeclaration = t.importDeclaration(
                [importSpecifier],
                t.stringLiteral(hookImport)
              );

              // Find the correct insertion point: after the last directive or last import.
              let lastDirectiveIndex = -1;
              let lastImportIndex = -1;
              for (let i = 0; i < path.node.body.length; i++) {
                const node = path.node.body[i];
                if (
                  t.isExpressionStatement(node) &&
                  t.isStringLiteral(node.expression) &&
                  path.node.directives?.some(
                    (dir) => dir.value.value === node.expression.value
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
              importAdded = true; // Set flag
            } else {
              // console.log(`[${filePath}] Import for ${hookName} already exists.`); // Debugging
            }
          },
        },
        "FunctionDeclaration|FunctionExpression|ArrowFunctionExpression": (
          path
        ) => {
          // Only add hook to top-level functions (potential components)
          if (path.findParent((p) => t.isFunction(p.node))) {
            return; // Skip nested functions
          }

          // Check if it looks like a React component (simple check: returns JSX)
          let returnsJSX = false;
          path.traverse({
            ReturnStatement(returnPath) {
              if (
                returnPath.node.argument &&
                (t.isJSXElement(returnPath.node.argument) ||
                  t.isJSXFragment(returnPath.node.argument))
              ) {
                returnsJSX = true;
                returnPath.stop(); // Stop inner traversal once JSX is found
              }
            },
          });

          // Only add hook if it seems like a component and has a block body
          if (
            returnsJSX &&
            t.isFunction(path.node) &&
            path.node.body &&
            t.isBlockStatement(path.node.body)
          ) {
            // Check if hook call already exists in this function
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

            // Add hook call if it doesn't exist
            if (!callExists) {
              // console.log(`[${filePath}] Adding hook call ${hookName}() in function ${path.node.id?.name || '(anonymous)'}`); // Debugging
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
              // Add to the beginning of the function body
              path.node.body.body.unshift(variableDeclaration);
              hookCallAdded = true; // Set flag
            } else {
              // console.log(`[${filePath}] Hook call ${hookName}() already exists in function ${path.node.id?.name || '(anonymous)'}`); // Debugging
            }
          }
        },
      }); // End Hook Insertion Traversal
    } // End if (needsHook)

    // 3. Generate code from the final AST
    // console.log(`[${filePath}] Generating code from AST...`); // Debugging
    let { code: generatedCode } = generate(ast, {
      retainLines: true, // Let formatter handle lines/spacing
      compact: false,
      comments: true,
      jsescOption: { minimal: true }, // Avoid unnecessary escapes
    });

    // console.log(`[${filePath}] Raw generated code:\n${generatedCode}`); // Debugging

    // 4. Format the generated code using the dedicated function
    // console.log(`[${filePath}] Formatting code (importAdded: ${importAdded}, hookCallAdded: ${hookCallAdded})`); // Debugging
    // Re-enable formatting - if issues persist after this fix, the formatter is the likely culprit
    const transformedCode = formatGeneratedCode(
      generatedCode,
      importAdded,
      hookCallAdded
    );
    // const transformedCode = generatedCode; // Keep formatting disabled if still debugging

    // console.log(`[${filePath}] Final transformed code:\n${transformedCode}`); // Debugging

    return { code: transformedCode, extractedStrings };
  } catch (error) {
    console.error(`[${filePath}] Error during AST transformation: ${error}`);
    // Log the stack trace for better debugging
    if (error instanceof Error) {
      console.error(error.stack);
    }
    console.error(
      `[${filePath}] Falling back to simple regex replacement (key generation not supported in fallback)`
    );

    // --- Fallback Logic ---
    // (Fallback logic remains unchanged)
    let transformedCode = code;
    const fallbackPattern = options?.pattern
      ? new RegExp(options.pattern, "g")
      : new RegExp(defaultPattern.source, "g");
    transformedCode = transformedCode.replace(
      fallbackPattern,
      (match, p1) => `${translationMethod}("${p1.replace(/"/g, '\\"')}")`
    );

    const hasHookAlready = hasTranslationHook(code, hookName);
    if (!hasHookAlready && extractedStrings.length > 0) {
      if (
        !transformedCode.includes(`import { ${hookName} } from '${hookImport}'`)
      ) {
        const lines = transformedCode.split("\n");
        let lastImportIndex = -1;
        let directiveEndIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith("'use ") || line.startsWith('"use ')) {
            directiveEndIndex = i;
          } else if (line.startsWith("import ")) {
            lastImportIndex = i;
          } else if (
            line &&
            !line.startsWith("//") &&
            !line.startsWith("/*") &&
            !line.startsWith("*") &&
            !line.startsWith("*/")
          ) {
            break;
          }
        }
        let insertPosition = 0;
        if (lastImportIndex >= 0) {
          insertPosition = lastImportIndex + 1;
        } else if (directiveEndIndex >= 0) {
          insertPosition = directiveEndIndex + 1;
        }
        lines.splice(
          insertPosition,
          0,
          `import { ${hookName} } from '${hookImport}';`
        );
        // Add blank lines logic if needed here too
        transformedCode = lines.join("\n");
      }
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
    // Return original extractedStrings which includes keys, even though fallback didn't use them for replacement
    return { code: transformedCode, extractedStrings };
  }
}

// Keep export if needed, but it's also in string-extractor.ts
// export { extractStringsFromCode };
