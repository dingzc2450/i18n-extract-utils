import {
  ExtractedString,
  TransformOptions,
  UsedExistingKey,
  FileModificationRecord,
} from "./types";
import { processFilesWithCoreProcessor } from "./core-transformer";

/**
 * 文件处理函数 - 统一使用核心处理器
 * @param pattern 文件匹配模式
 * @param options 转换选项
 */
export async function processFiles(
  pattern: string,
  options: TransformOptions
): Promise<{
  extractedStrings: ExtractedString[];
  usedExistingKeys?: UsedExistingKey[];
  modifiedFiles: FileModificationRecord[];
}> {
  const result = await processFilesWithCoreProcessor(pattern, options);
  return {
    extractedStrings: result.extractedStrings,
    usedExistingKeys: result.usedExistingKeysList,
    modifiedFiles: result.fileModifications,
  };
}