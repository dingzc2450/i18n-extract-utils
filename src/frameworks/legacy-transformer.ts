/**
 * 传统框架转换器
 * 保留基于 ast-parser 的老处理方式，用于向后兼容
 */

import fs from "fs";
import type {
  ExtractedString,
  TransformOptions,
  UsedExistingKey,
  ChangeDetail,
  I18nTransformer,
} from "../types";
import {
  createFrameworkTransformer,
  detectFramework,
  mergeWithFrameworkDefaults,
  createFrameworkCodeGenerator,
} from "./framework-factory";

/**
 * 传统的通用多语言提取与替换主入口（基于老的 transformer 架构）
 * @param filePath 文件路径
 * @param options 转换配置
 * @param existingValueToKey 现有 value->key 映射
 * @param transformer 框架实现（可选，会根据 framework 配置自动选择）
 * @returns { code, extractedStrings, usedExistingKeysList, changes }
 * @deprecated 推荐使用新的 CoreProcessor 架构
 */
export function transformCodeLegacy(
  filePath: string,
  options: Omit<TransformOptions, "existingTranslations">,
  existingValueToKey?: Map<string, string | number>,
  transformer?: I18nTransformer
): {
  code: string;
  extractedStrings: ExtractedString[];
  usedExistingKeysList: UsedExistingKey[];
  changes: ChangeDetail[];
} {
  const code = fs.readFileSync(filePath, "utf8");

  // 如果用户提供了 transformer，直接使用
  if (transformer) {
    return transformer.extractAndReplace(
      code,
      filePath,
      options,
      existingValueToKey
    );
  }

  // 自动检测框架（如果配置中没有指定）
  const detectedFramework = detectFramework(code, filePath);

  // 合并用户配置和框架默认配置
  const mergedOptions = mergeWithFrameworkDefaults(options);

  // 优先使用新的框架代码生成器
  const codeGenerator = createFrameworkCodeGenerator();
  const canHandle = codeGenerator.canHandle(code, filePath);
  const isNotVue = !["vue", "vue2", "vue3"].includes(
    mergedOptions.i18nConfig?.framework || detectedFramework
  );

  if (canHandle && isNotVue) {
    return codeGenerator.processCode(
      code,
      filePath,
      mergedOptions,
      existingValueToKey
    );
  }

  // 回退到老的 transformer（保持向后兼容）
  const realTransformer = createFrameworkTransformer(mergedOptions);

  return realTransformer.extractAndReplace(
    code,
    filePath,
    mergedOptions,
    existingValueToKey
  );
}
