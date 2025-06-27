/**
 * React 框架插件
 * 负责React相关的处理逻辑，包括JSX组件检测、Hook导入等
 */

import * as tg from "../babel-type-guards";
import { isJSXElement, isJSXFragment } from "../frameworks/react-support";
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
 * React 插件实现
 */
export class ReactPlugin implements FrameworkPlugin {
  name = "react";

  /**
   * 检测是否应该应用React插件
   */
  shouldApply(
    code: string,
    filePath: string,
    options: TransformOptions
  ): boolean {
    // 检查是否为React文件
    if (options.i18nConfig?.framework === "react") return true;

    // 如果使用了旧格式的React配置
    if (options.hookName || options.hookImport || options.translationMethod) {
      return /\.(jsx|tsx|js|ts)$/.test(filePath);
    }

    return (
      /\.(jsx|tsx)$/.test(filePath) ||
      code.includes("import React") ||
      code.includes('from "react"') ||
      code.includes("from 'react'") ||
      this.hasJSXElements(code)
    );
  }

  /**
   * 检查代码中是否包含JSX元素
   */
  private hasJSXElements(code: string): boolean {
    return /<[A-Z][a-zA-Z0-9]*/.test(code) || /<[a-z]+/.test(code);
  }

  /**
   * 获取React解析器配置
   */
  getParserConfig(): object {
    return {
      plugins: ["jsx"],
    };
  }

  /**
   * 获取React所需的导入和Hook需求
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
        variableName: translationMethod,
        isDestructured: translationMethod !== "default",
        callExpression: this.generateHookCallExpression(hookName, translationMethod),
      },
    ];

    return { imports, hooks };
  }

  /**
   * React特定的后处理
   */
  postProcess(
    code: string,
    extractedStrings: ExtractedString[],
    options: TransformOptions,
    context: ProcessingContext
  ): string {
    // 新的统一格式已经在 processImportsAndHooks 中处理，这里跳过后处理
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
      options.i18nConfig?.i18nImport?.name ||
      options.translationMethod ||
      "t"
    );
  }

  /**
   * 生成Hook调用表达式
   */
  private generateHookCallExpression(hookName: string, translationMethod: string): string {
    if (translationMethod === "default") {
      return `const ${translationMethod} = ${hookName}();`;
    } else {
      return `const { ${translationMethod} } = ${hookName}();`;
    }
  }
}
