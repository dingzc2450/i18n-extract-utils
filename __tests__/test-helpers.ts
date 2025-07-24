/**
 * 测试辅助工具
 * 为测试用例提供便利的导入和转换函数
 */
import {
  transformCode,
  processFiles as originalProcessFiles,
  executeI18nExtraction,
} from "../src/processFiles";


export { transformCode };
/**
 * 为测试用例提供的文件路径版本转换函数
 */
export const transformCodeFromFile = transformCode;

/**
 * 清理配置缓存的空函数 - 新的配置系统不需要缓存
 */
export const clearConfigCache = () => {};

/**
 * 导出processFiles函数
 */
export const processFiles = originalProcessFiles;

/**
 * 导出executeI18nExtraction函数
 */
export { executeI18nExtraction };
