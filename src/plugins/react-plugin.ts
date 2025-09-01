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
import type { TransformOptions } from "../types";

import type { NormalizedTransformOptions } from "../core";
import type { ParserOptions } from "@babel/parser";

/**
 * React 插件实现
 */
export class ReactPlugin implements FrameworkPlugin {
  name = "react";
  static readonly defaultTranslationMethod = "t";
  /**
   * 检测是否应该应用React插件
   */
  shouldApply(
    _code: string,
    _filePath: string,
    options: NormalizedTransformOptions
  ): boolean {
    // 只根据框架类型判断是否应用
    return options.normalizedI18nConfig.framework === "react";
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
    options: TransformOptions,
    _context: ProcessingContext
  ): {
    imports: ImportRequirement[];
    hooks: HookRequirement[];
  } {
    // 检查是否有非React配置，如果有，则回退到上下文感知逻辑
    if (options.i18nConfig?.nonReactConfig) {
      return { imports: [], hooks: [] }; // 让上下文感知逻辑处理
    }

    const hookName = this.getHookName(options);
    const hookSource = this.getHookSource(options);
    const translationMethod = this.getTranslationMethod(options);

    const imports: ImportRequirement[] = [
      {
        source: hookSource,
        specifiers: [{ name: hookName }],
        isDefault: false,
      },
    ];

    const hooks: HookRequirement[] = [
      {
        hookName,
        variableName:
          translationMethod === "default"
            ? ReactPlugin.defaultTranslationMethod
            : translationMethod,
        isDestructured: translationMethod !== "default",
        callExpression: this.generateHookCallExpression(
          hookName,
          translationMethod
        ),
      },
    ];

    return { imports, hooks };
  }

  /**
   * React特定的后处理
   */
  postProcess(code: string): string {
    return code;
  }

  /**
   * 获取Hook名称
   */
  private getHookName(options: TransformOptions): string {
    return (
      options.i18nConfig?.i18nImport?.importName ||
      options.hookName ||
      "useTranslation"
    );
  }

  /**
   * 获取Hook来源
   */
  private getHookSource(options: TransformOptions): string {
    return (
      options.i18nConfig?.i18nImport?.source ||
      options.hookImport ||
      "react-i18next"
    );
  }

  /**
   * 获取翻译方法名称
   */
  private getTranslationMethod(options: TransformOptions): string {
    return (
      options.i18nConfig?.i18nImport?.name || options.translationMethod || "t"
    );
  }

  /**
   * 生成Hook调用表达式
   */
  private generateHookCallExpression(
    hookName: string,
    translationMethod: string
  ): string {
    if (translationMethod === "default") {
      return `const ${ReactPlugin.defaultTranslationMethod} = ${hookName}();`;
    } else {
      return `const { ${translationMethod} } = ${hookName}();`;
    }
  }
}
