/**
 * 测试辅助工具
 * 为测试用例提供便利的导入和转换函数
 */
import {
  transformCode,
  processFiles as originalProcessFiles,
  executeI18nExtraction as originalExecuteI18nExtraction,
} from "../src/processFiles";

export { transformCode };
/**
 * 为测试用例提供的文件路径版本转换函数
 * 固定使用正则表达式模式处理Vue模板，以避免测试依赖Vue编译器
 */
export const transformCodeFromFile = (
  filePath: string,
  options: Parameters<typeof transformCode>[1] = {},
  existingValueToKeyMap?: Parameters<typeof transformCode>[2]
) => {
  return transformCode(
    filePath,
    {
      ...options,
      vueTemplateMode: "regex", // 强制使用正则表达式模式
    },
    existingValueToKeyMap
  );
};

/**
 * 清理配置缓存的空函数 - 新的配置系统不需要缓存
 */
export const clearConfigCache = () => {};

/**
 * 导出processFiles函数的包装版本
 * 固定使用正则表达式模式处理Vue模板
 */
export const processFiles = (
  pattern: Parameters<typeof originalProcessFiles>[0],
  options: Parameters<typeof originalProcessFiles>[1] = {}
) => {
  return originalProcessFiles(pattern, {
    ...options,
    vueTemplateMode: "regex", // 强制使用正则表达式模式
  });
};

/**
 * 导出executeI18nExtraction函数的包装版本
 * 固定使用正则表达式模式处理Vue模板
 */
export const executeI18nExtraction = (
  pattern: Parameters<typeof originalExecuteI18nExtraction>[0],
  options: Parameters<typeof originalExecuteI18nExtraction>[1] = {}
) => {
  return originalExecuteI18nExtraction(pattern, {
    ...options,
    vueTemplateMode: "regex", // 强制使用正则表达式模式
  });
};
