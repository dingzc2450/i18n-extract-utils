/**
 * i18n-extract-utils 主要处理函数
 * 提供基于新 CoreProcessor 架构的代码转换功能
 */

import {
  ExtractedString,
  TransformOptions,
  UsedExistingKey,
  ChangeDetail,
} from "./types";
import { createProcessorWithDefaultPlugins } from "./plugins";
import { ConfigProxy } from "./config/config-proxy";
import { FileCacheUtils } from "./core/utils";

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
  const enhancedOptions = ConfigProxy.preprocessOptions(options, code, filePath);

  return processor.processCode(code, filePath, enhancedOptions, existingValueToKey);
}
