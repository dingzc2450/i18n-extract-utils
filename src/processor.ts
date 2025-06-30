/**
 * i18n-extract-utils 主要处理函数
 * 提供基于新 CoreProcessor 架构的代码转换功能
 */

import fs from "fs";
import {
  ExtractedString,
  TransformOptions,
  UsedExistingKey,
  ChangeDetail,
} from "./types";
import { createProcessorWithDefaultPlugins } from "./plugins";

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
  const code = fs.readFileSync(filePath, "utf8");
  const processor = createProcessorWithDefaultPlugins();

  return processor.processCode(code, filePath, options, existingValueToKey);
}

/**
 * 使用新的 CoreProcessor 处理代码字符串
 * @param code 源代码字符串
 * @param filePath 文件路径（用于框架检测和错误报告）
 * @param options 转换配置
 * @param existingValueToKey 现有 value->key 映射
 * @returns 转换结果
 */
export function transformCodeString(
  code: string,
  filePath: string,
  options: TransformOptions = {},
  existingValueToKey?: Map<string, string | number>
): {
  code: string;
  extractedStrings: ExtractedString[];
  usedExistingKeysList: UsedExistingKey[];
  changes: ChangeDetail[];
} {
  const processor = createProcessorWithDefaultPlugins();

  return processor.processCode(code, filePath, options, existingValueToKey);
}
