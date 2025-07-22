/**
 * 新版本的Transformer适配器
 * 使用重构后的CoreProcessor进行处理
 */

import fs from "fs";
import path from "path";
import { glob } from "glob";
import {
  ExtractedString,
  TransformOptions,
  UsedExistingKey,
  FileModificationRecord,
  ChangeDetail,
} from "./types";
import { FileCacheUtils } from "./core/utils";
import { createProcessorWithDefaultPlugins } from "./plugins";
import { ConfigProxy } from "./config/config-proxy";

/**
 * 确保目录存在
 */
function ensureDirectoryExistence(filePath: string): void {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

/**
 * 写入文件内容
 */
function writeFileContent(filePath: string, content: string): void {
  ensureDirectoryExistence(filePath);
  fs.writeFileSync(filePath, content, "utf8");
}

/**
 * 加载现有翻译映射
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
    } else {
      // It's a direct object
      sourceJsonObject = options.existingTranslations;
    }

    if (sourceJsonObject) {
      existingValueToKey = new Map(
        Object.entries(sourceJsonObject).map(([key, value]) => [
          String(value),
          key,
        ])
      );
    }
  }

  return { existingValueToKey, sourceJsonObject };
}

/**
 * 使用新的 CoreProcessor 处理单个文件的代码转换
 * @param filePath 文件路径
 * @param options 转换配置
 * @param existingValueToKey 现有 value->key 映射
 * @returns 转换结果
 */
export function transformCode(
  filePath: string,
  options: TransformOptions = {},
  existingValueToKey?: Map<string, string | number>
): {
  code: string;
  extractedStrings: ExtractedString[];
  usedExistingKeysList: UsedExistingKey[];
  changes: ChangeDetail[];
} {
  const code = FileCacheUtils.readFileWithCache(filePath);
  const processor = createProcessorWithDefaultPlugins();

  // 使用 ConfigProxy 进行框架检测和配置预处理
  const enhancedOptions = ConfigProxy.preprocessOptions(
    options,
    code,
    filePath
  );

  return processor.processCode(
    code,
    filePath,
    enhancedOptions,
    existingValueToKey
  );
}

/**
 * 使用新的CoreProcessor处理文件
 */
export async function processFiles(
  pattern: string,
  options: TransformOptions = {}
): Promise<{
  extractedStrings: ExtractedString[];
  usedExistingKeys: UsedExistingKey[];
  modifiedFiles: FileModificationRecord[];
  sourceJsonObject?: Record<string, string | number>;
}> {
  const { existingValueToKey, sourceJsonObject } =
    loadExistingTranslations(options);

  const filePaths = await glob(pattern);
  console.log(`Found ${filePaths.length} files to process.`);

  const allExtractedStrings: ExtractedString[] = [];
  const allUsedExistingKeys: UsedExistingKey[] = [];
  const fileModifications: FileModificationRecord[] = [];

  for (const filePath of filePaths) {
    try {
      // Check if file exists before reading to avoid race conditions
      if (!fs.existsSync(filePath)) {
        console.warn(`File not found, skipping: ${filePath}`);
        continue;
      }

      const originalContent = FileCacheUtils.readFileWithCache(filePath, {
        noCache: true,
      });

      const result = transformCode(filePath, options, existingValueToKey);

      allExtractedStrings.push(...result.extractedStrings);
      allUsedExistingKeys.push(...result.usedExistingKeysList);

      if (result.code !== originalContent) {
        fileModifications.push({
          filePath,
          newContent: result.code,
          changes: result.changes,
        });

        // 写入修改后的文件
        writeFileContent(filePath, result.code);
      }
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }

  // 输出提取的字符串到JSON文件
  if (options.outputPath && allExtractedStrings.length > 0) {
    const translationJson = allExtractedStrings.reduce((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {} as Record<string, string>);

    writeFileContent(
      options.outputPath,
      JSON.stringify(translationJson, null, 2)
    );
    console.log(`Extracted translations saved to: ${options.outputPath}`);
  }

  return {
    extractedStrings: allExtractedStrings,
    usedExistingKeys: allUsedExistingKeys,
    modifiedFiles: fileModifications,
    sourceJsonObject,
  };
}
