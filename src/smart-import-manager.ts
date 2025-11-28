import type { NonReactI18nConfig, I18nImportConfig } from "./types";
import type { ContextInfo } from "./context-detector";

/**
 * 导入信息
 */
export interface ImportInfo {
  /** 导入语句 */
  importStatement: string;
  /** 调用函数名 */
  callName: string;
  /** 是否需要添加 Hook */
  needsHook: boolean;
  /** Hook 导入信息（如果需要的话） */
  hookImport?: {
    importName: string;
    source: string;
    hookCall: string;
  };
  /**
   * 是否禁用自动注入 import（即全局注入/无需导入模式）
   */
  noImport?: boolean;
}

/**
 * 智能导入管理器
 * 根据代码上下文选择合适的导入策略
 */
export class SmartImportManager {
  constructor(
    private reactConfig?: I18nImportConfig,
    private nonReactConfig?: NonReactI18nConfig | null
  ) {}
  init(
    reactConfig?: I18nImportConfig,
    nonReactConfig?: NonReactI18nConfig | null
  ) {
    this.reactConfig = reactConfig;
    this.nonReactConfig = nonReactConfig;
  }
  /**
   * 根据上下文获取导入信息
   */
  getImportInfo(context: ContextInfo): ImportInfo {
    // React 组件上下文，使用 Hook
    if (context.isReactComponent || context.isCustomHook) {
      return this.getReactImportInfo(context);
    }

    // 非 React 组件上下文，使用普通导入
    return this.getNonReactImportInfo();
  }

  stringifyImport(importInfo: ImportInfo): string {
    return JSON.stringify(importInfo);
  }

  parseImport(importStr: string): ImportInfo {
    return JSON.parse(importStr);
  }

  /**
   * 获取 React 组件的导入信息
   */
  private getReactImportInfo(context: ContextInfo): ImportInfo {
    const config = this.reactConfig || {
      name: "t",
      importName: "useTranslation",
      source: "react-i18next",
    };

    // 当用户指定 noImport 时，返回标识以指示上层不进行 import 注入
    if (config.noImport) {
      const baseCall = config.globalFunction || config.name || "t";
      const callName =
        config.vueOverrides?.useThisInScript && !baseCall.includes(".")
          ? `this.${baseCall.replace(/^this\./, "")}`
          : baseCall;
      return {
        importStatement: "",
        callName,
        needsHook: false,
        noImport: true,
      };
    }

    // 如果有自定义导入，直接使用自定义导入
    if (config.custom) {
      // 对于自定义导入，我们使用配置中的name作为翻译方法名
      // 但需要hook来获取这个方法
      const hookName = this.extractHookNameFromCustomImport(config.custom);
      const translationMethod = config.name || "t";

      return {
        importStatement: config.custom,
        callName: translationMethod,
        needsHook: true, // 需要hook调用来获取翻译方法
        hookImport: {
          importName: hookName,
          source: this.extractSourceFromCustomImport(config.custom),
          hookCall: `const { ${translationMethod} } = ${hookName}();`,
        },
      };
    }

    const hookName = config.importName || "useTranslation";
    const source = config.source || "react-i18next";
    const translationMethod = config.name || "t";

    return {
      importStatement: `import { ${hookName} } from '${source}';`,
      callName: translationMethod,
      needsHook: context.needsHook,
      hookImport: context.needsHook
        ? {
            importName: hookName,
            source,
            hookCall: `const { ${translationMethod} } = ${hookName}();`,
          }
        : undefined,
    };
  }

  /**
   * 获取非 React 组件的导入信息
   */
  private getNonReactImportInfo(): ImportInfo {
    // 如果用户配置了非 React 配置，使用用户配置
    if (this.nonReactConfig) {
      return this.generateNonReactImport(this.nonReactConfig);
    }

    // 否则回退到 React 配置，但不使用 Hook
    const config = this.reactConfig || {
      name: "t",
      source: "react-i18next",
    };

    if (config.noImport) {
      const callName = config.globalFunction || config.name || "t";
      return {
        importStatement: "",
        callName,
        needsHook: false,
        noImport: true,
      };
    }

    // 对于非组件场景，我们尝试直接导入翻译函数而不是 Hook
    const translationMethod = config.name || "t";
    const callName =
      config.vueOverrides?.useThisInScript && !translationMethod.includes(".")
        ? `this.${translationMethod.replace(/^this\./, "")}`
        : translationMethod;
    const source = config.source || "react-i18next";

    return {
      importStatement: `import { ${translationMethod} } from '${source}';`,
      callName,
      needsHook: false,
    };
  }

  /**
   * 根据非 React 配置生成导入信息
   */
  private generateNonReactImport(config: NonReactI18nConfig): ImportInfo {
    // 如果有自定义导入语句，直接使用
    if (config.customImport) {
      // 尝试从自定义导入中提取函数名
      const functionName = this.extractFunctionNameFromCustomImport(
        config.customImport
      );
      return {
        importStatement: config.customImport,
        callName: functionName || config.functionName || "t",
        needsHook: false,
      };
    }

    const functionName = config.functionName || "t";
    const source = config.source || "react-i18n-plus";
    const importType = config.importType || "named";

    let importStatement: string;

    switch (importType) {
      case "default":
        importStatement = `import ${functionName} from '${source}';`;
        break;

      case "namespace": {
        const namespace = config.namespace || "i18n";
        importStatement = `import * as ${namespace} from '${source}';`;
        return {
          importStatement,
          callName: `${namespace}.${functionName}`,
          needsHook: false,
        };
      }
      case "named":
      default:
        importStatement = `import { ${functionName} } from '${source}';`;
        break;
    }

    return {
      importStatement,
      callName: functionName,
      needsHook: false,
    };
  }

  /**
   * 从自定义导入语句中提取hook名称
   */
  private extractHookNameFromCustomImport(customImport: string): string {
    // 匹配 import { something as hookName } from "source" 或 import { hookName } from "source"
    const specifiersMatch = customImport.match(/import\s*\{([^}]*)\}/);
    if (specifiersMatch) {
      const specifiers = specifiersMatch[1];

      // 查找别名的导入
      const aliasMatch = specifiers.match(/\w+\s+as\s+(\w+)/);
      if (aliasMatch) {
        return aliasMatch[1]; // 返回别名
      }

      // 如果没有别名，返回第一个标识符
      const nameMatch = specifiers.match(/(\w+)/);
      if (nameMatch) {
        return nameMatch[1];
      }
    }

    // 回退到默认的hook名称
    return "useTranslation";
  }

  /**
   * 从自定义导入语句中提取源
   */
  private extractSourceFromCustomImport(customImport: string): string {
    const sourceMatch = customImport.match(/from\s+['"]([^'"]+)['"]/);
    return sourceMatch ? sourceMatch[1] : "custom-i18n";
  }

  /**
   * 从自定义导入语句中提取函数名
   */
  private extractFunctionNameFromCustomImport(
    customImport: string
  ): string | null {
    // 简单的正则匹配常见的导入模式

    // import t from 'source'
    const defaultMatch = customImport.match(/import\s+(\w+)\s+from/);
    if (defaultMatch) {
      return defaultMatch[1];
    }

    // import { t } from 'source' 或 import { translate as t } from 'source'
    const namedMatch = customImport.match(
      /import\s*\{\s*(?:\w+\s+as\s+)?(\w+)\s*\}/
    );
    if (namedMatch) {
      return namedMatch[1];
    }

    // import * as i18n from 'source'
    const namespaceMatch = customImport.match(/import\s*\*\s*as\s+(\w+)/);
    if (namespaceMatch) {
      // 对于命名空间导入，假设使用 .t 方法
      return `${namespaceMatch[1]}.t`;
    }

    return null;
  }

  /**
   * 检查代码中是否已经存在指定的导入
   */
  hasImport(code: string, importInfo: ImportInfo): boolean {
    if (importInfo.needsHook && importInfo.hookImport) {
      // 检查 Hook 导入
      const hookPattern = new RegExp(
        `import\\s+.*\\b${importInfo.hookImport.importName}\\b.*from\\s+['"]${this.escapeRegex(importInfo.hookImport.source)}['"]`
      );
      return hookPattern.test(code);
    } else {
      // 检查普通导入
      const importPattern = new RegExp(
        `import\\s+.*\\b${importInfo.callName}\\b.*from\\s+['"][^'"]*['"]`
      );
      return importPattern.test(code);
    }
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
