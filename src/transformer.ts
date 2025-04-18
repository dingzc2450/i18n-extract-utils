import fs from "fs";
import path from "path";
import { glob } from "glob";
// 确保导入 ChangeDetail
import { ExtractedString, TransformOptions, UsedExistingKey, FileModificationRecord, ChangeDetail } from "./types";
import { transformCode } from "./ast-parser";

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

export async function processFiles(
  pattern: string,
  options: TransformOptions
): Promise<{
  extractedStrings: ExtractedString[];
  usedExistingKeys?: UsedExistingKey[];
  modifiedFiles: FileModificationRecord[];
}> {
  const files = await glob.glob(pattern, { absolute: true });
  let allExtractedStrings: ExtractedString[] = [];
  let allUsedExistingKeys: UsedExistingKey[] = [];
  let modifiedFiles: FileModificationRecord[] = [];
  let processedFileCount = 0;

  // 1. 加载现有翻译映射 (现有逻辑保持不变)
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

  for (const file of files) {
    try {
      // 2. 使用 ast-parser 转换代码
      // 假设 transformCode 现在返回 { code, extractedStrings, usedExistingKeysList, changes }
      const result = transformCode(
        file,
        {
          ...options,
          generateKey: options.generateKey
        },
        existingValueToKey
      );

      // 3. 检查文件是否实际被修改
      // 使用 result.changes.length > 0 来判断是否有修改更可靠
      if (result.changes && result.changes.length > 0) {
        // 聚合提取的字符串和使用的键
        allExtractedStrings = [...allExtractedStrings, ...result.extractedStrings];
        allUsedExistingKeys = [...allUsedExistingKeys, ...result.usedExistingKeysList];

        // 将修改后的内容写回文件
        writeFileContent(file, result.code);

        // 记录修改，包含详细的更改列表
        modifiedFiles.push({
          filePath: file,
          newContent: result.code,
          changes: result.changes, // <-- 将从 transformCode 返回的 changes 添加到记录中
        });

        processedFileCount++; // 仅为修改过的文件增加计数
      }
      // 如果没有修改，则不对此文件执行任何操作
    } catch (error) {
      console.error(`Error processing file ${file}: ${error}`);
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
    }
  }

  // 4. 如果提供了路径，则将聚合的提取字符串写入输出 JSON (现有逻辑保持不变)
  if (options.outputPath && allExtractedStrings.length > 0) {
    const outputObj: Record<string, string | number> = {};
    // Ensure uniqueness based on key when writing output JSON
    const uniqueExtractedMap = new Map<string | number, string>();
    allExtractedStrings.forEach((item) => {
        // If multiple values map to the same key, the last one wins (or apply specific logic)
        uniqueExtractedMap.set(item.key, item.value);
    });
    uniqueExtractedMap.forEach((value, key) => {
        outputObj[typeof key === 'number' ? key.toString() : key] = value;
    });

    writeFileContent(options.outputPath, JSON.stringify(outputObj, null, 2));
  }

  // 5. 返回结果，包括修改的文件列表及其详细更改
  return {
    extractedStrings: allExtractedStrings,
    usedExistingKeys: allUsedExistingKeys,
    modifiedFiles: modifiedFiles, // 返回包含 changes 的数组
  };
}
