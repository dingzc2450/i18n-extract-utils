/**
 * Vue 框架插件 - 统一走核心最小改动管线
 */

import type {
  FrameworkPlugin,
  ProcessingContext,
  ImportRequirement,
  HookRequirement,
  PrepareSegmentsArgs,
  FrameworkSegmentsPlan,
  ProcessingSegment,
  SegmentProcessingOutput,
  ApplySegmentResultsArgs,
  ProcessingResult,
} from "../core/types";
import type { NormalizedTransformOptions } from "../core/config-normalizer";
import type {
  ExtractedString,
  UsedExistingKey,
  ChangeDetail,
  ExistingValueToKeyMapType,
} from "../types";
import { Framework } from "../types";
import type { ParserOptions } from "@babel/parser";
import {
  hasNamedImport,
  insertNamedImport,
  hasHookDestructure,
  insertHookInSetupOrTop,
} from "../core/text-import-inserter";
import { parseVueFile, assembleVueFile } from "./vue/sfc";
import { processVueTemplate } from "./vue/template-processor";
import { getVueCompilerManager } from "./vue/compiler-manager";

const VUE_SCRIPT_SEGMENT_ID = "vue-sfc-script";

interface VuePlainContext {
  type: "plain";
  translationMethod: string;
  useThisInScript: boolean;
}

interface VueSfcContext {
  type: "sfc";
  descriptor: ReturnType<typeof parseVueFile>;
  translationMethodForTemplate: string;
  translationMethodForScript: string;
  noImport: boolean;
  useThisInScript: boolean;
  scriptLang?: string;
}

type VuePlanContext = VuePlainContext | VueSfcContext;

interface VueSegmentMeta {
  kind: "plain" | "sfc-script";
  templateNeedsHook?: boolean;
  isSetupScript?: boolean;
  scriptAttrs?: string;
  useThisInScript?: boolean;
}

export class VuePlugin implements FrameworkPlugin {
  name = "vue";

  shouldApply(
    _code: string,
    _filePath: string,
    options: NormalizedTransformOptions
  ): boolean {
    return (
      options.normalizedI18nConfig.framework === Framework.Vue ||
      options.normalizedI18nConfig.framework === "vue2" ||
      options.normalizedI18nConfig.framework === "vue3"
    );
  }

  getParserConfig(): ParserOptions {
    return {
      plugins: ["typescript", "jsx"],
    };
  }

  prepareSegments({
    code,
    filePath,
    options,
  }: PrepareSegmentsArgs): FrameworkSegmentsPlan | undefined {
    const i18nImport = options.normalizedI18nConfig.i18nImport;
    const noImport = i18nImport.noImport === true;
    const vueOverrides = i18nImport.vueOverrides || {};

    const translationMethodForTemplate =
      vueOverrides.templateFunction ||
      (noImport ? i18nImport.globalFunction || "$t" : i18nImport.name);

    let translationMethodForScript =
      vueOverrides.scriptFunction ||
      (noImport
        ? i18nImport.globalFunction || i18nImport.name
        : i18nImport.name);

    const useThisInScript = vueOverrides.useThisInScript === true;
    if (useThisInScript) {
      const baseName = translationMethodForScript.replace(/^this\./, "");
      translationMethodForScript = `this.${baseName}`;
    }
    const scriptI18nOverride = {
      ...i18nImport,
      name: translationMethodForScript,
    };

    const isVueSFC =
      filePath.endsWith(".vue") ||
      code.includes("<template>") ||
      code.includes("<script");

    if (!isVueSFC) {
      const segment: ProcessingSegment = {
        id: "vue-plain",
        code,
        filePath,
        optionsOverride: {
          normalizedI18nConfig: {
            framework: options.normalizedI18nConfig.framework,
            i18nImport: scriptI18nOverride,
          },
        },
        meta: {
          kind: "plain",
          useThisInScript,
        } satisfies VueSegmentMeta,
      };

      const context: VuePlainContext = {
        type: "plain",
        translationMethod: translationMethodForScript,
        useThisInScript,
      };

      return {
        segments: [segment],
        pluginContext: context,
      };
    }

    const descriptor = parseVueFile(code);
    const scriptLang = detectScriptLang(descriptor.scriptAttrs);

    const segments: ProcessingSegment[] = [];
    if (descriptor.script) {
      segments.push({
        id: VUE_SCRIPT_SEGMENT_ID,
        code: descriptor.script,
        filePath: buildVirtualScriptPath(filePath, scriptLang),
        optionsOverride: {
          normalizedI18nConfig: {
            framework: options.normalizedI18nConfig.framework,
            i18nImport: scriptI18nOverride,
          },
        },
        skipPreProcess: true,
        skipPostProcess: true,
        meta: {
          kind: "sfc-script",
          isSetupScript: descriptor.isSetupScript,
          scriptAttrs: descriptor.scriptAttrs,
          useThisInScript,
        } satisfies VueSegmentMeta,
      });
    }

    const context: VueSfcContext = {
      type: "sfc",
      descriptor,
      translationMethodForTemplate,
      translationMethodForScript,
      noImport,
      useThisInScript,
      scriptLang,
    };

    return {
      segments,
      pluginContext: context,
    };
  }

  getRequiredImportsAndHooks(
    options: NormalizedTransformOptions,
    context: ProcessingContext
  ): { imports: ImportRequirement[]; hooks: HookRequirement[] } {
    const i18nImport = options.normalizedI18nConfig.i18nImport;
    if (i18nImport.noImport) {
      return { imports: [], hooks: [] };
    }

    const segmentMeta = context.segment?.meta as VueSegmentMeta | undefined;
    if (segmentMeta?.useThisInScript) {
      return { imports: [], hooks: [] };
    }

    const translationMethod = i18nImport.name;
    if (!translationMethod || translationMethod.includes(".")) {
      return { imports: [], hooks: [] };
    }

    const hasReplacements =
      context.result.changes.length > 0 ||
      context.result.extractedStrings.length > 0;

    if (!hasReplacements) {
      return { imports: [], hooks: [] };
    }

    const imports: ImportRequirement[] = [
      {
        source: i18nImport.source,
        specifiers: [{ name: i18nImport.importName }],
        isDefault: false,
      },
    ];

    const hooks: HookRequirement[] = [
      {
        hookName: i18nImport.importName,
        variableName: translationMethod,
        isDestructured: true,
        callExpression: `const { ${translationMethod} } = ${i18nImport.importName}();`,
      },
    ];

    return { imports, hooks };
  }

  applySegmentResults(
    plan: FrameworkSegmentsPlan,
    outputs: SegmentProcessingOutput[],
    args: ApplySegmentResultsArgs
  ): ProcessingResult {
    const context = plan.pluginContext as VuePlanContext | undefined;
    if (!context) {
      return this.buildPassthroughResult(args);
    }

    if (context.type === "plain") {
      const output = outputs[0];
      if (!output) {
        return this.buildPassthroughResult(args);
      }

      const { processingResult } = output;
      const translationMethod = context.translationMethod;
      const needsHook =
        !context.useThisInScript &&
        !translationMethod.includes(".") &&
        !args.options.normalizedI18nConfig.i18nImport.noImport &&
        processingResult.extractedStrings.length > 0;

      let code = processingResult.code;
      if (!context.useThisInScript) {
        code = normalizeTranslationComments(code, translationMethod);
      }

      if (needsHook) {
        code = ensureHookSetup(code, args.options, translationMethod);
      }

      if (context.useThisInScript) {
        code = applyThisAccessor(code, translationMethod);
      }

      code = normalizeTranslationComments(code, translationMethod);

      return {
        ...processingResult,
        code,
      };
    }

    return this.applySfcResults(context, outputs, args);
  }

  private applySfcResults(
    context: VueSfcContext,
    outputs: SegmentProcessingOutput[],
    args: ApplySegmentResultsArgs
  ): ProcessingResult {
    const descriptor = {
      template: context.descriptor.template,
      templateAttrs: context.descriptor.templateAttrs,
      script: context.descriptor.script,
      scriptAttrs: context.descriptor.scriptAttrs,
      style: context.descriptor.style,
      styleAttrs: context.descriptor.styleAttrs,
      isSetupScript: context.descriptor.isSetupScript,
    };

    const extractedStrings: ExtractedString[] = [];
    const usedExistingKeysList: UsedExistingKey[] = [];
    const changes: ChangeDetail[] = [];

    let scriptCode = descriptor.script || "";
    let scriptOutput: SegmentProcessingOutput | undefined;
    for (const output of outputs) {
      extractedStrings.push(...output.processingResult.extractedStrings);
      usedExistingKeysList.push(
        ...output.processingResult.usedExistingKeysList
      );
      changes.push(...output.processingResult.changes);

      if (output.segment.id === VUE_SCRIPT_SEGMENT_ID) {
        scriptCode = output.processingResult.code;
        scriptOutput = output;
      }
    }

    const manager = getVueCompilerManager();
    const existingMap = (args.existingValueToKeyMap ||
      new Map()) as ExistingValueToKeyMapType;
    const generatedKeysMap = new Map<string, string | number>();
    let templateProducedKeys = false;

    try {
      if (descriptor.template) {
        const beforeCount = extractedStrings.length;
        descriptor.template = processVueTemplate(
          descriptor.template,
          context.translationMethodForTemplate,
          extractedStrings,
          usedExistingKeysList,
          args.options,
          existingMap,
          args.filePath,
          generatedKeysMap
        );
        templateProducedKeys = extractedStrings.length > beforeCount;
      }
    } finally {
      manager.endBatch();
    }

    const needsHookFromTemplate =
      templateProducedKeys &&
      !context.noImport &&
      !context.useThisInScript &&
      !context.translationMethodForScript.includes(".") &&
      context.translationMethodForTemplate ===
        args.options.normalizedI18nConfig.i18nImport.name;

    const scriptHasReplacements =
      (scriptOutput?.processingResult.extractedStrings.length ?? 0) > 0;
    const needsHookFromScript =
      scriptHasReplacements &&
      !context.noImport &&
      !context.useThisInScript &&
      !context.translationMethodForScript.includes(".");

    if (scriptCode.trim().length > 0 && !context.useThisInScript) {
      scriptCode = normalizeTranslationComments(
        scriptCode,
        context.translationMethodForScript
      );
    }

    if (needsHookFromTemplate || needsHookFromScript) {
      if (scriptCode.trim().length > 0) {
        scriptCode = ensureHookSetup(
          scriptCode,
          args.options,
          context.translationMethodForScript
        );
      } else {
        scriptCode = createDefaultScriptSetup(
          args.options,
          context.translationMethodForScript
        );
        descriptor.isSetupScript = true;
        descriptor.scriptAttrs = context.scriptLang
          ? ` setup lang="${context.scriptLang}"`
          : " setup";
      }
    }

    if (context.useThisInScript && scriptCode.trim().length > 0) {
      scriptCode = applyThisAccessor(
        scriptCode,
        context.translationMethodForScript
      );
    }
    if (scriptCode.trim().length > 0) {
      scriptCode = normalizeTranslationComments(
        scriptCode,
        context.translationMethodForScript
      );
      descriptor.script = scriptCode;
    }

    const finalCode = assembleVueFile(descriptor);

    return {
      code: finalCode,
      extractedStrings,
      usedExistingKeysList,
      changes,
      framework: args.options.normalizedI18nConfig.framework,
    };
  }

  private buildPassthroughResult(
    args: ApplySegmentResultsArgs
  ): ProcessingResult {
    return {
      code: args.originalCode,
      extractedStrings: [],
      usedExistingKeysList: [],
      changes: [],
      framework: args.options.normalizedI18nConfig.framework,
    };
  }
}

function detectScriptLang(attrs?: string): string | undefined {
  if (!attrs) return undefined;
  const match = attrs.match(/lang\s*=\s*['"]([^'"]+)['"]/i);
  return match ? match[1] : undefined;
}

function buildVirtualScriptPath(filePath: string, lang?: string): string {
  if (!lang) {
    return `${filePath}.script.js`;
  }
  const suffix = lang.toLowerCase();
  return `${filePath}.script.${suffix}`;
}

function ensureHookSetup(
  code: string,
  options: NormalizedTransformOptions,
  translationMethod: string
): string {
  const hookName = options.normalizedI18nConfig.i18nImport.importName;
  const hookSource = options.normalizedI18nConfig.i18nImport.source;

  let updated = code;
  if (!hasNamedImport(updated, hookSource, hookName)) {
    updated = insertNamedImport(updated, hookSource, hookName);
  }
  if (!hasHookDestructure(updated, translationMethod, hookName)) {
    const hookCallLine = `const { ${translationMethod} } = ${hookName}();`;
    updated = insertHookInSetupOrTop(updated, hookCallLine);
  }
  return updated;
}

function createDefaultScriptSetup(
  options: NormalizedTransformOptions,
  translationMethod: string
): string {
  const hookName = options.normalizedI18nConfig.i18nImport.importName;
  const hookSource = options.normalizedI18nConfig.i18nImport.source;
  return `import { ${hookName} } from "${hookSource}";\nconst { ${translationMethod} } = ${hookName}();`;
}

function applyThisAccessor(code: string, translationMethod: string): string {
  if (!translationMethod.startsWith("this.")) {
    return code;
  }
  const baseMethod = translationMethod.replace(/^this\./, "");
  if (!baseMethod) {
    return code;
  }
  const pattern = new RegExp(`(^|[^.\\w$])${escapeRegex(baseMethod)}\\(`, "g");
  return code.replace(pattern, (_match, prefix: string) => {
    return `${prefix}this.${baseMethod}(`;
  });
}

function normalizeTranslationComments(
  code: string,
  _translationMethod?: string
): string {
  return code;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
