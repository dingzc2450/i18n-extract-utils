// fallback-transform.ts
// 仅适用于 React 代码的兜底替换与 hook/导入插入，不适用于 Vue。

import { getDefaultPattern } from "./core/utils";
import type { ExtractedString, TransformOptions } from "./types";
import * as t from "@babel/types";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";

/**
 * 检查代码中是否已存在指定的 React 翻译 hook 调用（如 useTranslation）。
 */
function hasTranslationHook(
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
          const functionParent = path.getFunctionParent();
          if (
            functionParent &&
            path.parentPath.isVariableDeclarator() &&
            path.parentPath.parentPath.isVariableDeclaration() &&
            path.parentPath.parentPath.parentPath.isBlockStatement() &&
            path.parentPath.parentPath.parentPath.parentPath === functionParent
          ) {
            hasHook = true;
            path.stop();
          } else if (
            functionParent &&
            path.parentPath.isExpressionStatement() &&
            path.parentPath.parentPath.isBlockStatement() &&
            path.parentPath.parentPath.parentPath === functionParent
          ) {
            hasHook = true;
            path.stop();
          }
        }
      },
    });
    return hasHook;
  } catch (error) {
    console.error(`Error analyzing code for hook: ${error}`);
    return false;
  }
}

/**
 * Fallback transformation for React: simple regex replacement and basic hook/import insertion.
 * 仅适用于 React。Vue 请使用 VuePlugin 的回退机制。
 * Uses the captured text as the key, similar to the default AST behavior without key generation/reuse.
 */
export function fallbackTransform(
  code: string,
  // extractedStrings is passed but might be unreliable in fallback, primarily used to check if *any* extraction happened.
  extractedStrings: ExtractedString[],
  options: TransformOptions
): string {
  const translationMethodOption = options.translationMethod || "t";
  // Determine the actual function name to call (e.g., 't' even if option is 'default')
  const effectiveMethodName =
    translationMethodOption === "default" ? "t" : translationMethodOption;
  const hookName = options.hookName || "useTranslation";
  const hookImport = options.hookImport || "react-i18next";
  const defaultPattern = getDefaultPattern();

  let transformedCode = code;
  const fallbackPattern = options?.pattern
    ? new RegExp(options.pattern, "g")
    : new RegExp(defaultPattern.source, "g");

  // 1. Perform regex replacement using the captured group as the key
  transformedCode = transformedCode.replace(fallbackPattern, (match, p1) => {
    // p1 is the captured text (the intended key/value)
    const key = p1;
    // Escape double quotes within the key for use in the string literal
    const escapedKey = key.replace(/"/g, '\\"');
    // Construct the translation call, e.g., t("Your Text")
    return `${effectiveMethodName}("${escapedKey}")`;
  });

  // 2. Check if hook/import insertion is needed
  // Base this on the original code and whether *any* strings were passed (even if potentially incomplete)
  // This assumes if AST parsing failed but strings were found, a hook might still be needed.
  const needsHook =
    !hasTranslationHook(code, hookName) && extractedStrings.length > 0;
  if (!needsHook) {
    return transformedCode; // Return early if no hook needed
  }

  // 3. Add import statement if missing (logic remains the same)
  const importStatement = `import { ${hookName} } from '${hookImport}';`;
  if (!transformedCode.includes(importStatement)) {
    const lines = transformedCode.split("\n");
    let lastImportIndex = -1;
    let directiveEndIndex = -1;
    // Find insertion point (after directives and imports)
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
        break; // Stop searching after the first non-import/directive/comment line
      }
    }
    let insertPosition = 0;
    if (lastImportIndex >= 0) {
      insertPosition = lastImportIndex + 1;
    } else if (directiveEndIndex >= 0) {
      insertPosition = directiveEndIndex + 1;
    }
    lines.splice(insertPosition, 0, importStatement);
    transformedCode = lines.join("\n");
  }

  // 4. Determine the correct hook call statement based on translationMethodOption (logic remains the same)
  let hookCallStatement: string;
  if (translationMethodOption === "default") {
    // If the option was 'default', the variable should be 't'
    hookCallStatement = `const t = ${hookName}();`;
  } else {
    // Otherwise, destructure the specific method name
    hookCallStatement = `const { ${translationMethodOption} } = ${hookName}();`;
  }

  // 5. Add hook call statement if missing (logic remains the same)
  if (!transformedCode.includes(hookCallStatement)) {
    // Very basic regex to find the start of a function/arrow function body
    const functionComponentRegex =
      /(function\s+\w+\s*\(.*?\)\s*\{|const\s+\w+\s*=\s*\(.*?\)\s*=>\s*\{)/g;
    let hookAdded = false;
    transformedCode = transformedCode.replace(functionComponentRegex, match => {
      // Add hook only once if multiple functions exist (simple approach)
      if (!hookAdded) {
        hookAdded = true;
        return `${match}\n  ${hookCallStatement}\n`; // Add hook call inside
      }
      return match;
    });
    // If regex didn't match (e.g., class component), hook won't be added by this simple fallback
  }

  return transformedCode;
}
