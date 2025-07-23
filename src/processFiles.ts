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
 * 使用 CoreProcessor 处理单个文件的代码转换
 * 
 * 该函数负责国际化字符串的提取和转换，是整个处理流程的核心。
 * 文件路径参数（filePath）在此函数中具有三个关键作用：
 * 1. 用于读取文件内容
 * 2. 用于确定正确的AST解析器配置（根据文件扩展名如.tsx, .vue等）
 * 3. 用于插件系统选择合适的框架处理器（Vue、React等）
 * 
 * 重要说明：不要移除或修改filePath参数，这会破坏AST解析和插件选择功能。
 * 
 * @param filePath 文件路径，用于读取文件、确定文件类型和选择正确的处理插件
 * @param options 转换配置选项，控制国际化提取和转换的行为
 * @param existingValueToKey 现有翻译的 value->key 映射，用于重用已有的键值
 * @returns 包含转换后代码、提取的字符串、已使用的现有键和变更详情的结果对象
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
  try {
    // 第一步：读取文件内容
    // 文件内容缓存由FileCacheUtils处理，避免重复读取相同文件
    const code = FileCacheUtils.readFileWithCache(filePath);
    
    // 第二步：创建预配置的处理器
    // 处理器包含所有已注册的框架插件（React、Vue等）
    const processor = createProcessorWithDefaultPlugins();

    // 第三步：通过ConfigProxy进行框架检测和配置预处理
    // filePath参数在此处用于框架类型检测，不可移除
    const enhancedOptions = ConfigProxy.preprocessOptions(
      options,
      code,
      filePath
    );

    // 第四步：执行代码处理并返回结果
    // filePath在processCode中用于AST解析配置和插件选择，不可移除
    return processor.processCode(
      code,
      filePath,
      enhancedOptions,
      existingValueToKey
    );
  } catch (error) {
    // 错误处理：提供详细错误信息并返回一致的结果结构
    console.error(`处理文件 ${filePath} 时发生错误:`, error);
    
    // 即使出错也返回一致的结构，避免调用方需要处理不同的返回类型
    return {
      code: FileCacheUtils.readFileWithCache(filePath, { noCache: true }),
      extractedStrings: [],
      usedExistingKeysList: [],
      changes: [],
    };
  }
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
