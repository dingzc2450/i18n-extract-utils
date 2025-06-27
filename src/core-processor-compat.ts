/**
 * 兼容性适配器 - 保持向后兼容
 * 原有的core-processor.ts文件功能现在通过新的核心系统提供
 */

// 重新导出核心功能以保持兼容性
export {
  CoreProcessor,
  ProcessingContext,
  ImportRequirement,
  HookRequirement,
  ProcessingMode,
  ProcessingResult,
  ExtractionResult,
  FrameworkPlugin,
} from "./core";

export { ReactPlugin, VuePlugin, GenericJSPlugin } from "./plugins";

// 创建一个与原CoreProcessor类兼容的版本
import { createProcessorWithDefaultPlugins } from "./plugins";
import { CoreProcessor as NewCoreProcessor } from "./core/processor";
import { TransformOptions, ExtractedString, UsedExistingKey, ChangeDetail } from "./types";

/**
 * 兼容性类 - 提供与原CoreProcessor相同的接口
 * @deprecated 建议直接使用新的CoreProcessor
 */
export class CoreProcessorCompat {
  private processor: NewCoreProcessor;

  constructor() {
    this.processor = createProcessorWithDefaultPlugins();
  }

  /**
   * 处理代码 - 兼容原有接口
   */
  processCode(
    code: string,
    filePath: string,
    options: TransformOptions,
    existingValueToKey?: Map<string, string | number>
  ): {
    code: string;
    extractedStrings: ExtractedString[];
    usedExistingKeysList: UsedExistingKey[];
    changes: ChangeDetail[];
  } {
    return this.processor.processCode(code, filePath, options, existingValueToKey);
  }

  /**
   * 注册插件
   */
  registerPlugin(plugin: any): void {
    this.processor.registerPlugin(plugin);
  }
}

// 为了完全向后兼容，导出一个默认实例
export const coreProcessor = new CoreProcessorCompat();
