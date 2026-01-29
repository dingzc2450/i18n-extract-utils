/**
 * 新版本的Transformer适配器
 * 使用重构后的CoreProcessor进行处理
 */
import { getVueCompilerManager } from "./plugins/vue/compiler-manager";

import fs from "fs";
import path from "path";
import fg from "fast-glob";
import type {
  ExistingValueToKeyMapType,
  ExistingValueValueType,
} from "./types";
import {
  type ExtractedString,
  type TransformOptions,
  type UsedExistingKey,
  type FileModificationRecord,
  type ChangeDetail,
  Framework,
} from "./types";
import { FileCacheUtils } from "./core/utils";
import { runUnifiedTransform } from "./core/unified-entry";
import { normalizeConfig } from "./core/config-normalizer";
import { ConfigDetector } from "./config/config-detector";
import {
  createI18nError,
  logError,
  enhanceError as baseEnhanceError,
  type I18nError,
} from "./core/error-handler";
import { fallbackTransform } from "./fallback-transform";

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
  existingValueToKeyMap?: ExistingValueToKeyMapType;
  sourceJsonObject?: Record<string, string | number>;
} {
  let existingValueToKeyMap: ExistingValueToKeyMapType | undefined = undefined;
  let sourceJsonObject: Record<string, string | number> | undefined = undefined;

  // 获取配置项，如果存在旧的existingTranslations，则转换为新的existingTranslationsConfig格式
  const configs = options.existingTranslationsConfig
    ? Array.isArray(options.existingTranslationsConfig)
      ? options.existingTranslationsConfig
      : [options.existingTranslationsConfig]
    : options.existingTranslations
      ? [{ source: options.existingTranslations }]
      : [];

  // 如果有配置项，则处理每个配置项
  if (configs.length > 0) {
    existingValueToKeyMap = new Map();

    // 处理每个配置项
    for (const config of configs) {
      let jsonObject: Record<string, string | number> | undefined = undefined;

      if (typeof config.source === "string") {
        // It's a file path
        const filePath = config.source;
        if (fs.existsSync(filePath)) {
          try {
            jsonObject = JSON.parse(fs.readFileSync(filePath, "utf8"));
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
        jsonObject = config.source;
      }

      // 合并到源对象中
      if (jsonObject) {
        if (!sourceJsonObject) {
          sourceJsonObject = {};
        }
        Object.assign(sourceJsonObject, jsonObject);
      }

      // 处理映射方式
      if (jsonObject) {
        Object.entries(jsonObject).forEach(([key, value]) => {
          const valueStr = String(value);
          if (existingValueToKeyMap!.has(valueStr)) {
            // 如果值已存在，添加键到集合中
            const entry = existingValueToKeyMap!.get(valueStr)!;
            entry.keys.add(key);
            if (config.namespace) {
              entry.experimental_sourceNamespaces!.push(config.namespace);
            }
            entry.keyDetailList.push({ key, namespace: config.namespace });
          } else {
            // 如果值不存在，创建新条目
            existingValueToKeyMap!.set(valueStr, {
              primaryKey: key,
              experimental_sourceNamespaces: config.namespace
                ? [config.namespace]
                : [],
              keyDetailList: [
                {
                  key,
                  namespace: config.namespace,
                },
              ],
              keys: new Set([key]),
            });
          }
        });
      }
    }
  }

  return { existingValueToKeyMap, sourceJsonObject };
}

function normalizeMap(
  existingValueToKeyMap?: Map<string, ExistingValueValueType | string | number>
) {
  if (!existingValueToKeyMap) {
    return existingValueToKeyMap;
  }
  const normalizedMap = new Map<string, ExistingValueValueType>();
  for (const [value, entry] of existingValueToKeyMap.entries()) {
    if (typeof entry === "string" || typeof entry === "number") {
      normalizedMap.set(value, {
        primaryKey: entry,
        keyDetailList: [{ key: entry }],
        keys: new Set([entry]),
      });
    } else {
      normalizedMap.set(value, entry);
    }
  }
  return normalizedMap;
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
 * @param existingValueToKeyMap 现有翻译的 value->key 映射，用于重用已有的键值，支持一个值对应多个键
 * @returns 包含转换后代码、提取的字符串、已使用的现有键和变更详情的结果对象
 */
export function transformCode(
  filePath: string,
  options: TransformOptions = {},
  existingValueToKeyMap?: Map<string, ExistingValueValueType | string | number>
): {
  code: string;
  extractedStrings: ExtractedString[];
  usedExistingKeysList: UsedExistingKey[];
  changes: ChangeDetail[];
  error?: I18nError; // 可选的错误信息
} {
  // 第一步：读取文件内容
  // 文件内容缓存由FileCacheUtils处理，避免重复读取相同文件
  const code = FileCacheUtils.readFileWithCache(filePath);

  try {
    // 第三步：执行代码处理并返回结果
    // filePath在processCode中用于AST解析配置和插件选择，不可移除
    return runUnifiedTransform(
      code,
      filePath,
      options,
      normalizeMap(existingValueToKeyMap)
    );
  } catch (error) {
    // 使用统一的错误处理机制
    let errorCode = "GENERAL001";
    let params: string[] = [];

    // 根据错误类型确定错误代码
    if (error instanceof Error) {
      const errorMessage = error.message;
      if (
        errorMessage.includes("BABEL_PARSER_SYNTAX_ERROR") ||
        errorMessage.includes("Unexpected token")
      ) {
        errorCode = "PARSING001";
        params = [errorMessage];
      } else if (errorMessage.includes("No plugin found")) {
        errorCode = "PLUGIN002";
        params = [filePath];
      } else if (errorMessage.includes("Cannot read")) {
        errorCode = "FILE001";
        params = [filePath];
      } else if (
        errorMessage.includes("Invalid position") ||
        errorMessage.includes("Context match not found")
      ) {
        errorCode = "TRANSFORM002";
        params = [errorMessage];
      } else {
        params = [errorMessage];
      }
    } else {
      params = [String(error)];
    }

    // 创建并记录错误
    const i18nError = createI18nError(errorCode, params, {
      filePath,
      originalError: error instanceof Error ? error : undefined,
    });

    logError(i18nError);
    const { framework } = normalizeConfig(
      options,
      code,
      filePath
    ).normalizedI18nConfig;
    const extractedStrings: ExtractedString[] = [];

    // 即使出错也返回一致的结构，避免调用方需要处理不同的返回类型
    return {
      code:
        !options.disabledFallback &&
        [Framework.React, Framework.React15].includes(framework)
          ? fallbackTransform(code, extractedStrings, options)
          : FileCacheUtils.readFileWithCache(filePath, { noCache: true }),
      extractedStrings,
      usedExistingKeysList: [],
      changes: [],
      error: i18nError, // 添加错误信息到返回值
    };
  }
}

/**
 * 使用新的CoreProcessor处理文件
 */
export async function processFiles(
  pattern: string | string[],
  options: TransformOptions = {}
): Promise<{
  extractedStrings: ExtractedString[];
  usedExistingKeys: UsedExistingKey[];
  modifiedFiles: FileModificationRecord[];
  sourceJsonObject?: Record<string, string | number>;
  errors?: I18nError[]; // 添加错误列表字段
}> {
  // 第一步：使用 ConfigDetector 检查配置
  const configCheck = ConfigDetector.validateConfig(options);
  if (!configCheck.valid) {
    console.warn("⚠️ 配置验证失败:");
    configCheck.errors.forEach(error => console.error(`  ✗ ${error}`));
  }

  if (configCheck.warnings.length > 0) {
    console.warn("📦 配置警告:");
    configCheck.warnings.forEach(warning => console.warn(`  ⚠️ ${warning}`));
  }

  // 第二步：检查是否需要Vue编译器
  const { normalizedI18nConfig } = normalizeConfig(options, "", "");
  const framework = normalizedI18nConfig.framework;
  const isVueProject = [Framework.Vue, Framework.Vue2, Framework.Vue3].includes(
    framework
  );

  let vueManager: ReturnType<typeof getVueCompilerManager> | undefined;
  if (isVueProject) {
    // 设置Vue编译器
    vueManager = getVueCompilerManager();

    // 如果指定了自定义编译器路径，设置它们
    if (options.vueCompilerPaths) {
      vueManager.setCustomPaths(options.vueCompilerPaths);
    }

    const batchId = `batch-${Date.now()}`;
    vueManager.startBatch(batchId, "vue3");

    // 预加载Vue编译器
    try {
      await vueManager.getCompiler("vue3");
    } catch (error) {
      const compilerError = createI18nError(
        "VUE001",
        ["Failed to preload Vue compiler"],
        {
          originalError: error instanceof Error ? error : undefined,
        }
      );
      logError(compilerError);
      // 不抛出错误，让后续处理决定是否使用正则表达式回退
    }
  }

  try {
    // 第三步：加载现有翻译和处理文件
    const { existingValueToKeyMap, sourceJsonObject } =
      loadExistingTranslations(options);
    // 额外处理windows路径分隔符问题
    const normalizedPattern = Array.isArray(pattern)
      ? pattern.map(i => i.replace(/\\/g, "/"))
      : pattern.replace(/\\/g, "/");

    const filePaths = await fg(normalizedPattern, { onlyFiles: true });
    console.log(`Found ${filePaths.length} files to process.`);

    const allExtractedStrings: ExtractedString[] = [];
    const allUsedExistingKeys: UsedExistingKey[] = [];
    const fileModifications: FileModificationRecord[] = [];
    const errors: I18nError[] = []; // 收集处理过程中的所有错误

    for (const filePath of filePaths) {
      try {
        // Check if file exists before reading to avoid race conditions
        if (!fs.existsSync(filePath)) {
          const fileError = createI18nError("FILE001", [filePath], {
            filePath,
          });
          logError(fileError);
          errors.push(fileError);
          continue;
        }

        const originalContent = FileCacheUtils.readFileWithCache(filePath, {
          noCache: true,
        });

        const result = transformCode(filePath, options, existingValueToKeyMap);

        // 如果处理过程中出现错误，添加到错误列表
        if (result.error) {
          errors.push(result.error);
          // 仍然继续处理，因为transformCode即使出错也会返回有效的结构
        }

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
        // 使用增强的错误处理
        const enhancedError = baseEnhanceError(
          error instanceof Error ? error : new Error(String(error)),
          filePath
        );
        logError(enhancedError);
        errors.push(enhancedError);
      }
    }

    // 输出提取的字符串到JSON文件
    if (options.outputPath && allExtractedStrings.length > 0) {
      const translationJson = allExtractedStrings.reduce(
        (acc, item) => {
          acc[item.key] = item.value;
          return acc;
        },
        {} as Record<string, string>
      );

      writeFileContent(
        options.outputPath,
        JSON.stringify(translationJson, null, 2)
      );
      console.log(`Extracted translations saved to: ${options.outputPath}`);
    }

    // 返回结果
    return {
      extractedStrings: allExtractedStrings,
      usedExistingKeys: allUsedExistingKeys,
      modifiedFiles: fileModifications,
      sourceJsonObject,
      errors, // 返回处理过程中收集的所有错误
    };
  } finally {
    // 结束Vue编译器批次
    if (isVueProject && vueManager) {
      vueManager.endBatch();
    }
  }
}
