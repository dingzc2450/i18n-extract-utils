/**
 * 通用 JavaScript 插件
 * 作为默认插件处理不特定于任何框架的JS/TS代码
 */

import type {
  FrameworkPlugin,
  ProcessingContext,
  ImportRequirement,
  HookRequirement,
} from "../core/types";
import type { NormalizedTransformOptions } from "../core/config-normalizer";
import type { GenericJSAdapter } from "../core/framework-adapters/react-adapter";
import { createGenericJSAdapter } from "../core/framework-adapters/react-adapter";
import { ImportType } from "../core/framework-adapters/types";

/**
 * 通用JS插件实现
 */
export class GenericJSPlugin implements FrameworkPlugin {
  name = "generic-js";

  /** 缓存的适配器实例 */
  private adapterCache: WeakMap<NormalizedTransformOptions, GenericJSAdapter> =
    new WeakMap();

  /**
   * 获取或创建 GenericJSAdapter 实例
   */
  private getAdapter(options: NormalizedTransformOptions): GenericJSAdapter {
    let adapter = this.adapterCache.get(options);
    if (!adapter) {
      adapter = createGenericJSAdapter(options);
      this.adapterCache.set(options, adapter);
    }
    return adapter;
  }

  /**
   * 通用JS插件总是可以应用（作为后备选项）
   */
  shouldApply(
    _code: string,
    filePath: string,
    options: NormalizedTransformOptions
  ): boolean {
    // 只有在没有指定特定框架时才应用通用JS插件
    if (options.normalizedI18nConfig.framework) {
      return false;
    }
    return true;
  }

  /**
   * 获取通用JS解析器配置
   */
  getParserConfig() {
    return {
      plugins: [], // 只使用基础解析器插件
    };
  }

  /**
   * 获取通用JS所需的导入需求
   */
  getRequiredImportsAndHooks(
    options: NormalizedTransformOptions,
    _context: ProcessingContext
  ): {
    imports: ImportRequirement[];
    hooks: HookRequirement[];
  } {
    // 使用适配器获取导入策略
    const adapter = this.getAdapter(options);
    const importPolicy = adapter.getImportPolicy();

    // 如果策略表明不需要导入，直接返回空
    if (importPolicy.type === ImportType.NONE) {
      return { imports: [], hooks: [] };
    }

    // 对于通用JS，通常只需要导入翻译函数，不需要hooks
    const imports: ImportRequirement[] = [];
    const hooks: HookRequirement[] = [];

    const source = adapter.getImportSourceName();
    const importName = adapter.getImportName();
    const name = adapter.getTranslationMethodName();

    if (source && importName) {
      imports.push({
        source,
        specifiers: [
          { name: importName, alias: name !== importName ? name : undefined },
        ],
        isDefault: false,
      });
    }
    return { imports, hooks };
  }

  /**
   * 通用JS的后处理
   */
  postProcess(code: string): string {
    // 通用JS通常不需要特殊的后处理
    return code;
  }
}
