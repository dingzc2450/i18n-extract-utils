import fs from "fs";
import path from "path";
import { glob } from "glob";
import { ExtractedString, TransformOptions, UsedExistingKey } from "./types";
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
  processedFiles: number;
  usedExistingKeys?: UsedExistingKey[];
}> {
  const files = await glob.glob(pattern);
  let extractedStrings: ExtractedString[] = [];
  let processedFiles = 0;

  // 1. 加载 existingJsonPath 并生成 value->key 映射
  let existingValueToKey: Map<string, string | number> | undefined = undefined;
  let usedExistingKeysList: UsedExistingKey[] = [];
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
      // 1. 用 ast-parser 做代码转换
      const result = transformCode(
      file,
      {
        ...options,
      },
      existingValueToKey
      );

      if (result.extractedStrings.length > 0) {
      extractedStrings = [...extractedStrings, ...result.extractedStrings];
      usedExistingKeysList = [
        ...usedExistingKeysList,
        ...result.usedExistingKeysList,
      ];
      writeFileContent(file, result.code);
      processedFiles++;
      }
    } catch (error) {
      console.error(`Error processing file ${file}: ${error}`);
      if (error instanceof Error && error.stack) {
      console.error(error.stack);
      }
    }
  }

  // 如果提供了输出路径，输出提取的字符串到JSON文件
  if (options.outputPath && extractedStrings.length > 0) {
    const outputObj: Record<string, string | number> = {};

    extractedStrings.forEach((item) => {
      // 使用提取的值作为键和值
      outputObj[item.key] = item.value;
    });

    writeFileContent(options.outputPath, JSON.stringify(outputObj, null, 2));
  }

  return {
    extractedStrings,
    processedFiles,
    usedExistingKeys: usedExistingKeysList,
  };
}
