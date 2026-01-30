/**
 * React 框架适配器
 * 处理React函数组件、类组件、Hook等场景的国际化
 */

import { Framework } from "../../types";
import type { NormalizedTransformOptions } from "../config-normalizer";
import type { FrameworkAdapter as LegacyFrameworkAdapter } from "../core-ast-transformer";
import {
  CallStyle,
  ImportType,
  type FrameworkAdapter,
  type CallExpressionStrategy,
  type ImportPolicy,
  type AdapterContext,
  type ImportEdit,
  type HookEdit,
} from "./types";
import {
  BaseAdapter,
  BaseCallStrategy,
  BaseImportPolicy,
  NoImportPolicy,
} from "./base-adapter";

/**
 * React 上下文类型
 */
export enum ReactContextType {
  FUNCTION_COMPONENT = "function-component",
  CLASS_COMPONENT = "class-component",
  CUSTOM_HOOK = "custom-hook",
  REGULAR_FUNCTION = "regular-function",
  MODULE_LEVEL = "module-level",
}

/**
 * React Hook 导入策略
 */
export class ReactHookImportPolicy extends BaseImportPolicy {
  constructor(
    source: string = "react-i18next",
    hookName: string = "useTranslation",
    translationMethod: string = "t"
  ) {
    super(ImportType.HOOK, source, hookName, translationMethod);
  }

  planImportEdits(code: string, hasExistingImport: boolean): ImportEdit[] {
    if (hasExistingImport) return [];

    const importStatement = this.getImportStatement();
    if (!importStatement) return [];

    const importRegex = /^import\s+.+from\s+['"][^'"]+['"];?\s*$/gm;
    let lastImportEnd = 0;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(code)) !== null) {
      lastImportEnd = match.index + match[0].length;
    }

    if (lastImportEnd > 0) {
      return [
        {
          type: "insert",
          start: lastImportEnd,
          end: lastImportEnd,
          text: `\n${importStatement}`,
        },
      ];
    }

    return [{ type: "insert", start: 0, end: 0, text: `${importStatement}\n` }];
  }

  planHookEdits(code: string, hasExistingHook: boolean): HookEdit[] {
    if (hasExistingHook) return [];

    const hookStatement = this.getHookStatement();
    if (!hookStatement) return [];

    const functionBodyPatterns = [
      /function\s+\w+\s*\([^)]*\)\s*\{/g,
      /(?:const|let|var)\s+\w+\s*=\s*(?:function\s*)?\([^)]*\)\s*(?:=>)?\s*\{/g,
      /(?:const|let|var)\s+\w+\s*=\s*\([^)]*\)\s*=>\s*\{/g,
    ];

    for (const pattern of functionBodyPatterns) {
      const match = pattern.exec(code);
      if (match && match.index !== undefined) {
        const insertPos = match.index + match[0].length;
        return [{ position: insertPos, text: `\n  ${hookStatement}` }];
      }
    }

    return [];
  }
}

/**
 * React 直接导入策略 (React 15)
 */
export class React15ImportPolicy extends BaseImportPolicy {
  constructor(
    source: string = "react-intl-universal",
    importName: string = "intl",
    translationMethod: string = "intl.get"
  ) {
    super(ImportType.DEFAULT, source, importName, translationMethod);
  }
}

/**
 * React 适配器实现
 */
export class ReactAdapter
  extends BaseAdapter
  implements FrameworkAdapter, LegacyFrameworkAdapter
{
  readonly name = "react";
  readonly framework = Framework.React;

  constructor(options: NormalizedTransformOptions) {
    super(options);
  }

  /**
   * 检测React上下文类型
   */
  detectContextType(context?: AdapterContext): ReactContextType {
    if (!context) {
      return ReactContextType.MODULE_LEVEL;
    }

    if (context.isClassComponent) {
      return ReactContextType.CLASS_COMPONENT;
    }
    if (context.isCustomHook) {
      return ReactContextType.CUSTOM_HOOK;
    }
    if (context.isReactComponent) {
      return ReactContextType.FUNCTION_COMPONENT;
    }

    const code = context.code || "";
    if (this.isClassComponent(code)) {
      return ReactContextType.CLASS_COMPONENT;
    }
    if (this.isFunctionComponent(code)) {
      return ReactContextType.FUNCTION_COMPONENT;
    }
    if (this.isCustomHook(code, context.functionName)) {
      return ReactContextType.CUSTOM_HOOK;
    }

    return ReactContextType.REGULAR_FUNCTION;
  }

  getCallStrategy(_context?: AdapterContext): CallExpressionStrategy {
    const funcName = this.getTranslationMethod();
    return new BaseCallStrategy(funcName, CallStyle.FUNCTION);
  }

  getImportPolicy(_context?: AdapterContext): ImportPolicy {
    const i18nImport = this.options.normalizedI18nConfig.i18nImport;

    if (i18nImport.noImport) {
      return new NoImportPolicy(i18nImport.globalFunction || "t");
    }

    return new ReactHookImportPolicy(
      i18nImport.source,
      i18nImport.importName,
      i18nImport.name
    );
  }

  matchesContext(context: AdapterContext): boolean {
    const framework = context.options.normalizedI18nConfig.framework;
    if (framework === Framework.React) {
      return true;
    }

    if (
      context.filePath.endsWith(".tsx") ||
      context.filePath.endsWith(".jsx")
    ) {
      if (!context.filePath.endsWith(".vue.tsx")) {
        return true;
      }
    }

    if (context.isReactComponent) {
      return true;
    }

    return false;
  }

  /**
   * 获取翻译函数名称
   */
  getTranslationMethodName(): string {
    return this.getTranslationMethod();
  }

  /**
   * 获取 Hook 名称
   */
  getHookName(): string {
    return this.options.normalizedI18nConfig.i18nImport.importName;
  }

  /**
   * 获取 Hook 来源
   */
  getHookSource(): string {
    return this.options.normalizedI18nConfig.i18nImport.source;
  }

  /**
   * 生成 Hook 调用表达式
   */
  generateHookCallExpression(): string {
    const hookName = this.getHookName();
    const translationMethod = this.getTranslationMethodName();

    if (translationMethod === "default") {
      return `const t = ${hookName}();`;
    }
    return `const { ${translationMethod} } = ${hookName}();`;
  }

  /**
   * 是否需要 Hook
   */
  needsHook(): boolean {
    const policy = this.getImportPolicy();
    return policy.type === ImportType.HOOK;
  }

  private isClassComponent(code: string): boolean {
    return /class\s+\w+\s+extends\s+(React\.)?Component/.test(code);
  }

  private isFunctionComponent(code: string): boolean {
    const patterns = [
      /function\s+[A-Z]\w*\s*\([^)]*\)\s*\{[\s\S]*?return\s*\(/,
      /(?:const|let|var)\s+[A-Z]\w*\s*=\s*(?:function\s*)?\([^)]*\)\s*(?:=>)?\s*\{?[\s\S]*?return\s*\(/,
      /(?:const|let|var)\s+[A-Z]\w*\s*=\s*\([^)]*\)\s*=>\s*\(/,
    ];
    return patterns.some(p => p.test(code));
  }

  private isCustomHook(code: string, functionName?: string): boolean {
    if (functionName && /^use[A-Z]/.test(functionName)) {
      return true;
    }
    return /(?:function|const|let|var)\s+(use[A-Z]\w*)/.test(code);
  }
}

/**
 * React 15 适配器实现
 */
export class React15Adapter
  extends BaseAdapter
  implements FrameworkAdapter, LegacyFrameworkAdapter
{
  readonly name = "react15";
  readonly framework = Framework.React15;

  constructor(options: NormalizedTransformOptions) {
    super(options);
  }

  getCallStrategy(_context?: AdapterContext): CallExpressionStrategy {
    const funcName =
      this.options.normalizedI18nConfig.i18nImport.name || "intl.get";
    return new BaseCallStrategy(funcName, CallStyle.NAMESPACE);
  }

  getImportPolicy(_context?: AdapterContext): ImportPolicy {
    const i18nImport = this.options.normalizedI18nConfig.i18nImport;

    if (i18nImport.noImport) {
      return new NoImportPolicy(i18nImport.globalFunction || "intl.get");
    }

    return new React15ImportPolicy(
      i18nImport.source || "react-intl-universal",
      i18nImport.importName || "intl",
      i18nImport.name || "intl.get"
    );
  }

  matchesContext(context: AdapterContext): boolean {
    const framework = context.options.normalizedI18nConfig.framework;
    return framework === Framework.React15;
  }

  /**
   * 获取翻译函数名称
   */
  getTranslationMethodName(): string {
    return this.options.normalizedI18nConfig.i18nImport.name || "intl.get";
  }

  /**
   * 获取导入源
   * React15 默认使用 "i18n"，除非明确指定其他源
   */
  getImportSource(): string {
    const explicitSource = this.options.normalizedI18nConfig.i18nImport.source;
    // 只有在明确指定了不同源时才覆盖默认的"i18n"
    if (explicitSource && explicitSource !== "react-i18next") {
      return explicitSource;
    }
    return "i18n";
  }

  /**
   * 获取导入名称
   */
  getImportName(): string {
    return this.options.normalizedI18nConfig.i18nImport.importName || "intl";
  }
}

/**
 * 通用 JS/TS 适配器
 */
export class GenericJSAdapter
  extends BaseAdapter
  implements FrameworkAdapter, LegacyFrameworkAdapter
{
  readonly name = "generic";
  readonly framework = Framework.React;

  constructor(options: NormalizedTransformOptions) {
    super(options);
  }

  getCallStrategy(_context?: AdapterContext): CallExpressionStrategy {
    const funcName = this.getTranslationMethod();
    return new BaseCallStrategy(funcName, CallStyle.FUNCTION);
  }

  getImportPolicy(_context?: AdapterContext): ImportPolicy {
    const i18nImport = this.options.normalizedI18nConfig.i18nImport;

    if (i18nImport.noImport) {
      return new NoImportPolicy(i18nImport.globalFunction || "t");
    }

    return new BaseImportPolicy(
      ImportType.NAMED,
      i18nImport.source,
      i18nImport.name,
      i18nImport.name
    );
  }

  matchesContext(context: AdapterContext): boolean {
    const filePath = context.filePath;
    return (
      filePath.endsWith(".js") ||
      filePath.endsWith(".ts") ||
      filePath.endsWith(".mjs") ||
      filePath.endsWith(".cjs")
    );
  }

  /**
   * 获取翻译函数名称
   */
  getTranslationMethodName(): string {
    return this.getTranslationMethod();
  }

  /**
   * 获取导入源
   */
  getImportSourceName(): string {
    return this.options.normalizedI18nConfig.i18nImport.source;
  }

  /**
   * 获取导入名称
   */
  getImportName(): string {
    return this.options.normalizedI18nConfig.i18nImport.importName;
  }
}

/**
 * 工厂函数
 */
export function createReactAdapter(
  options: NormalizedTransformOptions
): ReactAdapter {
  return new ReactAdapter(options);
}

export function createReact15Adapter(
  options: NormalizedTransformOptions
): React15Adapter {
  return new React15Adapter(options);
}

export function createGenericJSAdapter(
  options: NormalizedTransformOptions
): GenericJSAdapter {
  return new GenericJSAdapter(options);
}
