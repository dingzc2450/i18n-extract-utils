/**
 * Text Patcher（占位）
 * 以最小化方式应用文本替换。此版本用原生字符串切片实现，避免引入依赖。
 */
import type { Replacement } from "./replacement-planner";

export function applyReplacements(
  code: string,
  replacements: Replacement[]
): string {
  if (!replacements.length) return code;
  // 保障从后向前应用，避免位置偏移
  const ordered = [...replacements].sort((a, b) => b.start - a.start);
  let out = code;
  for (const r of ordered) {
    out = out.slice(0, r.start) + r.newText + out.slice(r.end);
  }
  return out;
}
