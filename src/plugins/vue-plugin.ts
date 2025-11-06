/**
 * Vue 框架插件
 * 提供完整的Vue SFC支持，包括模板、脚本和样式的处理
 */

import type {
  FrameworkPlugin,
  ProcessingContext,
  ImportRequirement,
  HookRequirement,
} from "../core/types";
import type {
  ExtractedString,
  UsedExistingKey,
  ChangeDetail,
  ExistingValueToKeyMapType,
} from "../types";
import type { NormalizedTransformOptions } from "../core/config-normalizer";
import type { ParserOptions } from "@babel/parser";
// removed generate-based path; keep parser/generator imports unused-free
import { getVueCompilerManager } from "./vue/compiler-manager";
import { parseVueFile, assembleVueFile } from "./vue/sfc";
import { processVueTemplate } from "./vue/template-processor";
import { processVueScript } from "./vue/script-processor";
import {
  hasNamedImport,
  insertNamedImport,
  hasHookDestructure,
  insertHookInSetupOrTop,
} from "../core/text-import-inserter";
import { CoreAstTransformer } from "../core/core-ast-transformer";
import { VueAdapter } from "../core/framework-adapters/vue-adapter";

/**
 * Vue 插件实现
 * 完整的Vue SFC处理，包含模板、脚本和样式部分的处理
 */
export class VuePlugin implements FrameworkPlugin {
  name = "vue";
  /**
   * 检测是否应该应用Vue插件
   */
  shouldApply(
    _code: string,
    _filePath: string,
    options: NormalizedTransformOptions
  ): boolean {
    // 只根据框架类型判断是否应用
    return (
      options.normalizedI18nConfig.framework === "vue" ||
      options.normalizedI18nConfig.framework === "vue2" ||
      options.normalizedI18nConfig.framework === "vue3"
    );
  }
  /**
   * 获取Vue解析器配置
   */
  getParserConfig(): ParserOptions {
    return {
      plugins: ["typescript", "jsx"], // Vue支持TypeScript和JSX语法
    };
  }

  /**
   * Vue插件完全接管处理，返回带匹配字符串的占位符确保postProcess被调用
   */
  preProcess(_code: string, _options: NormalizedTransformOptions): string {
    // 对于Vue文件，返回一个包含匹配字符串的占位符
    // 这确保CoreProcessor会检测到修改并调用postProcess

    // 返回一个匹配模式的占位符，确保会被处理
    return "const __VUE_PLACEHOLDER__ = '___VUE_PROCESS___';";
  }

  /**
   * 获取Vue所需的导入和Hook需求
   */
  getRequiredImportsAndHooks(
    options: NormalizedTransformOptions,
    context: ProcessingContext
  ): {
    imports: ImportRequirement[];
    hooks: HookRequirement[];
  } {
    // 如果没有提取到字符串，直接返回空
    if (context.result.extractedStrings.length === 0) {
      return { imports: [], hooks: [] };
    }

    // 如果用户设置了 noImport，则不要自动生成 imports/hooks
    if (options.normalizedI18nConfig.i18nImport.noImport) {
      return { imports: [], hooks: [] };
    }

    // Vue的i18n通常使用vue-i18n
    const i18nSource = options.normalizedI18nConfig.i18nImport.source;
    const i18nMethod = options.normalizedI18nConfig.i18nImport.importName;
    const translationMethod = options.normalizedI18nConfig.i18nImport.name;

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
   * Vue特定的后处理：处理Vue文件
   */
  postProcess(
    _code: string,
    options: NormalizedTransformOptions,
    context: ProcessingContext
  ): string {
    const { extractedStrings } = context.result;
    // 使用集成后的Vue处理方法处理整个文件
    try {
      const result = this.processCode(
        context.originalCode,
        context.filePath, // 保留文件路径参数，用于AST解析和框架检测
        options,
        new Map() // 暂时不处理existingValueToKey，这可以在后续优化
      );

      // 清空原有的extractedStrings，使用处理结果
      extractedStrings.length = 0;
      extractedStrings.push(...result.extractedStrings);

      return result.code;
    } finally {
      // 确保批次处理结束
      getVueCompilerManager().endBatch();
    }
  }

  /**
   * 处理Vue代码
   * 整合了原VueCodeGenerator的核心功能
   */
  processCode(
    code: string,
    filePath: string,
    options: NormalizedTransformOptions,
    existingValueToKeyMap?: ExistingValueToKeyMapType
  ) {
    // 初始化Vue编译器管理器
    getVueCompilerManager();
    // 检查是否为Vue单文件组件
    const isVueSFC =
      filePath.endsWith(".vue") ||
      code.includes("<template>") ||
      code.includes("<script");

    if (isVueSFC) {
      // 处理Vue单文件组件
      return this.processSFC(code, filePath, options, existingValueToKeyMap);
    } else {
      // 处理纯JavaScript Vue组件
      return this.processJavaScriptVue(
        code,
        filePath,
        options,
        existingValueToKeyMap
      );
    }
  }

  /**
   * 处理Vue单文件组件
   */
  private processSFC(
    code: string,
    filePath: string,
    options: NormalizedTransformOptions,
    existingValueToKeyMap?: ExistingValueToKeyMapType
  ) {
    const extractedStrings: ExtractedString[] = [];
    const usedExistingKeysList: UsedExistingKey[] = [];
    const changes: ChangeDetail[] = [];
    const generatedKeysMap: Map<string, string | number> = new Map();

    // 获取i18n配置
    const i18nConfig = options.normalizedI18nConfig || {};
    const i18nImportConfig = i18nConfig.i18nImport;

    const noImport = i18nImportConfig?.noImport === true;
    const vueOverrides = i18nImportConfig?.vueOverrides || {};
    const translationMethodForTemplate =
      vueOverrides.templateFunction ||
      (noImport
        ? i18nImportConfig?.globalFunction || "$t"
        : i18nImportConfig?.name);
    const translationMethodForScript =
      vueOverrides.scriptFunction ||
      (noImport
        ? i18nImportConfig?.globalFunction || i18nImportConfig?.name
        : i18nImportConfig?.name);
    const useThisInScript = vueOverrides.useThisInScript === true;

    // 解析Vue单文件组件
    const vueFile = parseVueFile(code);

    // 处理模板部分
    let templateNeedsHook = false;
    if (vueFile.template) {
      const beforeTplCount = extractedStrings.length;
      vueFile.template = processVueTemplate(
        vueFile.template,
        translationMethodForTemplate,
        extractedStrings,
        usedExistingKeysList,
        options,
        existingValueToKeyMap || new Map(),
        filePath,
        generatedKeysMap
      );
      const afterTplCount = extractedStrings.length;
      const tplDelta = afterTplCount - beforeTplCount;
      // 当模板替换使用的是 hook 名称（如 t）且允许注入时，脚本侧需要注入 useI18n
      templateNeedsHook =
        !noImport &&
        tplDelta > 0 &&
        translationMethodForTemplate === i18nImportConfig.name;
    }

    // 处理脚本部分
    if (vueFile.script) {
      const scriptResult = processVueScript(
        vueFile.script,
        vueFile.isSetupScript,
        options,
        extractedStrings,
        usedExistingKeysList,
        existingValueToKeyMap || new Map(),
        filePath,
        generatedKeysMap,
        {
          noImport,
          translationMethod: translationMethodForScript,
          useThisInScript,
          // 若模板需要 hook，则在脚本中进行注入
          templateNeedsHook,
        }
      );
      vueFile.script = scriptResult.code;
    } else if (extractedStrings.length > 0 || usedExistingKeysList.length > 0) {
      // 如果没有script但提取了字符串，需要添加script setup
      const hookName = i18nImportConfig.importName;
      const hookImport = i18nImportConfig.source;

      if (!noImport) {
        vueFile.script = `import { ${hookName} } from "${hookImport}";\nconst { ${i18nImportConfig.name} } = ${hookName}();`;
        vueFile.isSetupScript = true;
        // 新增脚本时，默认使用 <script setup>
        (vueFile as { scriptAttrs?: string }).scriptAttrs = " setup";
      } else {
        // noImport 模式下不自动插入script setup
        vueFile.isSetupScript = false;
      }
    }

    // 重新组装Vue文件
    const processedCode = assembleVueFile(vueFile);

    return {
      code: processedCode,
      extractedStrings,
      usedExistingKeysList,
      changes,
    };
  }

  /**
   * 处理纯JavaScript Vue组件
   */
  private processJavaScriptVue(
    code: string,
    filePath: string,
    options: NormalizedTransformOptions,
    existingValueToKeyMap?: ExistingValueToKeyMapType
  ) {
    // 统一：默认使用 AST 规划 + 文本最小替换 的核心路径
    const i18nImportConfig = options.normalizedI18nConfig.i18nImport;
    const noImport = i18nImportConfig?.noImport === true;
    const vueOverrides = i18nImportConfig?.vueOverrides || {};
    const translationMethodForScript =
      vueOverrides.scriptFunction ||
      (noImport
        ? i18nImportConfig?.globalFunction || i18nImportConfig?.name
        : i18nImportConfig?.name);

    // 复制 options，仅调整脚本调用名，便于 Planner 产出正确的调用（支持 this.$t 等）
    const adjustedOptions: NormalizedTransformOptions = {
      ...options,
      normalizedI18nConfig: {
        ...options.normalizedI18nConfig,
        i18nImport: {
          ...options.normalizedI18nConfig.i18nImport,
          name:
            translationMethodForScript ||
            options.normalizedI18nConfig.i18nImport.name,
        },
      },
    };

    const transformer = new CoreAstTransformer(new VueAdapter());
    const result = transformer.run(
      code,
      filePath,
      adjustedOptions,
      existingValueToKeyMap
    );

    // 在文本最小替换后，按需注入 useI18n（文本级注入，避免整文件重排）
    const translationMethod =
      adjustedOptions.normalizedI18nConfig.i18nImport.name;
    const hookName = i18nImportConfig.importName;
    const hookImport = i18nImportConfig.source;
    const needsSetup =
      !noImport &&
      // Options API 使用 this.$t 时不注入 hook
      translationMethod !== "this.$t" &&
      (result.extractedStrings.length > 0 ||
        result.usedExistingKeysList.length > 0);

    if (needsSetup) {
      let injected = result.code;
      if (!hasNamedImport(injected, hookImport, hookName)) {
        injected = insertNamedImport(injected, hookImport, hookName);
      }
      if (!hasHookDestructure(injected, translationMethod, hookName)) {
        const hookCallLine = `const { ${translationMethod} } = ${hookName}();`;
        injected = insertHookInSetupOrTop(injected, hookCallLine);
      }
      return { ...result, code: injected };
    }

    return result;
  }
}
