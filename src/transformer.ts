import fs from "fs";
import path from "path";
import { glob } from "glob";
import { ExtractedString, TransformOptions } from "./types";
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
): Promise<{ extractedStrings: ExtractedString[]; processedFiles: number }> {
  const files = await glob.glob(pattern);
  let extractedStrings: ExtractedString[] = [];
  let processedFiles = 0;

  for (const file of files) {
    try {
      const result = transformCode(file, options);

      if (result.extractedStrings.length > 0) {
        extractedStrings = [...extractedStrings, ...result.extractedStrings];
        writeFileContent(file, result.code);
        processedFiles++;
      }
    } catch (error) {
      console.error(`Error processing file ${file}: ${error}`);
    }
  }

  // 如果提供了输出路径，输出提取的字符串到JSON文件
  if (options.outputPath && extractedStrings.length > 0) {
    const outputObj: Record<string, string> = {};

    extractedStrings.forEach((item) => {
      // 使用提取的值作为键和值
      outputObj[item.value] = item.value;
    });

    writeFileContent(options.outputPath, JSON.stringify(outputObj, null, 2));
  }

  return { extractedStrings, processedFiles };
}
