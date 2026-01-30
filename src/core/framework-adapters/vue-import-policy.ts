/**
 * Vue 导入策略
 * 处理Vue不同场景下的导入和Hook注入策略
 */

import {
  ImportType,
  type ImportPolicy,
  type ImportEdit,
  type HookEdit,
} from "./types";
import { BaseImportPolicy, NoImportPolicy } from "./base-adapter";

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

    const importRegex = /^import\s+.+from\s+['"][^'"]+['"];?\s*$/gm;
    let lastImportEnd = 0;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(code)) !== null) {
      lastImportEnd = match.index + match[0].length;
    }

    let insertPos = lastImportEnd;
    const afterImports = code.substring(lastImportEnd);
    const newlineMatch = afterImports.match(/^\s*\n/);
    if (newlineMatch) {
      insertPos += newlineMatch[0].length;
    }

    return [{ position: insertPos, text: `\n${hookStatement}\n` }];
  }
}

/**
 * Vue Options API 导入策略
 */
export class VueOptionsAPIImportPolicy extends NoImportPolicy {
  constructor(translationMethod: string = "$t") {
    super(translationMethod);
  }
}

/**
 * Vue Composition API 导入策略
 */
export class VueCompositionAPIImportPolicy extends BaseImportPolicy {
  constructor(
    source: string = "vue-i18n",
    hookName: string = "useI18n",
    translationMethod: string = "t"
  ) {
    super(ImportType.HOOK, source, hookName, translationMethod);
  }

  planHookEdits(code: string, hasExistingHook: boolean): HookEdit[] {
    if (hasExistingHook) return [];

    const hookStatement = this.getHookStatement();
    if (!hookStatement) return [];

    const setupMatch = code.match(/setup\s*\([^)]*\)\s*\{/);
    if (setupMatch && setupMatch.index !== undefined) {
      const insertPos = setupMatch.index + setupMatch[0].length;
      return [{ position: insertPos, text: `\n    ${hookStatement}` }];
    }

    return [];
  }
}

/**
 * Vue 全局导入策略 (无需导入，全局可用)
 */
export class VueGlobalImportPolicy extends NoImportPolicy {
  constructor(translationMethod: string = "$t") {
    super(translationMethod);
  }
}

/**
 * Vue 导入策略工厂
 */
export class VueImportPolicyFactory {
  static createForScriptSetup(
    source: string = "vue-i18n",
    hookName: string = "useI18n",
    translationMethod: string = "t"
  ): ImportPolicy {
    return new VueScriptSetupImportPolicy(source, hookName, translationMethod);
  }

  static createForOptionsAPI(translationMethod: string = "$t"): ImportPolicy {
    return new VueOptionsAPIImportPolicy(translationMethod);
  }

  static createForCompositionAPI(
    source: string = "vue-i18n",
    hookName: string = "useI18n",
    translationMethod: string = "t"
  ): ImportPolicy {
    return new VueCompositionAPIImportPolicy(
      source,
      hookName,
      translationMethod
    );
  }

  static createGlobal(translationMethod: string = "$t"): ImportPolicy {
    return new VueGlobalImportPolicy(translationMethod);
  }
}

/**
 * @deprecated 使用具体的策略类代替
 */
export class VueImportPolicy extends VueScriptSetupImportPolicy {
  constructor(
    source: string = "vue-i18n",
    hookName: string = "useI18n",
    translationMethod: string = "t"
  ) {
    super(source, hookName, translationMethod);
  }
}
