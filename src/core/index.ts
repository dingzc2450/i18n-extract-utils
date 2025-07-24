/**
 * 核心模块索引文件
 * 导出核心处理器和相关类型
 */

export { CoreProcessor } from "./processor";
export { ASTParserUtils, ImportHookUtils, StringUtils } from "./utils";
export * from "./types";

// 导出配置规范化系统
export { 
  normalizeConfig, 
  CONFIG_DEFAULTS, 
  NormalizedTransformOptions,
  NormalizedI18nConfig,
  getTranslationMethodName,
  getHookName,
  getImportSource
} from "./config-normalizer";

// 导出错误处理系统
export {
  createI18nError,
  enhanceError,
  formatError,
  formatErrorForUser,
  logError,
  withErrorHandling,
  ErrorCategory,
  ErrorSeverity,
  I18nError
} from "./error-handler";

// 导出处理器工厂函数
export { createProcessorWithDefaultPlugins } from "../plugins";
