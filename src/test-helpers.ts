/**
 * 测试辅助模块
 * 为测试提供核心处理器的 transformCodeWithCoreProcessor 函数
 */

export { transformCodeWithCoreProcessor } from "./core-transformer";

// 为了兼容性，也导出新的主要 API
export { transformCode, transformCodeString } from "./processor";
