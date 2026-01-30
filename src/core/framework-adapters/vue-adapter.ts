/**
 * Vue 框架适配器
 * 处理Vue不同场景（Script Setup / Options API / Composition API）的国际化
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
} from "./types";
import {
  BaseAdapter,
  BaseCallStrategy,
  ThisMethodCallStrategy,
  BaseImportPolicy,
  NoImportPolicy,
} from "./base-adapter";

/**
 * Vue上下文类型
 */
export enum VueContextType {
  SCRIPT_SETUP = "script-setup",
  OPTIONS_API = "options-api",
  COMPOSITION_API = "composition-api",
  PLAIN_SCRIPT = "plain-script",
}

/**
 * Vue Script Setup 导入策略
 */
export class VueScriptSetupImportPolicy extends BaseImportPolicy {
  constructor(
    source: string = "vue-i18n",
    hookName: string = "useI18n",
    translationMethod: string = "t"
  ) {
    super(ImportType.HOOK, source, hookName, translationMethod);
  }
}

/**
 * Vue Options API 导入策略 (使用 this.$t)
 */
export class VueOptionsAPIImportPolicy extends NoImportPolicy {
  constructor(translationMethod: string = "$t") {
    super(translationMethod);
  }
}

/**
 * Vue 适配器实现
 */
export class VueAdapter
  extends BaseAdapter
  implements FrameworkAdapter, LegacyFrameworkAdapter
{
  readonly name = "vue";
  readonly framework = Framework.Vue;

  constructor(options: NormalizedTransformOptions) {
    super(options);
  }

  /**
   * 检测Vue上下文类型
   */
  detectContextType(context?: AdapterContext): VueContextType {
    if (!context) {
      return VueContextType.PLAIN_SCRIPT;
    }

    if (context.isScriptSetup) {
      return VueContextType.SCRIPT_SETUP;
    }
    if (context.isOptionsAPI) {
      return VueContextType.OPTIONS_API;
    }

    const code = context.code || "";
    if (this.isScriptSetupCode(code)) {
      return VueContextType.SCRIPT_SETUP;
    }
    if (this.isOptionsAPICode(code)) {
      return VueContextType.OPTIONS_API;
    }
    if (this.hasSetupFunction(code)) {
      return VueContextType.COMPOSITION_API;
    }

    return VueContextType.PLAIN_SCRIPT;
  }

  getCallStrategy(context?: AdapterContext): CallExpressionStrategy {
    const vueOverrides =
      this.options.normalizedI18nConfig.i18nImport.vueOverrides;

    // 只有当明确设置 useThisInScript 时才使用 this 访问方式
    // 不自动检测 Options API，保持与原有行为一致
    if (vueOverrides?.useThisInScript) {
      const methodName =
        vueOverrides.scriptFunction || this.getTranslationMethod();
      return new ThisMethodCallStrategy(methodName);
    }

    // 检查上下文是否明确要求使用 Options API (通过 isOptionsAPI 标志)
    if (context?.isOptionsAPI) {
      const methodName = vueOverrides?.scriptFunction || "$t";
      return new ThisMethodCallStrategy(methodName);
    }

    const funcName =
      vueOverrides?.scriptFunction || this.getTranslationMethod();
    return new BaseCallStrategy(funcName, CallStyle.FUNCTION);
  }

  getImportPolicy(context?: AdapterContext): ImportPolicy {
    const i18nImport = this.options.normalizedI18nConfig.i18nImport;
    const vueOverrides = i18nImport.vueOverrides;

    if (i18nImport.noImport) {
      return new NoImportPolicy(i18nImport.globalFunction || "$t");
    }

    // 只有当明确设置 useThisInScript 时才使用无导入策略
    if (vueOverrides?.useThisInScript) {
      const methodName = vueOverrides.scriptFunction || "$t";
      return new VueOptionsAPIImportPolicy(methodName);
    }

    // 检查上下文是否明确要求使用 Options API
    if (context?.isOptionsAPI) {
      return new VueOptionsAPIImportPolicy("$t");
    }

    return new VueScriptSetupImportPolicy(
      i18nImport.source,
      i18nImport.importName,
      i18nImport.name
    );
  }

  matchesContext(context: AdapterContext): boolean {
    const framework = context.options.normalizedI18nConfig.framework;
    if (
      framework === Framework.Vue ||
      framework === ("vue2" as Framework) ||
      framework === ("vue3" as Framework)
    ) {
      return true;
    }

    if (context.filePath.endsWith(".vue")) {
      return true;
    }

    if (context.isVueComponent) {
      return true;
    }

    return false;
  }

  /**
   * 获取脚本中使用的翻译函数名
   */
  getScriptTranslationMethod(context?: AdapterContext): string {
    return this.getCallStrategy(context).functionName;
  }

  /**
   * 获取模板中使用的翻译函数名
   */
  getTemplateTranslationMethod(): string {
    const vueOverrides =
      this.options.normalizedI18nConfig.i18nImport.vueOverrides;
    const i18nImport = this.options.normalizedI18nConfig.i18nImport;
    const noImport = i18nImport.noImport;

    return (
      vueOverrides?.templateFunction ||
      (noImport ? i18nImport.globalFunction || "$t" : i18nImport.name)
    );
  }

  /**
   * 是否在脚本中使用 this 访问器
   */
  isUsingThisInScript(): boolean {
    const vueOverrides =
      this.options.normalizedI18nConfig.i18nImport.vueOverrides;
    return vueOverrides?.useThisInScript === true;
  }

  private isScriptSetupCode(code: string): boolean {
    const hasTopLevelDeclarations =
      /^(import|const|let|var|function|class)\s/m.test(code);
    const hasExportDefault = /export\s+default/.test(code);
    return hasTopLevelDeclarations && !hasExportDefault;
  }

  private isOptionsAPICode(code: string): boolean {
    const optionsPatterns = [
      /export\s+default\s*\{[\s\S]*\bdata\s*[:(]/,
      /export\s+default\s*\{[\s\S]*\bmethods\s*:/,
      /export\s+default\s*\{[\s\S]*\bcomputed\s*:/,
      /export\s+default\s+defineComponent\s*\(/,
    ];
    return optionsPatterns.some(pattern => pattern.test(code));
  }

  private hasSetupFunction(code: string): boolean {
    return /\bsetup\s*\([^)]*\)\s*\{/.test(code);
  }
}

/**
 * Vue 适配器工厂
 */
export function createVueAdapter(
  options: NormalizedTransformOptions
): VueAdapter {
  return new VueAdapter(options);
}
