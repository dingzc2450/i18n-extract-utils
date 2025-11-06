import * as t from "@babel/types";

/**
 * 根据脚本调用风格构造 callee：
 * - useThisInScript: this.<name>
 * - 否则使用标识符 <name>
 * 未来可在此扩展全局符号调用（如 i18n.global.t 或 $t）
 */
export function getTranslationCallee(
  name: string,
  useThisInScript: boolean
): t.MemberExpression | t.Identifier {
  if (useThisInScript) {
    return t.memberExpression(t.thisExpression(), t.identifier(name));
  }
  return t.identifier(name);
}
