import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

/**
 * Checks if the code already contains a specific translation hook call.
 * @param code The source code content.
 * @param hookName The name of the hook to check for (e.g., "useTranslation").
 * @returns True if the hook call exists, false otherwise.
 */
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
          // Basic check: Ensure it's likely a hook call at the top level of a function scope
          const functionParent = path.getFunctionParent();
          if (functionParent && path.parentPath.isVariableDeclarator() && path.parentPath.parentPath.isVariableDeclaration() && path.parentPath.parentPath.parentPath.isBlockStatement() && path.parentPath.parentPath.parentPath.parentPath === functionParent) {
             hasHook = true;
             path.stop(); // Stop traversal once found
          } else if (functionParent && path.parentPath.isExpressionStatement() && path.parentPath.parentPath.isBlockStatement() && path.parentPath.parentPath.parentPath === functionParent) {
             // Handle cases where the hook isn't assigned, though less common for useTranslation
             hasHook = true;
             path.stop();
          }
        }
      },
    });

    return hasHook;
  } catch (error) {
    console.error(`Error analyzing code for hook: ${error}`);
    // In case of parsing error, assume hook might exist to be safe or handle differently
    return false; // Or potentially true depending on desired fallback behavior
  }
}

// You could potentially add functions here to insert the hook import and call via AST manipulation
// e.g., insertHookImport(ast, hookName, hookImport), insertHookCall(ast, hookName, translationMethod)
// For now, we keep that logic within the main transform function but it's a candidate for extraction.