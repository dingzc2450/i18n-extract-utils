/**
 * React 框架插件
 * 负责React相关的处理逻辑，包括JSX组件检测、Hook导入等
 */

import type {
  FrameworkPlugin,
  HookRequirement,
  ImportRequirement,
  ProcessingContext,
} from "../core/types";
import { Framework } from "../types";

import type { NormalizedTransformOptions } from "../core";
import type { ParserOptions } from "@babel/parser";
import type { ReactAdapter } from "../core/framework-adapters/react-adapter";
import { createReactAdapter } from "../core/framework-adapters/react-adapter";
import { ImportType } from "../core/framework-adapters/types";

/**
 * React 插件实现
 */
export class ReactPlugin implements FrameworkPlugin {
  name = "react";
  static readonly defaultTranslationMethod = "t";

  /** 缓存的适配器实例 */
  private adapterCache: WeakMap<NormalizedTransformOptions, ReactAdapter> =
    new WeakMap();

  /**
   * 获取或创建 ReactAdapter 实例
   */
  private getAdapter(options: NormalizedTransformOptions): ReactAdapter {
    let adapter = this.adapterCache.get(options);
    if (!adapter) {
      adapter = createReactAdapter(options);
      this.adapterCache.set(options, adapter);
    }
    return adapter;
  }

  /**
   * 检测是否应该应用React插件
   */
  shouldApply(
    _code: string,
    _filePath: string,
    options: NormalizedTransformOptions
  ): boolean {
    // 只根据框架类型判断是否应用
    return options.normalizedI18nConfig.framework === Framework.React;
  }

  /**
   * 获取React解析器配置
   */
  getParserConfig(): ParserOptions {
    return {
      plugins: ["jsx"],
    };
  }

  /**
   * 获取React所需的导入和Hook需求
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

    // 检查是否有非React配置，如果有，则回退到上下文感知逻辑
    if (options.normalizedI18nConfig?.nonReactConfig) {
      return { imports: [], hooks: [] }; // 让上下文感知逻辑处理
    }

    const hookName = adapter.getHookName();
    const hookSource = adapter.getHookSource();
    const translationMethod = adapter.getTranslationMethodName();

    const imports: ImportRequirement[] = [
      {
        source: hookSource,
        specifiers: [{ name: hookName }],
        isDefault: false,
      },
    ];

    const hooks: HookRequirement[] =
      importPolicy.type === ImportType.HOOK
        ? [
            {
              hookName,
              variableName:
                translationMethod === "default"
                  ? ReactPlugin.defaultTranslationMethod
                  : translationMethod,
              isDestructured: translationMethod !== "default",
              callExpression: adapter.generateHookCallExpression(),
            },
          ]
        : [];

    return { imports, hooks };
  }

  /**
   * React特定的后处理
   */
  postProcess(code: string): string {
    return code;
  }
}
