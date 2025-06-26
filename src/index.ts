import { processFiles, processFilesEnhanced } from "./transformer";
import { TransformOptions } from "./types";

export { processFiles, processFilesEnhanced, TransformOptions };
export { extractStringsFromCode } from "./string-extractor";
export { transformCode, transformCodeEnhanced } from "./ast-parser";

// 以编程方式使用库的主函数
async function extractI18n(
  pattern: string = "src/**/*.{jsx,tsx}",
  options: TransformOptions = {}
) {
  return processFiles(pattern, options);
}

// 使用增强框架的主函数，保持原始代码格式
async function extractI18nEnhanced(
  pattern: string = "src/**/*.{jsx,tsx}",
  options: TransformOptions = {}
) {
  return processFilesEnhanced(pattern, options);
}

export { extractI18n, extractI18nEnhanced };
export default extractI18n;
