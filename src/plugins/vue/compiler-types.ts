/**
 * Vue编译器类型定义
 */

import type {
  CompilerOptions,
  SFCParseOptions,
  SFCTemplateCompileOptions,
} from "@vue/compiler-sfc";

export interface VueCompiler {
  parse: (source: string, options?: CompilerOptions) => any;
  compileTemplate: (options: SFCTemplateCompileOptions) => any;
  compileScript: (source: string, options?: CompilerOptions) => any;
  parseComponent: (source: string, options?: SFCParseOptions) => any;
}

export interface CompilerLoadResult {
  default: VueCompiler;
}

export type CompilerVersion = "vue3";
