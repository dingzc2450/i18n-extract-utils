import { processFiles, processFilesLegacy, processFilesEnhanced } from "./transformer";
import { TransformOptions } from "./types";

export { processFiles, processFilesLegacy, processFilesEnhanced, TransformOptions };
export { extractStringsFromCode } from "./string-extractor";
export { transformCode, transformCodeEnhanced } from "./ast-parser";

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
 * @deprecated 使用 extractI18n 代替，该函数会自动检测模式
 */
export async function extractI18nEnhanced(
  pattern: string = "src/**/*.{jsx,tsx}",
  options: TransformOptions = {}
) {
  return processFiles(pattern, options, true);
}

export default extractI18n;
