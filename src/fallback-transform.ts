import { hasTranslationHook } from "./hook-utils";
import { getDefaultPattern } from "./string-extractor";
import { ExtractedString, TransformOptions } from "./types";

/**
 * Fallback transformation: simple regex replacement and basic hook/import insertion.
 * 用于AST处理失败时的降级操作：简单正则替换和基础hook/import插入。
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
  return transformedCode;
}