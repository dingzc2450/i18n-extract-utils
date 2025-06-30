import {
  processFiles,
  processFilesLegacy,
  processFilesWithNewCoreProcessor,
} from "./transformer";
import { TransformOptions } from "./types";

// 导出重构后的核心模块
export { CoreProcessor, createProcessorWithDefaultPlugins } from "./core";
export { ReactPlugin, VuePlugin, GenericJSPlugin } from "./plugins";

// 导出兼容性适配器
export { CoreProcessorCompat, coreProcessor } from "./core-processor-compat";

export {
  processFiles,
  processFilesLegacy,
  processFilesWithNewCoreProcessor,
  TransformOptions,
};
export { extractStringsFromCode } from "./string-extractor";
export { transformCode } from "./ast-parser";

/**
 * 统一的 i18n 提取主函数
 * 自动检测是否使用增强模式（基于配置）
 */
export async function extractI18n(
  pattern: string = "src/**/*.{jsx,tsx}",
  options: TransformOptions = {}
) {
  return processFiles(pattern, options);
}

/**
 * 使用新CoreProcessor的i18n提取函数（实验性）
 */
export async function extractI18nWithCoreProcessor(
  pattern: string = "src/**/*.{jsx,tsx}",
  options: TransformOptions = {}
) {
  return processFilesWithNewCoreProcessor(pattern, options);
}

export default extractI18n;
