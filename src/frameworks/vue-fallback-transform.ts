// Vue 专用兜底替换与导入逻辑，仅用于 Vue 代码的 fallback 处理
import { ExtractedString, TransformOptions } from "../types";

/**
 * Vue 专用兜底替换与导入逻辑
 * 仅用于 Vue 代码的 fallback 处理
 */
export function vueFallbackTransform(
  code: string,
  extractedStrings: ExtractedString[],
  options: TransformOptions
): string {
  const i18nConfig = options.i18nConfig || {};
  const i18nImportConfig = i18nConfig.i18nImport || {
    name: '$t',
    importName: 'useI18n',
    source: 'vue-i18n'
  };
  const translationMethod = i18nImportConfig.name || '$t';
  const hookName = i18nImportConfig.importName || 'useI18n';
  const hookImport = i18nImportConfig.source || 'vue-i18n';
  const defaultPattern = options?.pattern ? new RegExp(options.pattern, 'g') : /___(.+?)___/g;

  let transformedCode = code;
  // 1. 替换文本为 $t("xxx")
  transformedCode = transformedCode.replace(
    defaultPattern,
    (match, p1) => {
      const key = p1;
      const escapedKey = key.replace(/"/g, '\"');
      return `${translationMethod}("${escapedKey}")`;
    }
  );

  // 2. 检查是否需要插入 import
  const importStatement = `import { ${hookName} } from '${hookImport}';`;
  if (!transformedCode.includes(importStatement)) {
    const lines = transformedCode.split("\n");
    let lastImportIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith("import ")) {
        lastImportIndex = i;
      }
    }
    const insertPosition = lastImportIndex >= 0 ? lastImportIndex + 1 : 0;
    lines.splice(insertPosition, 0, importStatement);
    transformedCode = lines.join("\n");
  }

  // 3. 插入 hook 调用（支持 <script setup> 场景）
  const hookCallStatement = `const { ${translationMethod} } = ${hookName}();`;
  if (!transformedCode.includes(hookCallStatement)) {
    // 优先插入到 <script setup> 内部
    const scriptSetupRegex = /(<script\s+setup[^>]*>)([\s\S]*?)(<\/script>)/i;
    if (scriptSetupRegex.test(transformedCode)) {
      transformedCode = transformedCode.replace(
        scriptSetupRegex,
        (match, startTag, scriptContent, endTag) => {
          // 避免重复插入
          if (scriptContent.includes(hookCallStatement)) return match;
          return `${startTag}\n${hookCallStatement}\n${scriptContent.trim()}\n${endTag}`;
        }
      );
    } else {
      // 兼容 setup() 函数体插入
      const setupRegex = /(setup\s*\([^)]*\)\s*{)/;
      if (setupRegex.test(transformedCode)) {
        transformedCode = transformedCode.replace(
          setupRegex,
          (match) => `${match}\n  ${hookCallStatement}\n`
        );
      }
    }
  }

  return transformedCode;
}
