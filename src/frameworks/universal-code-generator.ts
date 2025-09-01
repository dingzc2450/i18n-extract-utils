/**
 * 统一代码生成器 - 使用核心处理器架构
 * 所有框架都使用这个统一的生成器，通过插件系统处理框架特异性
 */

import type {
  ExtractedString,
  TransformOptions,
  UsedExistingKey,
  ChangeDetail,
  FrameworkCodeGenerator,
} from "../types";
import type { CoreProcessor } from "../core";
import { createProcessorWithDefaultPlugins } from "../core";

/**
 * 统一代码生成器
 * 替代所有现有的框架特定生成器
 */
export class UniversalCodeGenerator implements FrameworkCodeGenerator {
  name = "universal";
  private processor: CoreProcessor;

  constructor() {
    this.processor = createProcessorWithDefaultPlugins();
  }

  canHandle(code: string, filePath: string): boolean {
    //TODO  处理所有JS/TS相关文件 vue 暂时文件不处理 后续做
    return /\.(js|ts|jsx|tsx|mjs|cjs)$/.test(filePath);
  }

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
    return this.processor.processCode(
      code,
      filePath,
      options,
      existingValueToKey
    );
  }
}
