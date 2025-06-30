/**
 * 测试辅助工具
 * 为测试用例提供便利的导入和转换函数
 */

import { transformCode as processorTransformCode, transformCodeString } from "../src/processor";
import { 
  ExtractedString,
  TransformOptions,
  UsedExistingKey,
  ChangeDetail,
} from "../src/types";

/**
 * 为测试用例提供的文件路径版本转换函数
 * 直接使用 processor.ts 中的 transformCode 函数
 */
export function transformCodeFromFile(
  filePath: string,
  options: TransformOptions = {},
  existingValueToKey?: Map<string, string | number>
): {
  code: string;
  extractedStrings: ExtractedString[];
  usedExistingKeysList: UsedExistingKey[];
  changes: ChangeDetail[];
} {
  return processorTransformCode(filePath, options, existingValueToKey);
}

/**
 * transformCode 的别名，用于向后兼容
 */
export const transformCode = processorTransformCode;

// 导出其他常用的测试工具
export { transformCodeWithCoreProcessor } from "../src/core-transformer";
export { extractStringsFromCode } from "../src/string-extractor";
