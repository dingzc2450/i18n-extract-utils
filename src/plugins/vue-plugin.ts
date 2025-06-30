/**
 * Vue 框架插件
 * 直接使用VueCodeGenerator的完整实现，提供完整的Vue SFC支持
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
  UsedExistingKey,
  ChangeDetail,
} from "../types";
import { VueCodeGenerator } from "../frameworks/vue-code-generator";
import { getDefaultPattern } from "../string-extractor";

/**
 * Vue 插件实现
 * 直接委托给VueCodeGenerator进行完整的Vue SFC处理
 */
export class VuePlugin implements FrameworkPlugin {
  name = "vue";
  private vueCodeGenerator = new VueCodeGenerator();

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

    // 使用VueCodeGenerator的canHandle方法进行检测
    return this.vueCodeGenerator.canHandle(code, filePath);
  }

  /**
   * 获取Vue解析器配置
   */
  getParserConfig(): object {
    return {
      plugins: ["typescript", "jsx"], // Vue支持TypeScript和JSX语法
    };
  }

  /**
   * Vue插件完全接管处理，返回带匹配字符串的占位符确保postProcess被调用
   */
  preProcess(code: string, options: TransformOptions): string {
    // 对于Vue文件，返回一个包含匹配字符串的占位符
    // 这确保CoreProcessor会检测到修改并调用postProcess
    const pattern = options?.pattern
      ? new RegExp(options.pattern).source
      : getDefaultPattern().source;
    
    // 返回一个匹配模式的占位符，确保会被处理
    return "const __VUE_PLACEHOLDER__ = '___VUE_PROCESS___';";
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
   * Vue特定的后处理：直接使用VueCodeGenerator处理
   */
  postProcess(
    code: string,
    extractedStrings: ExtractedString[],
    options: TransformOptions,
    context: ProcessingContext
  ): string {
    // 使用VueCodeGenerator直接处理整个文件
    const result = this.vueCodeGenerator.processCode(
      context.originalCode,
      context.filePath,
      options,
      new Map() // 暂时不处理existingValueToKey，这可以在后续优化
    );

    // 清空原有的extractedStrings，使用VueCodeGenerator的结果
    extractedStrings.length = 0;
    extractedStrings.push(...result.extractedStrings);

    return result.code;
  }
}
