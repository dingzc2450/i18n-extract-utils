/**
 * Vue 导入策略（占位版本）
 * 目前暂时对齐 React 的导入合并思路，后续做 Vue 专属增强。
 * TODO(dz): 结合 SFC/普通脚本差异、对齐社区导入分组/排序习惯。
 */
export interface ImportEdit {
  type: "insert" | "replace";
  start: number;
  end: number;
  text: string;
}

export interface HookEdit {
  /** 插入位置 */
  pos: number;
  /** 文本 */
  text: string;
}

export class VueImportPolicy {
  /** 占位：返回空计划，后续由适配器完善 */
  planImports(_code: string): ImportEdit[] {
    return [];
  }
  planHooks(_code: string): HookEdit[] {
    return [];
  }
}
