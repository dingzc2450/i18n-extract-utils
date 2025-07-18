/**
 * 通用 JavaScript 插件
 * 作为默认插件处理不特定于任何框架的JS/TS代码
 */

import {
  FrameworkPlugin,
  ProcessingContext,
  ImportRequirement,
  HookRequirement,
} from "../core/types";
import {
  ExtractedString,
  TransformOptions,
} from "../types";

/**
 * 通用JS插件实现
 */
export class GenericJSPlugin implements FrameworkPlugin {
  name = "generic-js";

  /**
   * 通用JS插件总是可以应用（作为后备选项）
   */
  shouldApply(
    code: string,
    filePath: string,
    options: TransformOptions
  ): boolean {
    // 检查是否为JS/TS文件
    return /\.(js|ts|mjs|cjs)$/.test(filePath);
  }

  /**
   * 获取通用JS解析器配置
   */
  getParserConfig(): object {
    return {
      plugins: [], // 只使用基础解析器插件
    };
  }

  /**
   * 获取通用JS所需的导入需求
   */
  getRequiredImportsAndHooks(
    extractedStrings: ExtractedString[],
    options: TransformOptions,
    context: ProcessingContext
  ): {
    imports: ImportRequirement[];
    hooks: HookRequirement[];
  } {
    if (extractedStrings.length === 0) {
      return { imports: [], hooks: [] };
    }

    // 对于通用JS，通常只需要导入翻译函数，不需要hooks
    const imports: ImportRequirement[] = [];
    const hooks: HookRequirement[] = [];

    // 如果配置了i18n导入，添加相应的导入
    if (options.i18nConfig?.i18nImport) {
      const { source, importName, name } = options.i18nConfig.i18nImport;
      
      if (source && importName) {
        imports.push({
          source,
          specifiers: [{ name: importName, alias: name !== importName ? name : undefined }],
          isDefault: false,
        });
      }
    }

    return { imports, hooks };
  }

  /**
   * 通用JS的后处理
   */
  postProcess(
    code: string,
    extractedStrings: ExtractedString[],
    options: TransformOptions,
    context: ProcessingContext
  ): string {
    // 通用JS通常不需要特殊的后处理
    return code;
  }
}
