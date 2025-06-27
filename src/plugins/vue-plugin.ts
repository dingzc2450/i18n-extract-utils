/**
 * Vue 框架插件
 * 负责Vue相关的处理逻辑
 */

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
 * Vue 插件实现
 */
export class VuePlugin implements FrameworkPlugin {
  name = "vue";

  /**
   * 检测是否应该应用Vue插件
   */
  shouldApply(
    code: string,
    filePath: string,
    options: TransformOptions
  ): boolean {
    // 检查是否明确指定为Vue框架
    if (options.i18nConfig?.framework === "vue") return true;

    // 检查文件扩展名
    if (/\.vue$/.test(filePath)) return true;

    // 检查是否包含Vue相关导入或语法
    return (
      code.includes('from "vue"') ||
      code.includes("from 'vue'") ||
      code.includes("import { defineComponent") ||
      code.includes("import { ref, reactive") ||
      this.hasVueCompositionAPI(code)
    );
  }

  /**
   * 检查是否包含Vue Composition API
   */
  private hasVueCompositionAPI(code: string): boolean {
    const vueCompositionPatterns = [
      /\bref\s*\(/,
      /\breactive\s*\(/,
      /\bcomputed\s*\(/,
      /\bwatch\s*\(/,
      /\bonMounted\s*\(/,
      /\bsetup\s*\(/,
    ];

    return vueCompositionPatterns.some(pattern => pattern.test(code));
  }

  /**
   * Vue预处理（如果需要特殊处理.vue文件）
   */
  preProcess?(code: string, options: TransformOptions): string {
    // 如果是.vue文件，可能需要特殊处理
    // 这里可以处理单文件组件的script部分
    return code;
  }

  /**
   * 获取Vue解析器配置
   */
  getParserConfig(): object {
    return {
      plugins: ["typescript"], // Vue通常支持TypeScript
    };
  }

  /**
   * 获取Vue所需的导入和Hook需求
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

    // Vue的i18n通常使用vue-i18n
    const i18nSource = options.i18nConfig?.i18nImport?.source || "vue-i18n";
    const i18nMethod = options.i18nConfig?.i18nImport?.importName || "useI18n";
    const translationMethod = options.i18nConfig?.i18nImport?.name || "t";

    const imports: ImportRequirement[] = [
      {
        source: i18nSource,
        specifiers: [{ name: i18nMethod }],
        isDefault: false,
      },
    ];

    const hooks: HookRequirement[] = [
      {
        hookName: i18nMethod,
        variableName: translationMethod,
        isDestructured: true,
        callExpression: `const { ${translationMethod} } = ${i18nMethod}();`,
      },
    ];

    return { imports, hooks };
  }

  /**
   * Vue特定的后处理
   */
  postProcess(
    code: string,
    extractedStrings: ExtractedString[],
    options: TransformOptions,
    context: ProcessingContext
  ): string {
    // Vue特定的后处理逻辑
    return code;
  }
}
