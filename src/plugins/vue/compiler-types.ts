/**
 * Vue编译器类型定义
 */

import type { CompilerOptions, SFCParseResult } from "@vue/compiler-sfc";

/**
 * Vue编译器接口
 */
export interface VueCompiler {
  /**
   * 解析Vue单文件组件或模板
   * @param source - Vue源码或模板
   * @param options - 编译器选项
   * @returns 解析结果，包含descriptor和errors
   */
  parse: (source: string, options?: CompilerOptions) => SFCParseResult;
}

export interface CompilerLoadResult {
  default: VueCompiler;
}

export type CompilerVersion = "vue3";
