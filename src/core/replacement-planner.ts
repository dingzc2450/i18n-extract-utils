/**
 * Replacement Planner（占位）
 * 负责遍历 AST，收集需要替换的范围与新文本。
 * 现阶段占位返回空，后续接入真正实现。
 */
export type Replacement = { start: number; end: number; newText: string };
export interface ReplacementPlan {
  replacements: Replacement[];
}
export function createEmptyPlan(): ReplacementPlan {
  return { replacements: [] };
}
