import * as t from "@babel/types";
import generate from "@babel/generator";
/**
 * Applies post-processing formatting fixes to the generated code.
 * Focuses on ensuring imports and hook calls have proper spacing and newlines.
 * @param code The generated code string.
 * @param importAdded Whether a new import statement was added.
 * @param hookCallAdded Whether a new hook call was added.
 * @param hookName The hook function name (e.g. useTranslation/useTranslations).
 * @param translationMethod The translation method name (e.g. t, default, etc).
 * @returns The formatted code string.
 */
export function formatGeneratedCode(
  code: string,
  {
    importAdded,
    hookCallAdded,
    hookName,
    hookImport,
    translationMethod,
  }: {
    importAdded: boolean;
    hookCallAdded: boolean;
    hookName: string;
    hookImport: string;
    translationMethod?: string;
  }
): string {
  let formattedCode = code;

  // 1. 只在 importAdded 时处理 import 格式，避免重复加换行
  if (importAdded) {
    // 保证所有 import 语句前后只有一个换行
    const lines = formattedCode.split("\n");
    // 通过判断当前语句是否为 import 语句来决定是否添加换行
    const targetImportLineIndex = lines.findIndex(
      (line) => line.trim().startsWith("import") && line.includes(hookImport)
    );
    if (targetImportLineIndex !== -1) {
      const line = lines[targetImportLineIndex];
      // 需要这行结尾索引
      const lineEndIndex = line.indexOf(";");
      if (lineEndIndex !== line.length - 1) {
        // 更改这一行加一个换行
        lines[targetImportLineIndex] =
          line.slice(0, lineEndIndex + 1) + "\n" + line.slice(lineEndIndex + 1);
      }
    }
    // 处理完后，去掉多余的空行
    // 1. 去掉开头的空行
    while (lines.length > 0 && lines[0].trim() === "") {
      lines.shift();
    }
    formattedCode = lines.join("\n");
  }

  // 2. 针对 hookCallAdded，动态生成 hook 语句并确保其独占一行
  // 修复：只做格式化，不做全局替换，避免多组件时丢失hook声明
  if (hookCallAdded && hookName) {
    let hookCallCode = "";
    if (translationMethod === "default") {
      // const t = useTranslations();
      const call = t.callExpression(t.identifier(hookName), []);
      const decl = t.variableDeclaration("const", [
        t.variableDeclarator(t.identifier("t"), call),
      ]);
      hookCallCode = generate(decl).code;
    } else if (translationMethod) {
      // const { t } = useTranslation();
      const call = t.callExpression(t.identifier(hookName), []);
      const id = t.identifier(translationMethod);
      const objPattern = t.objectPattern([
        t.objectProperty(id, id, false, true),
      ]);
      const decl = t.variableDeclaration("const", [
        t.variableDeclarator(objPattern, call),
      ]);
      hookCallCode = generate(decl, {
        retainLines: true,
        compact: false,
        comments: true,
        jsescOption: { minimal: true },
      }).code.trim();
    }
    // 只做格式化，不做全局替换，避免多组件时丢失hook声明
    if (hookCallCode) {
      // 保证每个 hook 语句上下都有换行（不做全局替换，只做局部格式修正）
      const lines = formattedCode.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes(hookCallCode)) {
          const startIndex = line.indexOf(hookCallCode);
          const endIndex = startIndex + hookCallCode.length;
          // 判断startIndex是否为首字符
          if (!startIndex) {
            break;
          }
          // 判断 startIndex前方是否有换行
          let j = startIndex - 1;
          // 判断j是否为空字符串
          let isHasNewLine = false;
          while (j > 0 && /\s/.test(line[j])) {
            if (line[j] == "\n") {
              isHasNewLine = true;
              break;
            }
            j--;
          }

          if (!isHasNewLine) {
            lines[i] =
              line.slice(0, startIndex) + "\n" + line.slice(startIndex);
          }
        }
      }
      formattedCode = lines.join("\n");
    }
  }

  return formattedCode;
}
