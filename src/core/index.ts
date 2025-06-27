/**
 * 核心模块索引文件
 * 导出核心处理器和相关类型
 */

export { CoreProcessor } from "./processor";
export { CoreExtractor } from "./extractor";
export { ASTParserUtils, ImportHookUtils, StringUtils } from "./utils";
export * from "./types";

// 导出兼容性接口
export { createProcessorWithDefaultPlugins } from "../plugins";
