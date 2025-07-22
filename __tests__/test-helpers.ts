/**
 * 测试辅助工具
 * 为测试用例提供便利的导入和转换函数
 */
import { transformCode } from "../src/processFiles";

/**
 * 为测试用例提供的文件路径版本转换函数
 * 直接使用 processor.ts 中的 transformCode 函数
 */
export const transformCodeFromFile = transformCode;

/**
 * transformCode 的别名，用于向后兼容
 */
export { transformCode } from "../src/processFiles";
// 导出其他常用的测试工具
export { clearConfigCache } from "../src/config/config-manager";
export { processFiles } from "../src/processFiles";
