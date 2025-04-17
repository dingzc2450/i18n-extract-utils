import { hasTranslationHook } from "./hook-utils";
import { getDefaultPattern } from "./string-extractor";
import { ExtractedString, TransformOptions } from "./types";

/**
 * Fallback transformation: simple regex replacement and basic hook/import insertion.
 * 用于AST处理失败时的降级操作：简单正则替换和基础hook/import插入。
 *
 * 新增：当 translationMethod 为 'default' 时，hook 解构语句变为 const t = useTranslations();
 */
export function fallbackTransform(
  code: string,
  extractedStrings: ExtractedString[],
  options: TransformOptions
): string {
  const translationMethod = options.translationMethod || "t";
  const hookName = options.hookName || "useTranslation";
  const hookImport = options.hookImport || "react-i18next";
  const defaultPattern = getDefaultPattern();

  let transformedCode = code;
  const fallbackPattern = options?.pattern
    ? new RegExp(options.pattern, "g")
    : new RegExp(defaultPattern.source, "g");

  // 1. Perform the basic regex replacement for translation calls
  transformedCode = transformedCode.replace(
    fallbackPattern,
    (match, p1) => `${translationMethod}("${p1.replace(/"/g, '\\"')}")`
  );

  // 2. Check if hook/import insertion is needed (early exit if not)
  const needsHook = !hasTranslationHook(code, hookName) && extractedStrings.length > 0;
  if (!needsHook) {
    return transformedCode;
  }

  // 3. Add import statement if missing
  const importStatement = `import { ${hookName} } from '${hookImport}';`;
  if (!transformedCode.includes(importStatement)) {
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

  // 4. Determine the correct hook call statement based on translationMethod
  let hookCallStatement: string;
  if (translationMethod === "default") {
    hookCallStatement = `const t = ${hookName}();`;
  } else {
    hookCallStatement = `const { ${translationMethod} } = ${hookName}();`;
  }

  // 5. Add hook call statement if missing
  if (!transformedCode.includes(hookCallStatement)) {
    const functionComponentRegex =
      /(function\s+\w+\s*\(.*?\)\s*\{|const\s+\w+\s*=\s*\(.*?\)\s*=>\s*\{)/g;
    transformedCode = transformedCode.replace(
      functionComponentRegex,
      `$1\n  ${hookCallStatement}\n` // Use the determined statement
    );
  }

  return transformedCode;
}