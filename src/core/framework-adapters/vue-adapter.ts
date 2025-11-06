import type { FrameworkAdapter } from "../core-ast-transformer";

/**
 * Vue 纯 JS/TS 文件适配器（占位版本）
 * 后续将实现：调用构造、导入/Hook 注入策略等
 */
export class VueAdapter implements FrameworkAdapter {
  readonly name = "vue";
}
