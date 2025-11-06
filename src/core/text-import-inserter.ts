/**
 * 轻量级的文本级导入/Hook 插入器
 * 目标：在不大幅重排代码的前提下，最小化插入 import 与 hook 调用。
 */

/** 判断是否已存在指定命名导入 */
export function hasNamedImport(
  code: string,
  source: string,
  importName: string
): boolean {
  const src = escapeRegex(source);
  const name = escapeRegex(importName);
  const re = new RegExp(
    `import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]${src}['"]`
  );
  return re.test(code);
}

/** 在最后一个 import 后插入命名导入 */
export function insertNamedImport(
  code: string,
  source: string,
  importName: string
): string {
  const importLine = `import { ${importName} } from "${source}";`;
  const lines = code.split("\n");
  let lastImportIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("import ")) {
      lastImportIndex = i;
    } else if (line && !line.startsWith("//") && !line.startsWith("/*")) {
      break;
    }
  }
  const insertIndex = lastImportIndex >= 0 ? lastImportIndex + 1 : 0;
  lines.splice(insertIndex, 0, importLine);
  return lines.join("\n");
}

/** 判断是否已存在 hook 解构（如 const { t } = useI18n(); 或 const t = useI18n();） */
export function hasHookDestructure(
  code: string,
  variableName: string,
  hookName: string
): boolean {
  const v = escapeRegex(variableName);
  const h = escapeRegex(hookName);
  const destructured = new RegExp(
    `const\\s*\\{[^}]*\\b${v}\\b[^}]*\\}\\s*=\\s*${h}\\s*\\(\\s*\\)`
  );
  const directAssign = new RegExp(`const\\s+${v}\\s*=\\s*${h}\\s*\\(\\s*\\)`);
  return destructured.test(code) || directAssign.test(code);
}

/** 在 setup 函数体开头或顶层插入 hook 调用 */
export function insertHookInSetupOrTop(
  code: string,
  hookCallLine: string
): string {
  // 尝试匹配 options API: setup(...) { ... }
  const setupPattern = /(setup\s*\([^)]*\)\s*\{)/m;
  const match = setupPattern.exec(code);
  if (match && match.index !== undefined) {
    const insertPos = match.index + match[0].length;
    const indent = detectIndentBefore(code, match.index) + "  ";
    return (
      code.slice(0, insertPos) +
      `\n${indent}${hookCallLine}` +
      code.slice(insertPos)
    );
  }

  // 若未匹配到 setup，则退化为顶层最后一个 import 之后插入一行
  const lines = code.split("\n");
  let lastImportIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("import ")) {
      lastImportIndex = i;
    } else if (line && !line.startsWith("//") && !line.startsWith("/*")) {
      break;
    }
  }
  const insertIndex = lastImportIndex >= 0 ? lastImportIndex + 1 : 0;
  lines.splice(insertIndex, 0, hookCallLine);
  return lines.join("\n");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectIndentBefore(code: string, index: number): string {
  const nl = code.lastIndexOf("\n", index);
  if (nl === -1) return "";
  const start = nl + 1;
  let i = start;
  while (i < code.length && (code[i] === " " || code[i] === "\t")) i++;
  return code.slice(start, i);
}
