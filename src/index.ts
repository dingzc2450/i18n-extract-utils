import { processFiles } from "./transformer";
import { TransformOptions } from "./types";

// 导出核心模块
export { CoreProcessor, createProcessorWithDefaultPlugins } from "./core";
export { ReactPlugin, VuePlugin, GenericJSPlugin } from "./plugins";
export { transformCodeWithCoreProcessor } from "./core-transformer";

export { TransformOptions };
export { extractStringsFromCode } from "./string-extractor";
export { transformCode, transformCodeString } from "./processor";

/**
 * 统一的 i18n 提取主函数
 */
export async function extractI18n(
  pattern: string = "src/**/*.{jsx,tsx}",
  options: TransformOptions = {}
) {
  return processFiles(pattern, options);
}

export default extractI18n;
