import fs from "fs";
import path from "path";
import { glob } from "glob";
import {
  ExtractedString,
  TransformOptions,
  UsedExistingKey,
  FileModificationRecord,
} from "./types";
import { transformCode } from "./ast-parser";
// 导入新的CoreProcessor相关功能
import { processFilesWithCoreProcessor } from "./core-transformer";

function ensureDirectoryExistence(filePath: string): void {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

function writeFileContent(filePath: string, content: string): void {
  ensureDirectoryExistence(filePath);
  fs.writeFileSync(filePath, content, "utf8");
}

/**
 * 加载现有翻译映射的通用函数
 */
function loadExistingTranslations(options: TransformOptions): {
  existingValueToKey?: Map<string, string | number>;
  sourceJsonObject?: Record<string, string | number>;
} {
  let existingValueToKey: Map<string, string | number> | undefined = undefined;
  let sourceJsonObject: Record<string, string | number> | undefined = undefined;

  if (options.existingTranslations) {
    if (typeof options.existingTranslations === "string") {
      // It's a file path
      const filePath = options.existingTranslations;
      if (fs.existsSync(filePath)) {
        try {
          sourceJsonObject = JSON.parse(fs.readFileSync(filePath, "utf8"));
        } catch (e) {
          console.error(
            `Error parsing existing translations file: ${filePath}`,
            e
          );
        }
      } else {
        console.warn(`Existing translations file not found: ${filePath}`);
      }
    } else if (typeof options.existingTranslations === "object") {
      // It's an object
      sourceJsonObject = options.existingTranslations;
    }

    // Build the value -> key map from the loaded/provided object
    if (sourceJsonObject) {
      existingValueToKey = new Map<string, string | number>();
      Object.entries(sourceJsonObject).forEach(([key, value]) => {
        if (typeof value === "string") {
          // Prioritize non-identical keys if a value maps to multiple keys
          if (!existingValueToKey!.has(value) || key !== value) {
            existingValueToKey!.set(value, key);
          }
        } else if (typeof value === "number") {
          // Also handle number values if needed
          if (
            !existingValueToKey!.has(String(value)) ||
            key !== String(value)
          ) {
            existingValueToKey!.set(String(value), key);
          }
        }
      });
    }
  }

  return { existingValueToKey, sourceJsonObject };
}

/**
 * 生成翻译输出文件的通用函数
 */
function generateTranslationOutput(
  options: TransformOptions,
  extractedStrings: ExtractedString[],
  sourceJsonObject?: Record<string, string | number>
): void {
  if (options.outputPath && extractedStrings.length > 0) {
    const existingTranslations = sourceJsonObject || {};
    const newTranslations: Record<string, string | number> = {};

    extractedStrings.forEach((item) => {
      if (!(item.key in existingTranslations)) {
        newTranslations[item.key] = item.value;
      }
    });

    const mergedTranslations = { ...existingTranslations, ...newTranslations };

    try {
      fs.writeFileSync(
        options.outputPath,
        JSON.stringify(mergedTranslations, null, 2),
        "utf8"
      );
      console.log(`Translation file updated: ${options.outputPath}`);
    } catch (e) {
      console.error(`Error writing translation file: ${options.outputPath}`, e);
    }
  }
}

/**
 * 通用的文件处理函数
 * @param pattern 文件匹配模式
 * @param options 转换选项
 */
export async function processFiles(
  pattern: string,
  options: TransformOptions,
  useCoreProcessor?: boolean
): Promise<{
  extractedStrings: ExtractedString[];
  usedExistingKeys?: UsedExistingKey[];
  modifiedFiles: FileModificationRecord[];
}> {
  // 如果明确指定使用CoreProcessor，则使用新的处理器
  if (useCoreProcessor) {
    const result = await processFilesWithCoreProcessor(pattern, options);
    return {
      extractedStrings: result.extractedStrings,
      usedExistingKeys: result.usedExistingKeysList,
      modifiedFiles: result.fileModifications,
    };
  }

  // 以下是原有的处理逻辑
  const files = await glob.glob(pattern, { absolute: true });
  let allExtractedStrings: ExtractedString[] = [];
  let allUsedExistingKeys: UsedExistingKey[] = [];
  let modifiedFiles: FileModificationRecord[] = [];
  let processedFileCount = 0;

  // 加载现有翻译映射
  const { existingValueToKey, sourceJsonObject } =
    loadExistingTranslations(options);

  // 处理每个文件
  for (const file of files) {
    try {
      const result = transformCode(file, options, existingValueToKey);

      if (result.extractedStrings.length > 0 || result.changes.length > 0) {
        processedFileCount++;
        allExtractedStrings.push(...result.extractedStrings);
        allUsedExistingKeys.push(...result.usedExistingKeysList);

        // 写入修改后的文件内容
        writeFileContent(file, result.code);

        // 为修改的文件创建记录
        modifiedFiles.push({
          filePath: file,
          changes: result.changes,
          newContent: result.code,
        });
      }
    } catch (error) {
      console.error(`Error processing file ${file}:`, error);
    }
  }

  // 生成翻译输出文件
  generateTranslationOutput(options, allExtractedStrings, sourceJsonObject);

  console.log(
    `Processed ${files.length} files and modified ${processedFileCount} files.`
  );

  return {
    extractedStrings: allExtractedStrings,
    usedExistingKeys: allUsedExistingKeys,
    modifiedFiles: modifiedFiles,
  };
}

/**
 * @deprecated 使用 processFiles(pattern, options, false) 代替
 */
export async function processFilesLegacy(
  pattern: string,
  options: TransformOptions
): Promise<{
  extractedStrings: ExtractedString[];
  usedExistingKeys?: UsedExistingKey[];
  modifiedFiles: FileModificationRecord[];
}> {
  return processFiles(pattern, options, false);
}

/**
 * 使用新的CoreProcessor处理文件（实验性功能）
 * @param pattern 文件匹配模式
 * @param options 转换选项
 */
export async function processFilesWithNewCoreProcessor(
  pattern: string,
  options: TransformOptions = {}
): Promise<{
  extractedStrings: ExtractedString[];
  usedExistingKeys?: UsedExistingKey[];
  modifiedFiles: FileModificationRecord[];
}> {
  return processFiles(pattern, options, undefined);
}
/**
 * @deprecated 使用 processFilesWithNewCoreProcessor(pattern, options) 代替
 */
export const processFilesEnhanced = processFilesWithNewCoreProcessor;
