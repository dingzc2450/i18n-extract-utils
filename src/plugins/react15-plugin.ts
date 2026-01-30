/**
 * React 15 框架插件
 * 负责React15相关的处理逻辑，不使用hooks，直接导入翻译函数
 */

import type {
  FrameworkPlugin,
  ImportRequirement,
  HookRequirement,
} from "../core/types";
import type { NormalizedTransformOptions } from "../core/config-normalizer";
import type { ParserOptions } from "@babel/parser";
import { Framework } from "../types";
import type { React15Adapter } from "../core/framework-adapters/react-adapter";
import { createReact15Adapter } from "../core/framework-adapters/react-adapter";
import { ImportType } from "../core/framework-adapters/types";

/**
 * React 15 插件实现
 * 特点：不使用hooks，直接导入翻译函数
 */
export class React15Plugin implements FrameworkPlugin {
  name = "react15";

  /** 缓存的适配器实例 */
  private adapterCache: WeakMap<NormalizedTransformOptions, React15Adapter> =
    new WeakMap();

  /**
   * 获取或创建 React15Adapter 实例
   */
  private getAdapter(options: NormalizedTransformOptions): React15Adapter {
    let adapter = this.adapterCache.get(options);
    if (!adapter) {
      adapter = createReact15Adapter(options);
      this.adapterCache.set(options, adapter);
    }
    return adapter;
  }

  /**
   * 检测是否应该应用React15插件
   */
  shouldApply(
    _code: string,
    _filePath: string,
    options: NormalizedTransformOptions
  ): boolean {
    // 只根据框架类型判断是否应用
    return options.normalizedI18nConfig.framework === Framework.React15;
  }

  /**
   * 获取React15解析器配置
   */
  getParserConfig(): ParserOptions {
    return {
      plugins: ["jsx"],
    };
  }

  /**
   * 获取React15所需的导入和Hook需求
   * React15不需要hooks，只需要直接导入翻译函数
   */
  getRequiredImportsAndHooks(options: NormalizedTransformOptions): {
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

    // 使用适配器获取导入源和函数名
    const importSource = adapter.getImportSource();
    const functionName = adapter.getTranslationMethodName();

    const imports: ImportRequirement[] = [
      {
        source: importSource,
        specifiers: [{ name: functionName }],
        isDefault: false,
      },
    ];

    // React15不需要hooks
    const hooks: HookRequirement[] = [];

    return { imports, hooks };
  }

  /**
   * React15特定的后处理
   */
  postProcess(code: string): string {
    return code;
  }
}
