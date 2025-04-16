import { processFiles } from "./transformer";
import { TransformOptions } from "./types";

export { processFiles, TransformOptions };
export { extractStringsFromCode } from "./string-extractor";
export { transformCode } from "./ast-parser";

// 以编程方式使用库的主函数
export default async function extractI18n(
  pattern: string = "src/**/*.{jsx,tsx}",
  options: TransformOptions = {}
) {
  return processFiles(pattern, options);
}
