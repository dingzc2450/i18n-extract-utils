/**
 * 基础框架适配器
 * 提供通用实现，各框架适配器可继承并覆盖特定行为
 */

import type { Framework } from "../../types";
import type { NormalizedTransformOptions } from "../config-normalizer";
import {
  CallStyle,
  ImportType,
  type FrameworkAdapter,
  type CallExpressionStrategy,
  type ImportPolicy,
  type ImportEdit,
  type HookEdit,
  type AdapterContext,
  type AdapterImportInfo,
} from "./types";

/**
 * 基础调用表达式策略实现
 */
export class BaseCallStrategy implements CallExpressionStrategy {
  readonly style: CallStyle;
  readonly functionName: string;

  constructor(functionName: string, style: CallStyle = CallStyle.FUNCTION) {
    this.functionName = functionName;
    this.style = style;
  }

  /**
   * 构建调用表达式
   */
  buildCall(
    key: string | number,
    interpolations?: Record<string, string>
  ): string {
    const keyArg = typeof key === "string" ? `'${key}'` : String(key);
    const funcName = this.functionName;

    if (!interpolations || Object.keys(interpolations).length === 0) {
      return `${funcName}(${keyArg})`;
    }

    const interpolationCode = this.buildInterpolationObject(interpolations);
    return `${funcName}(${keyArg}, ${interpolationCode})`;
  }

  /**
   * 构建带注释的调用表达式
   */
  buildCallWithComment(
    key: string | number,
    rawText: string,
    interpolations?: Record<string, string>,
    commentType: "block" | "line" = "block"
  ): string {
    const call = this.buildCall(key, interpolations);
    const escapedText = rawText.replace(/\*\//g, "*\\/").replace(/\n/g, " ");

    if (commentType === "line") {
      return `${call} // ${escapedText}`;
    }
    return `${call} /* ${escapedText} */`;
  }

  /**
   * 构建插值对象字符串
   */
  protected buildInterpolationObject(obj: Record<string, string>): string {
    const entries = Object.entries(obj);
    if (entries.length === 0) return "{}";

    const parts = entries.map(([k, v]) => {
      if (k === v) return k;
      return `${k}: ${v}`;
    });

    return `{ ${parts.join(", ")} }`;
  }
}

/**
 * this方法调用策略 (Vue Options API)
 */
export class ThisMethodCallStrategy extends BaseCallStrategy {
  constructor(methodName: string = "$t") {
    const baseName = methodName.replace(/^this\./, "");
    super(`this.${baseName}`, CallStyle.THIS_METHOD);
  }
}

/**
 * 基础导入策略实现
 */
export class BaseImportPolicy implements ImportPolicy {
  readonly type: ImportType;
  protected readonly source: string;
  protected readonly importName: string;
  protected readonly translationMethod: string;

  constructor(
    type: ImportType,
    source: string,
    importName: string,
    translationMethod: string
  ) {
    this.type = type;
    this.source = source;
    this.importName = importName;
    this.translationMethod = translationMethod;
  }

  shouldAddImport(
    hasReplacements: boolean,
    _existingImports?: string[]
  ): boolean {
    if (this.type === ImportType.NONE) {
      return false;
    }
    return hasReplacements;
  }

  getImportStatement(): string | null {
    switch (this.type) {
      case ImportType.NONE:
        return null;
      case ImportType.NAMED:
        return `import { ${this.importName} } from '${this.source}';`;
      case ImportType.DEFAULT:
        return `import ${this.importName} from '${this.source}';`;
      case ImportType.HOOK:
        return `import { ${this.importName} } from '${this.source}';`;
      default:
        return null;
    }
  }

  getHookStatement(): string | null {
    if (this.type !== ImportType.HOOK) {
      return null;
    }
    return `const { ${this.translationMethod} } = ${this.importName}();`;
  }

  planImportEdits(_code: string, _hasExistingImport: boolean): ImportEdit[] {
    return [];
  }

  planHookEdits(_code: string, _hasExistingHook: boolean): HookEdit[] {
    return [];
  }
}

/**
 * 无导入策略
 */
export class NoImportPolicy extends BaseImportPolicy {
  constructor(translationMethod: string = "$t") {
    super(ImportType.NONE, "", "", translationMethod);
  }

  shouldAddImport(): boolean {
    return false;
  }

  getImportStatement(): string | null {
    return null;
  }

  getHookStatement(): string | null {
    return null;
  }
}

/**
 * 基础框架适配器抽象类
 */
export abstract class BaseAdapter implements FrameworkAdapter {
  abstract readonly name: string;
  abstract readonly framework: Framework;

  protected options: NormalizedTransformOptions;

  constructor(options: NormalizedTransformOptions) {
    this.options = options;
  }

  abstract getCallStrategy(context?: AdapterContext): CallExpressionStrategy;
  abstract getImportPolicy(context?: AdapterContext): ImportPolicy;
  abstract matchesContext(context: AdapterContext): boolean;

  needsHookInContext(context: AdapterContext): boolean {
    const policy = this.getImportPolicy(context);
    return policy.type === ImportType.HOOK;
  }

  /**
   * 获取导入信息 (兼容SmartImportManager)
   */
  getImportInfo(context?: AdapterContext): AdapterImportInfo {
    const callStrategy = this.getCallStrategy(context);
    const importPolicy = this.getImportPolicy(context);

    return {
      importStatement: importPolicy.getImportStatement() || "",
      callName: callStrategy.functionName,
      needsHook: importPolicy.type === ImportType.HOOK,
      hookCall: importPolicy.getHookStatement() || undefined,
      noImport: importPolicy.type === ImportType.NONE,
    };
  }

  protected getTranslationMethod(): string {
    return this.options.normalizedI18nConfig.i18nImport.name;
  }

  protected getHookName(): string {
    return this.options.normalizedI18nConfig.i18nImport.importName;
  }

  protected getImportSource(): string {
    return this.options.normalizedI18nConfig.i18nImport.source;
  }

  protected isNoImport(): boolean {
    return this.options.normalizedI18nConfig.i18nImport.noImport === true;
  }
}

/**
 * 适配器注册表
 */
export class AdapterRegistry {
  private factories = new Map<
    Framework,
    (options: NormalizedTransformOptions) => FrameworkAdapter
  >();

  register(
    framework: Framework,
    factory: (options: NormalizedTransformOptions) => FrameworkAdapter
  ): void {
    this.factories.set(framework, factory);
  }

  get(
    framework: Framework,
    options: NormalizedTransformOptions
  ): FrameworkAdapter | undefined {
    const factory = this.factories.get(framework);
    return factory ? factory(options) : undefined;
  }

  selectAdapter(context: AdapterContext): FrameworkAdapter | undefined {
    const framework = context.options.normalizedI18nConfig.framework;
    const adapter = this.get(framework, context.options);

    if (adapter && adapter.matchesContext(context)) {
      return adapter;
    }

    for (const factory of this.factories.values()) {
      const candidate = factory(context.options);
      if (candidate.matchesContext(context)) {
        return candidate;
      }
    }

    return undefined;
  }
}

export const adapterRegistry = new AdapterRegistry();
