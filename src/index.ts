import { processFiles, transformCode } from "./processFiles";
import { TransformOptions } from "./types";

// 导出核心模块
export { CoreProcessor, createProcessorWithDefaultPlugins } from "./core";
export { ReactPlugin, VuePlugin, GenericJSPlugin } from "./plugins";
export { 
  normalizeConfig, 
  CONFIG_DEFAULTS,
  NormalizedTransformOptions,
  NormalizedI18nConfig
} from "./core/config-normalizer";

// 导出配置系统
export { EnhancedProcessor, ConfigExamples } from "./config";

export { TransformOptions };
export { transformCode };

/**
 * 统一的 i18n 提取主函数
 */
export async function extractI18n(
  pattern: string = "src/**/*.{jsx,tsx}",
  options: TransformOptions = {}
) {
  return processFiles(pattern, options);
}

export default extractI18n;
