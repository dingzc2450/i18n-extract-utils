/**
 * 核心处理器 - 重构后的统一处理逻辑
 * 所有框架都使用这个核心处理器，只是注入不同的插件
 */

import { parse } from "@babel/parser";
import generate from "@babel/generator";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { StringReplacer } from "../string-replacer";
import type { ImportInfo } from "../smart-import-manager";
import { SmartImportManager } from "../smart-import-manager";
import { ASTParserUtils, ImportHookUtils } from "./utils";
import { collectContextAwareReplacementInfo } from "../context-aware-ast-replacer";
import type { NormalizedTransformOptions } from "./config-normalizer";
import {
  normalizeConfig,
  getTranslationMethodName,
  getHookName,
  getImportSource,
} from "./config-normalizer";
import type {
  FrameworkPlugin,
  ProcessingContext,
  ImportRequirement,
  HookRequirement,
  ProcessingResult,
  ExtractionResult,
  ImportChange,
  FrameworkSegmentsPlan,
  ProcessingSegment,
  SegmentProcessingOutput,
  DeepPartial,
} from "./types";
import { ProcessingMode } from "./types";
import type {
  ExistingValueToKeyMapType,
  ExtractedString,
  TransformOptions,
  UsedExistingKey,
} from "../types";
import { Framework } from "../types";

/**
 * 支持的框架枚举
 */
// 删除本地的Framework枚举定义，使用types模块中定义的统一类型

/**
 * 核心处理器类 - 重构版本
 */
export class CoreProcessor {
  private plugins: FrameworkPlugin[] = [];
  private importManager: SmartImportManager = new SmartImportManager();
  constructor() {
    // 插件将在外部注册，不在此处硬编码
  }

  /**
   * 注册框架插件
   */
  registerPlugin(plugin: FrameworkPlugin): void {
    this.plugins.push(plugin);
  }
  /***
   * 格式化配置
   */
  normalizeConfig(
    options: TransformOptions = {},
    code: string,
    filePath: string = ""
  ): NormalizedTransformOptions {
    return normalizeConfig(options, code, filePath);
  }
  /**
   * 处理代码的主入口
   */
  processCode(
    code: string,
    filePath: string,
    options: TransformOptions,
    existingValueToKeyMap?: ExistingValueToKeyMapType
  ): ProcessingResult {
    const normalizedOptions = this.normalizeConfig(options, code, filePath);
    const plugin = this.selectPlugin(code, filePath, normalizedOptions);

    const plan = plugin.prepareSegments
      ? plugin.prepareSegments({
          code,
          filePath,
          options: normalizedOptions,
          existingValueToKeyMap,
        })
      : undefined;

    if (plan) {
      return this.processSegmentPlan(
        plan,
        plugin,
        normalizedOptions,
        code,
        filePath,
        existingValueToKeyMap
      );
    }

    const pipelineOutput = this.runSinglePipeline({
      code,
      filePath,
      plugin,
      normalizedOptions,
      existingValueToKeyMap,
    });

    return pipelineOutput.processingResult;
  }

  private processSegmentPlan(
    plan: FrameworkSegmentsPlan,
    plugin: FrameworkPlugin,
    normalizedOptions: NormalizedTransformOptions,
    originalCode: string,
    filePath: string,
    existingValueToKeyMap?: ExistingValueToKeyMapType
  ): ProcessingResult {
    const outputs: SegmentProcessingOutput[] = [];
    const sharedMap: ExistingValueToKeyMapType | undefined =
      existingValueToKeyMap ?? new Map();
    for (const segment of plan.segments) {
      const segmentOptions = this.applyOptionsOverride(
        normalizedOptions,
        segment.optionsOverride
      );
      const mapForSegment = segment.existingValueToKeyMap ?? sharedMap;
      const pipelineOutput = this.runSinglePipeline({
        code: segment.code,
        filePath: segment.filePath || filePath,
        plugin,
        normalizedOptions: segmentOptions,
        existingValueToKeyMap: mapForSegment,
        forceProcess: segment.forceProcess,
        skipPreProcess: segment.skipPreProcess,
        skipPostProcess: segment.skipPostProcess,
        segment,
      });

      outputs.push({
        segment,
        processingResult: pipelineOutput.processingResult,
        extractionResult: pipelineOutput.extractionResult,
      });
    }

    if (plugin.applySegmentResults) {
      return plugin.applySegmentResults(plan, outputs, {
        originalCode,
        filePath,
        options: normalizedOptions,
        existingValueToKeyMap: sharedMap,
      });
    }

    if (outputs.length === 1) {
      return outputs[0].processingResult;
    }

    throw new Error(
      "Segmented processing requires applySegmentResults implementation on the plugin."
    );
  }

  private runSinglePipeline(args: {
    code: string;
    filePath: string;
    plugin: FrameworkPlugin;
    normalizedOptions: NormalizedTransformOptions;
    existingValueToKeyMap?: ExistingValueToKeyMapType;
    forceProcess?: boolean;
    skipPreProcess?: boolean;
    skipPostProcess?: boolean;
    segment?: ProcessingSegment;
  }): {
    processingResult: ProcessingResult;
    extractionResult: ExtractionResult;
  } {
    const {
      code,
      filePath,
      plugin,
      normalizedOptions,
      existingValueToKeyMap,
      forceProcess = false,
      skipPreProcess = false,
      skipPostProcess = false,
      segment,
    } = args;

    const mode = this.determineProcessingMode(normalizedOptions);

    if (
      !forceProcess &&
      !this.hasTranslatableContent(code, normalizedOptions)
    ) {
      const emptyResult: ExtractionResult = {
        extractedStrings: [],
        usedExistingKeysList: [],
        changes: [],
        modified: false,
        requiredImports: new Set<string>(),
      };

      return {
        processingResult: {
          code,
          extractedStrings: [],
          usedExistingKeysList: [],
          changes: [],
          framework: normalizedOptions.normalizedI18nConfig.framework,
        },
        extractionResult: emptyResult,
      };
    }

    const processedCode =
      skipPreProcess || !plugin.preProcess
        ? code
        : plugin.preProcess(code, normalizedOptions);

    const parserConfig = this.getParserConfig(
      plugin,
      filePath,
      normalizedOptions
    );
    const ast = parse(processedCode, parserConfig);

    this.importManager.init(
      normalizedOptions.normalizedI18nConfig.i18nImport,
      normalizedOptions.normalizedI18nConfig.nonReactConfig
    );

    const extractionResult = this.extractAndReplace(
      ast,
      processedCode,
      mode,
      normalizedOptions,
      existingValueToKeyMap || new Map(),
      filePath
    );

    let modifiedCode =
      extractionResult.changes.length > 0
        ? StringReplacer.applyChanges(processedCode, extractionResult.changes)
        : processedCode;

    const context: ProcessingContext = {
      filePath,
      originalCode: code,
      hasModifications:
        extractionResult.modified ||
        extractionResult.changes.length > 0 ||
        forceProcess,
      result: extractionResult,
      requiredImports: extractionResult.requiredImports,
      detectedFramework: plugin.name,
      segment,
    };

    modifiedCode = this.processImportsAndHooks(
      modifiedCode,
      normalizedOptions,
      context,
      plugin
    );

    if (!skipPostProcess && plugin.postProcess) {
      modifiedCode = plugin.postProcess(
        modifiedCode,
        normalizedOptions,
        context
      );
    }

    return {
      processingResult: {
        code: modifiedCode,
        extractedStrings: extractionResult.extractedStrings,
        usedExistingKeysList: extractionResult.usedExistingKeysList,
        changes: extractionResult.changes,
        framework: normalizedOptions.normalizedI18nConfig.framework,
      },
      extractionResult,
    };
  }

  private applyOptionsOverride(
    base: NormalizedTransformOptions,
    override?: DeepPartial<NormalizedTransformOptions>
  ): NormalizedTransformOptions {
    if (!override) {
      return base;
    }

    const cloned = this.cloneNormalizedOptions(base);
    this.assignDeep(
      cloned as unknown as Record<string, unknown>,
      override as unknown as Record<string, unknown>
    );
    return cloned;
  }

  private cloneNormalizedOptions(
    options: NormalizedTransformOptions
  ): NormalizedTransformOptions {
    return {
      ...options,
      importConflict: { ...options.importConflict },
      parserOptions: {
        ...options.parserOptions,
        plugins: [...options.parserOptions.plugins],
      },
      normalizedI18nConfig: {
        ...options.normalizedI18nConfig,
        i18nImport: {
          ...options.normalizedI18nConfig.i18nImport,
          vueOverrides: options.normalizedI18nConfig.i18nImport.vueOverrides
            ? { ...options.normalizedI18nConfig.i18nImport.vueOverrides }
            : options.normalizedI18nConfig.i18nImport.vueOverrides,
        },
        nonReactConfig: options.normalizedI18nConfig.nonReactConfig
          ? { ...options.normalizedI18nConfig.nonReactConfig }
          : options.normalizedI18nConfig.nonReactConfig,
      },
    };
  }

  private assignDeep(
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ): void {
    for (const key of Object.keys(source)) {
      const value = source[key];
      if (value === undefined) continue;

      const current = target[key];
      if (this.isPlainObject(current) && this.isPlainObject(value)) {
        this.assignDeep(
          current as Record<string, unknown>,
          value as Record<string, unknown>
        );
      } else if (Array.isArray(value)) {
        target[key] = [...value];
      } else {
        target[key] = value;
      }
    }
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  /**
   * 快速检查代码中是否包含疑似待翻译的内容
   * 使用正则表达式进行简单判断
   */
  private hasTranslatableContent(
    code: string,
    normalizedOptions: NormalizedTransformOptions
  ): boolean {
    // 使用配置中的pattern创建正则表达式
    const patternRegex = new RegExp(normalizedOptions.pattern);

    // 检查代码中是否匹配pattern
    return patternRegex.test(code);
  }

  /**
   * 确定处理模式
   * 暂时只支持 CONTEXT_AWARE   其余模式不支持
   */
  private determineProcessingMode(
    options: NormalizedTransformOptions
  ): ProcessingMode {
    // 如果用户明确指定了字符串替换模式
    if (
      options.preserveFormatting === true ||
      options.normalizedI18nConfig.nonReactConfig
    ) {
      return ProcessingMode.CONTEXT_AWARE;
    }
    // 如果用户明确指定了AST转换模式
    if (options.useASTTransform === true) {
      throw new Error("AST转换模式暂不支持");
    }

    // 默认使用上下文感知模式
    return ProcessingMode.CONTEXT_AWARE;
  }

  /**
   * 获取默认插件
   */
  private getDefaultPlugin(
    options: NormalizedTransformOptions
  ): FrameworkPlugin {
    // 检查是否是React15框架
    const isReact15 = options.normalizedI18nConfig.framework === "react15";

    return {
      name: isReact15 ? "default-react15" : "default-react",
      shouldApply: () => true,
      getRequiredImportsAndHooks: (
        pluginOptions: NormalizedTransformOptions,
        context
      ) => {
        // 没有提取字符串时不需要导入
        if (context.result.changes.length === 0) {
          return { imports: [], hooks: [] };
        }

        // 使用规范化的配置获取值
        const hookName = getHookName(pluginOptions);
        const hookSource = getImportSource(pluginOptions);
        const translationMethod = getTranslationMethodName(pluginOptions);

        // 检查是否是React15框架
        const isReact15 =
          pluginOptions.normalizedI18nConfig.framework === Framework.React15;

        if (isReact15) {
          // React15处理逻辑：直接导入函数，不使用hooks
          const imports: ImportRequirement[] = [
            {
              source: hookSource,
              specifiers: [{ name: translationMethod }],
              isDefault: false,
            },
          ];

          // React15不需要hooks
          const hooks: HookRequirement[] = [];

          return { imports, hooks };
        }

        // 默认React处理逻辑：使用hooks
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
            variableName:
              translationMethod === "default" ? "t" : translationMethod,
            isDestructured: translationMethod !== "default",
            callExpression:
              translationMethod === "default"
                ? `const t = ${hookName}();`
                : `const { ${translationMethod} } = ${hookName}();`,
          },
        ];

        return { imports, hooks };
      },
    };
  }

  /**
   * 选择合适的插件
   */
  private selectPlugin(
    code: string,
    filePath: string,
    options: NormalizedTransformOptions
  ): FrameworkPlugin {
    // 按优先级查找合适的插件
    for (const plugin of this.plugins) {
      if (plugin.shouldApply(code, filePath, options)) {
        return plugin;
      }
    }

    // 如果没有找到合适的插件，返回默认React插件
    return this.getDefaultPlugin(options);
  }

  /**
   * 获取解析器配置
   */
  private getParserConfig(
    plugin: FrameworkPlugin,
    filePath: string,
    options?: NormalizedTransformOptions
  ): object {
    // 如果有规范化的选项，使用支持用户自定义插件的方法
    if (options) {
      const pluginConfig = plugin.getParserConfig?.() || {};
      return ASTParserUtils.getParserConfigFromOptions(
        filePath,
        options,
        pluginConfig.plugins || []
      );
    }

    // 向后兼容：使用原始方法
    const defaultConfig = ASTParserUtils.getParserConfig(filePath);
    const pluginConfig = plugin.getParserConfig?.() || {};

    return {
      ...defaultConfig,
      ...pluginConfig,
      plugins: [
        ...(defaultConfig.plugins || []),
        ...(pluginConfig.plugins || []),
      ],
    };
  }

  /**
   * 提取和替换逻辑
   */
  private extractAndReplace(
    ast: t.File,
    code: string,
    mode: ProcessingMode,
    options: NormalizedTransformOptions,
    existingValueToKeyMap: ExistingValueToKeyMapType,
    filePath: string
  ): ExtractionResult {
    const extractedStrings: ExtractedString[] = [];
    const usedExistingKeysList: UsedExistingKey[] = [];

    if (mode === ProcessingMode.CONTEXT_AWARE) {
      // 使用上下文感知模式 - 暂时保持使用原有的方法，后续可以迁移到新的extractor

      const result = collectContextAwareReplacementInfo(
        ast,
        code,
        existingValueToKeyMap,
        extractedStrings,
        usedExistingKeysList,
        this.importManager,
        options,
        filePath
      );

      return {
        extractedStrings,
        usedExistingKeysList,
        changes: result.changes,
        modified: result.modified,
        requiredImports: result.requiredImports,
      };
    }

    console.error("Unknown processing mode:", mode);
    return {
      extractedStrings: [],
      usedExistingKeysList: [],
      changes: [],
      modified: false,
    };
  }

  /**
   * 统一处理导入和hook调用的通用方法
   */
  private processImportsAndHooks(
    code: string,
    options: NormalizedTransformOptions,
    context: ProcessingContext,
    plugin: FrameworkPlugin
  ): string {
    let modifiedCode = code;

    // 检查是否有自定义导入
    const customImport = options.normalizedI18nConfig.i18nImport.custom;
    const noImportFlag = options.normalizedI18nConfig.i18nImport.noImport;
    if (customImport && context.result.changes.length > 0) {
      if (noImportFlag) {
        // 用户明确要求不自动注入 import，跳过自定义导入注入并输出警告
        if (process && process.env && process.env.NODE_ENV !== "test") {
          console.warn(
            "i18nImport.noImport is true: skipping automatic insertion of custom import."
          );
        }
      } else {
        // 插入自定义导入并添加hook调用
        modifiedCode = this.addCustomImportWithHook(
          modifiedCode,
          customImport,
          options
        );
        return modifiedCode;
      }
    }

    // 先统一处理 判断是否有导入需求
    // 优先处理插件定义的导入和hook需求（统一格式）
    if (plugin.getRequiredImportsAndHooks) {
      // 如果用户配置了 noImport，跳过所有自动导入/Hook插入
      if (noImportFlag) {
        // 直接跳过插件层的导入插入
      } else {
        const requirements = plugin.getRequiredImportsAndHooks(
          options,
          context
        );
        if (requirements.imports.length > 0 || requirements.hooks.length > 0) {
          modifiedCode = this.addImportsAndHooks(
            modifiedCode,
            requirements.imports,
            requirements.hooks,
            context.filePath,
            options // Pass options down
          );
          return modifiedCode; // 使用新的统一格式，跳过老的逻辑
        }
      }
    }

    // 回退到处理上下文感知的导入（老格式）
    if (context.requiredImports && context.requiredImports.size > 0) {
      modifiedCode = this.addContextAwareImportsLegacy(
        modifiedCode,
        context.requiredImports
      );
    }

    return modifiedCode;
  }

  /**
   * 统一处理导入和hook插入
   */
  private addImportsAndHooks(
    code: string,
    importRequirements: ImportRequirement[],
    hookRequirements: HookRequirement[],
    filePath: string = "",
    options: NormalizedTransformOptions = {} as NormalizedTransformOptions
  ): string {
    if (importRequirements.length === 0 && hookRequirements.length === 0) {
      return code;
    }

    try {
      let modifiedCode = code;

      // 从规范化配置中获取 mergeImports，默认为 true
      const mergeImports = this.getMergeImports(options);

      // 处理导入
      if (importRequirements.length > 0) {
        if (mergeImports) {
          modifiedCode = this.addOrMergeImports(
            modifiedCode,
            importRequirements,
            filePath,
            options // 传递完整的规范化选项以支持用户自定义插件
          );
        } else {
          // 旧的、非合并的添加逻辑
          for (const importReq of importRequirements) {
            const importStatement =
              ImportHookUtils.generateImportStatement(importReq);
            // 修复：应该检查 modifiedCode，而不是原始的 code
            if (!modifiedCode.includes(importStatement)) {
              modifiedCode = this.addImportToCode(
                modifiedCode,
                importStatement
              );
            }
          }
        }
      }

      // 处理 Hook 调用
      if (hookRequirements.length > 0) {
        for (const hookReq of hookRequirements) {
          modifiedCode = this.addHookCallToCode(modifiedCode, hookReq);
        }
      }

      return modifiedCode;
    } catch (error) {
      console.warn("Failed to add imports and hooks:", error);
      return code;
    }
  }

  /**
   * 获取mergeImports配置值
   * @param options 转换选项
   * @returns mergeImports的布尔值
   */
  private getMergeImports(
    options: Pick<NormalizedTransformOptions, "normalizedI18nConfig">
  ): boolean {
    // 优先使用新配置格式
    if (options.normalizedI18nConfig.i18nImport.mergeImports !== undefined) {
      return options.normalizedI18nConfig.i18nImport.mergeImports !== false;
    }

    // 默认值
    return true;
  }

  /**
   * 使用AST分析来合并或添加导入，然后通过字符串操作应用变更。
   */
  private addOrMergeImports(
    code: string,
    importRequirements: ImportRequirement[],
    filePath: string,
    options?: NormalizedTransformOptions
  ): string {
    const parserConfig = options
      ? ASTParserUtils.getParserConfigFromOptions(filePath, options)
      : ASTParserUtils.getParserConfig(filePath);
    const ast = parse(code, {
      ...parserConfig,
      sourceFilename: filePath,
      ranges: true,
    });

    // 获取导入冲突配置
    const conflictConfig = options?.importConflict;

    const changes: ImportChange[] = [];
    const existingImports = new Map<
      string,
      { node: t.ImportDeclaration; specifiers: Set<string> }
    >();
    let lastImportEndPos = 0;

    // 1. 分析现有导入，同时收集按名称索引的导入
    const importsByName = new Map<
      string,
      Array<{
        source: string;
        node: t.ImportDeclaration;
        specifier: t.ImportSpecifier | t.ImportDefaultSpecifier;
      }>
    >();

    traverse(ast, {
      ImportDeclaration: path => {
        const node = path.node;
        const source = node.source.value;

        if (!existingImports.has(source)) {
          existingImports.set(source, { node, specifiers: new Set() });
        }

        const existing = existingImports.get(source)!;
        node.specifiers.forEach(spec => {
          if (t.isImportSpecifier(spec)) {
            const importedName =
              spec.imported.type === "Identifier"
                ? spec.imported.name
                : spec.imported.value;
            existing.specifiers.add(importedName);

            // 按名称收集导入
            if (!importsByName.has(importedName)) {
              importsByName.set(importedName, []);
            }
            importsByName.get(importedName)!.push({
              source,
              node,
              specifier: spec,
            });
          } else if (t.isImportDefaultSpecifier(spec)) {
            existing.specifiers.add("default");
            // 记录默认导入
            const name = spec.local.name;
            if (!importsByName.has(name)) {
              importsByName.set(name, []);
            }
            importsByName.get(name)!.push({
              source,
              node,
              specifier: spec,
            });
          } else if (t.isImportNamespaceSpecifier(spec)) {
            existing.specifiers.add("*");
          }
        });

        if (node.end) {
          lastImportEndPos = Math.max(lastImportEndPos, node.end);
        }
      },
    });

    // 2. 计算变更集
    for (const req of importRequirements) {
      // 检查每个需要导入的标识符是否已存在
      const conflictStrategy = conflictConfig?.conflictStrategy || "skip";
      const enableWarnings = conflictConfig?.enableWarnings ?? true;

      if (!req.isDefault) {
        // 处理命名导入
        for (const spec of req.specifiers) {
          const existingImports = importsByName.get(spec.name) || [];
          const hasConflict = existingImports.some(
            imp => imp.source !== req.source
          );

          if (hasConflict) {
            if (enableWarnings) {
              console.warn(
                `Warning: Found conflicting import for '${spec.name}'.\n` +
                  `Current import sources: ${existingImports.map(i => i.source).join(", ")}\n` +
                  `Attempting to import from: ${req.source}`
              );
            }

            if (conflictStrategy === "override") {
              // 移除所有已存在的同名导入
              for (const imp of existingImports) {
                const node = imp.node;
                const updatedSpecifiers = node.specifiers.filter(s => {
                  if (t.isImportSpecifier(s)) {
                    return s.imported.type === "Identifier"
                      ? s.imported.name !== spec.name
                      : s.imported.value !== spec.name;
                  }
                  return true;
                });

                if (updatedSpecifiers.length !== node.specifiers.length) {
                  if (updatedSpecifiers.length === 0) {
                    changes.push({
                      type: "replace",
                      start: node.start!,
                      end: node.end!,
                      text: "",
                    });
                  } else {
                    const updatedNode = t.importDeclaration(
                      updatedSpecifiers,
                      node.source
                    );
                    const { code: newImportCode } = generate(updatedNode);
                    changes.push({
                      type: "replace",
                      start: node.start!,
                      end: node.end!,
                      text: newImportCode,
                    });
                  }
                }
              }
            }
          }
        }
      }

      // 处理导入
      const existing = existingImports.get(req.source);
      if (existing) {
        // 已存在相同源，尝试合并
        const { node, specifiers } = existing;
        const newNamedSpecifiers: t.ImportSpecifier[] = [];
        let newDefaultSpecifier: t.ImportDefaultSpecifier | null = null;

        if (req.isDefault) {
          if (!specifiers.has("default")) {
            newDefaultSpecifier = t.importDefaultSpecifier(
              t.identifier(req.specifiers[0].name)
            );
            specifiers.add("default");
          }
        } else {
          (req.specifiers || []).forEach(spec => {
            if (!specifiers.has(spec.name)) {
              newNamedSpecifiers.push(
                t.importSpecifier(
                  t.identifier(spec.name),
                  t.identifier(spec.name)
                )
              );
              specifiers.add(spec.name);
            }
          });
        }

        if (newNamedSpecifiers.length > 0 || newDefaultSpecifier) {
          const updatedNode = t.cloneNode(node);
          if (newDefaultSpecifier) {
            updatedNode.specifiers.unshift(newDefaultSpecifier);
          }
          updatedNode.specifiers.push(...newNamedSpecifiers);

          const { code: newImportCode } = generate(updatedNode);

          changes.push({
            type: "replace",
            start: node.start!,
            end: node.end!,
            text: newImportCode,
          });
        }
      } else {
        // 不存在相同源，添加新导入
        const newSpecifiers: Array<
          t.ImportSpecifier | t.ImportDefaultSpecifier
        > = [];
        if (req.isDefault) {
          newSpecifiers.push(
            t.importDefaultSpecifier(t.identifier(req.specifiers[0].name))
          );
        } else {
          (req.specifiers || []).forEach(s => {
            newSpecifiers.push(
              t.importSpecifier(t.identifier(s.name), t.identifier(s.name))
            );
          });
        }

        const newImportNode = t.importDeclaration(
          newSpecifiers,
          t.stringLiteral(req.source)
        );
        const { code: newImportCode } = generate(newImportNode);

        const insertPos =
          lastImportEndPos > 0 ? code.indexOf("\n", lastImportEndPos) + 1 : 0;

        changes.push({
          type: "insert",
          start: insertPos,
          end: insertPos,
          insertPosition: insertPos,
          text: newImportCode + "\n",
        });

        // 更新信息以便后续的新导入可以基于此进行
        lastImportEndPos += newImportCode.length + 1;
        const newSpecifierNames = new Set<string>();
        if (req.isDefault) {
          newSpecifierNames.add("default");
        } else {
          (req.specifiers || []).forEach(s => newSpecifierNames.add(s.name));
        }
        existingImports.set(req.source, {
          node: newImportNode,
          specifiers: newSpecifierNames,
        });
      }
    }

    // 3. 应用变更
    if (changes.length > 0) {
      return StringReplacer.applyImportChanges(code, changes);
    }

    return code;
  }

  /**
   * 添加上下文感知的导入（从原CoreProcessor移植的遗留方法）
   */
  private addContextAwareImportsLegacy(
    code: string,
    requiredImports: Set<string>
  ): string {
    if (requiredImports.size === 0) {
      return code;
    }

    try {
      let modifiedCode = code;
      const addedImports = new Set<string>();

      for (const importInfoStr of requiredImports) {
        const parsedImport = this.importManager.parseImport(importInfoStr);

        // 如果该导入信息标记为 noImport（用户希望不自动注入 import），则跳过
        if (parsedImport.noImport) {
          // 标记为已处理以避免重复检查
          continue;
        }

        // 根据导入类型创建唯一标识符
        const importKey =
          parsedImport.needsHook && parsedImport.hookImport
            ? `${parsedImport.hookImport.importName}-${parsedImport.hookImport.source}`
            : `${parsedImport.callName}-${parsedImport.importStatement}`;

        // 检查是否已经添加过相同的导入
        if (addedImports.has(importKey)) {
          continue;
        }

        // 检查代码中是否已经存在 import
        if (!this.hasExistingImportLegacy(modifiedCode, parsedImport)) {
          modifiedCode = this.addImportStatementLegacy(
            modifiedCode,
            parsedImport
          );
          addedImports.add(importKey);
        }

        // 如果需要 Hook 调用，添加 Hook 调用
        if (parsedImport.needsHook && parsedImport.hookImport) {
          modifiedCode = this.addHookCallIfNeededLegacy(
            modifiedCode,
            parsedImport.hookImport
          );
        }
      }

      return modifiedCode;
    } catch (error) {
      console.warn("Failed to add context-aware imports:", error);
      return code;
    }
  }

  /**
   * 检查是否已存在导入（遗留方法）
   */
  private hasExistingImportLegacy(
    code: string,
    importInfo: ImportInfo
  ): boolean {
    if (importInfo.needsHook && importInfo.hookImport) {
      // 检查 Hook 导入
      const hookPattern = new RegExp(
        `import\\s+.*\\b${this.escapeRegex(
          importInfo.hookImport.importName
        )}\\b.*from\\s+['"]${this.escapeRegex(
          importInfo.hookImport.source
        )}['"]`
      );
      return hookPattern.test(code);
    } else {
      // 检查普通导入 - 使用导入语句直接匹配
      const normalizedStatement = importInfo.importStatement
        .replace(/\s+/g, " ")
        .trim();

      // 从 import 语句中提取关键信息进行更精确的匹配
      const sourceMatch = normalizedStatement.match(/from\s+['"]([^'"]+)['"]/);
      const nameMatch = normalizedStatement.match(
        /import\s+(?:\{[^}]*\b(\w+)\b[^}]*\}|(\w+))/
      );

      if (sourceMatch && nameMatch) {
        const source = sourceMatch[1];
        const name = nameMatch[1] || nameMatch[2]; // 命名导入 或 默认导入

        const pattern = new RegExp(
          `import\\s+.*\\b${this.escapeRegex(
            name
          )}\\b.*from\\s+['"]${this.escapeRegex(source)}['"]`
        );
        return pattern.test(code);
      }

      // 回退检查：检查是否包含类似的导入语句
      return code.includes(normalizedStatement);
    }
  }

  /**
   * 添加导入到代码中
   */
  private addImportToCode(code: string, importStatement: string): string {
    const lines = code.split("\n");
    let insertIndex = 0;

    // 查找最后一个导入的位置
    let lastImportIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("import ")) {
        lastImportIndex = i;
      } else if (
        line &&
        !line.startsWith("//") &&
        !line.startsWith("/*") &&
        !line.startsWith('"use') &&
        !line.startsWith("'use")
      ) {
        break;
      }
    }

    if (lastImportIndex !== -1) {
      insertIndex = lastImportIndex + 1;
    }

    lines.splice(insertIndex, 0, importStatement);
    return lines.join("\n");
  }

  /**
   * 添加导入语句（遗留方法）
   */
  private addImportStatementLegacy(
    code: string,
    importInfo: ImportInfo
  ): string {
    const importStatement = importInfo.importStatement;

    // 这里可以使用简单的字符串插入，因为是上下文感知导入的fallback
    const lines = code.split("\n");
    let insertIndex = 0;

    // 简单查找最后一个导入位置
    let lastImportIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("import ")) {
        lastImportIndex = i;
      } else if (line && !line.startsWith("//") && !line.startsWith("/*")) {
        break;
      }
    }

    if (lastImportIndex !== -1) {
      insertIndex = lastImportIndex + 1;
    }

    lines.splice(insertIndex, 0, importStatement);
    return lines.join("\n");
  }

  /**
   * 检查是否已存在Hook调用
   */
  private hasExistingHookCall(code: string, hookReq: HookRequirement): boolean {
    // 检查是否包含具体的hook调用表达式
    if (code.includes(hookReq.callExpression)) {
      return true;
    }

    // 检查是否包含hook函数调用（更宽泛的检查）
    if (code.includes(`${hookReq.hookName}()`)) {
      return true;
    }

    // 检查是否有类似的解构赋值（针对解构的情况）
    if (hookReq.isDestructured && hookReq.variableName) {
      const destructPattern = new RegExp(
        `const\\s*\\{[^}]*\\b${hookReq.variableName}\\b[^}]*\\}\\s*=\\s*${hookReq.hookName}\\s*\\(`
      );
      if (destructPattern.test(code)) {
        return true;
      }
    }

    // 检查是否有直接赋值（针对非解构的情况）
    if (!hookReq.isDestructured && hookReq.variableName) {
      const directPattern = new RegExp(
        `const\\s+${hookReq.variableName}\\s*=\\s*${hookReq.hookName}\\s*\\(`
      );
      if (directPattern.test(code)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 添加Hook调用到代码中
   */
  private addHookCallToCode(code: string, hookReq: HookRequirement): string {
    let modifiedCode = code;

    // 处理所有函数，支持React组件和自定义Hook
    // 1. 查找React组件函数 - 修改正则表达式以匹配任意缩进
    modifiedCode = this.addHookToFunctions(
      modifiedCode,
      hookReq,
      /^(\s*)(export\s+)?(default\s+)?function\s+([A-Z][a-zA-Z0-9]*)\s*\([^)]*\)\s*\{/gm,
      false // 不是自定义Hook
    );

    // 2. 查找React组件箭头函数（不带类型标注）
    modifiedCode = this.addHookToFunctions(
      modifiedCode,
      hookReq,
      /^(\s*)(export\s+)?(default\s+)?const\s+([A-Z][a-zA-Z0-9]*)\s*=\s*\([^)]*\)\s*=>\s*\{/gm,
      false // 不是自定义Hook
    );

    // 2.1. 查找React组件箭头函数（带TypeScript类型标注）
    modifiedCode = this.addHookToFunctions(
      modifiedCode,
      hookReq,
      /^(\s*)(export\s+)?(default\s+)?const\s+([A-Z][a-zA-Z0-9]*)\s*:\s*[^=]+\s*=\s*\([^)]*\)\s*=>\s*\{/gm,
      false // 不是自定义Hook
    );

    // 3. 查找自定义Hook函数
    modifiedCode = this.addHookToFunctions(
      modifiedCode,
      hookReq,
      /^(\s*)(export\s+)?(default\s+)?function\s+(use[A-Z][a-zA-Z0-9]*)\s*\([^)]*\)\s*\{/gm,
      true // 是自定义Hook
    );

    // 4. 查找自定义Hook箭头函数（不带类型标注）
    modifiedCode = this.addHookToFunctions(
      modifiedCode,
      hookReq,
      /^(\s*)(export\s+)?(default\s+)?const\s+(use[A-Z][a-zA-Z0-9]*)\s*=\s*\([^)]*\)\s*=>\s*\{/gm,
      true // 是自定义Hook
    );

    // 4.1. 查找自定义Hook箭头函数（带TypeScript类型标注）
    modifiedCode = this.addHookToFunctions(
      modifiedCode,
      hookReq,
      /^(\s*)(export\s+)?(default\s+)?const\s+(use[A-Z][a-zA-Z0-9]*)\s*:\s*[^=]+\s*=\s*\([^)]*\)\s*=>\s*\{/gm,
      true // 是自定义Hook
    );

    return modifiedCode;
  }

  /**
   * 为匹配指定模式的函数添加Hook调用
   */
  private addHookToFunctions(
    code: string,
    hookReq: HookRequirement,
    pattern: RegExp,
    isCustomHook: boolean
  ): string {
    const matches = Array.from(code.matchAll(pattern));
    let modifiedCode = code;
    let totalOffset = 0;

    // 倒序处理避免位置偏移问题
    matches.reverse().forEach(match => {
      const indent = match[1];
      const openBracePos = (match.index || 0) + match[0].length;

      // 检查这个特定函数是否已经有Hook调用
      const functionStart = match.index || 0;
      const functionEnd = this.findFunctionEnd(modifiedCode, openBracePos);
      const functionContent = modifiedCode.slice(functionStart, functionEnd);

      // 使用改进的hook检查逻辑
      if (this.hasExistingHookCall(functionContent, hookReq)) {
        return; // 这个函数已经有Hook调用了
      }

      // 对于React组件，需要检查是否返回JSX且包含翻译调用
      if (!isCustomHook) {
        const hasJSX =
          functionContent.includes("<") && functionContent.includes(">");
        // 更宽泛的翻译函数检查，支持 t() 和 t.xxx() 模式
        const hasTCall =
          functionContent.includes(`${hookReq.variableName}(`) ||
          functionContent.includes(`${hookReq.variableName}.`);

        if (!hasJSX || !hasTCall) {
          return; // 不是React组件或者没有使用翻译函数
        }
      }

      // 对于自定义Hook，检查是否有t()调用
      if (isCustomHook) {
        // 更宽泛的翻译函数检查，支持 t() 和 t.xxx() 模式
        const hasCall =
          functionContent.includes(`${hookReq.variableName}(`) ||
          functionContent.includes(`${hookReq.variableName}.`);

        if (!hasCall) {
          return; // 自定义Hook没有使用翻译函数，跳过
        }
      }

      // 插入Hook调用
      const hookCallLine = "\n" + indent + "  " + hookReq.callExpression;
      const insertPosition = openBracePos + totalOffset;

      modifiedCode =
        modifiedCode.slice(0, insertPosition) +
        hookCallLine +
        modifiedCode.slice(insertPosition);

      totalOffset += hookCallLine.length;
    });

    return modifiedCode;
  }

  /**
   * 找到函数的结束位置
   */
  private findFunctionEnd(code: string, openBracePos: number): number {
    let braceCount = 1;
    let pos = openBracePos;

    while (pos < code.length && braceCount > 0) {
      pos++;
      if (code[pos] === "{") {
        braceCount++;
      } else if (code[pos] === "}") {
        braceCount--;
      }
    }

    return pos + 1;
  }
  /**
   * 添加 Hook 调用（遗留方法）
   */
  private addHookCallIfNeededLegacy(
    code: string,
    hookInfo: NonNullable<ImportInfo["hookImport"]>
  ): string {
    const hookCall = hookInfo.hookCall;

    // 检查是否已经存在 Hook 调用
    if (code.includes(hookCall)) {
      return code;
    }

    // 简单的组件检测和hook添加
    const functionComponentPattern =
      /^(\s*)(export\s+)?(default\s+)?function\s+([A-Z][a-zA-Z0-9]*)\s*\([^)]*\)\s*\{/gm;
    const match = functionComponentPattern.exec(code);
    if (match) {
      const indent = match[1];
      const insertIndex = match.index + match[0].length;
      return (
        code.slice(0, insertIndex) +
        "\n" +
        indent +
        "  " +
        hookCall +
        "\n" +
        code.slice(insertIndex)
      );
    }

    return code;
  }

  /**
   * 添加自定义导入并处理hook调用
   */
  private addCustomImportWithHook(
    code: string,
    customImport: string,
    options: NormalizedTransformOptions
  ): string {
    // 首先插入自定义导入（处理冲突）
    let modifiedCode = this.addCustomImport(code, customImport);

    // 分析自定义导入中的hook名称和翻译方法名称
    const hookName = this.extractHookNameFromCustomImport(customImport);
    const translationMethod = options.normalizedI18nConfig.i18nImport.name;

    // 添加hook调用
    const hookRequirement: HookRequirement = {
      hookName,
      variableName: translationMethod,
      isDestructured: true, // 自定义导入通常使用解构
      callExpression: `const { ${translationMethod} } = ${hookName}();`,
    };

    modifiedCode = this.addHookCallToCode(modifiedCode, hookRequirement);
    return modifiedCode;
  }

  /**
   * 从自定义导入中提取hook名称
   */
  private extractHookNameFromCustomImport(customImport: string): string {
    // 匹配 import { something as hookName } from "source" 或 import { hookName } from "source"
    const importMatch = customImport.match(
      /import\s*\{[^}]*\}\s*from\s+['"][^'"]+['"]/
    );
    if (importMatch) {
      const specifiersMatch = customImport.match(/import\s*\{([^}]*)\}/);
      if (specifiersMatch) {
        const specifiers = specifiersMatch[1];

        // 查找别名为 useTranslation 的导入
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
    }

    // 回退到默认的hook名称
    return "useTranslation";
  }

  /**
   * 添加自定义导入
   */
  private addCustomImport(code: string, customImport: string): string {
    // 获取自定义导入中的导入名称，用于冲突检测
    const importMatch = customImport.match(
      /import\s*\{[^}]*\}\s*from\s+['"]([^'"]+)['"]/
    );
    if (importMatch) {
      const importSource = importMatch[1];

      // 解析现有导入，检查是否有来自不同源的同名导入
      const parserConfig = ASTParserUtils.getParserConfig("test.tsx");
      const ast = parse(code, {
        ...parserConfig,
        sourceFilename: "test.tsx",
        ranges: true,
      });

      const existingImportsByName = new Map<
        string,
        Array<{ source: string; node: t.ImportDeclaration }>
      >();
      let lastImportEndPos = 0;

      // 分析现有导入
      traverse(ast, {
        ImportDeclaration: path => {
          const node = path.node;
          const source = node.source.value;

          node.specifiers.forEach(spec => {
            if (t.isImportSpecifier(spec)) {
              const importedName =
                spec.imported.type === "Identifier"
                  ? spec.imported.name
                  : spec.imported.value;

              if (!existingImportsByName.has(importedName)) {
                existingImportsByName.set(importedName, []);
              }
              existingImportsByName.get(importedName)!.push({
                source,
                node,
              });
            } else if (t.isImportDefaultSpecifier(spec)) {
              const name = spec.local.name;
              if (!existingImportsByName.has(name)) {
                existingImportsByName.set(name, []);
              }
              existingImportsByName.get(name)!.push({
                source,
                node,
              });
            }
          });

          if (node.end) {
            lastImportEndPos = Math.max(lastImportEndPos, node.end);
          }
        },
      });

      // 解析自定义导入中的标识符
      const specifierMatches = customImport.match(/import\s*\{([^}]*)\}/);
      if (specifierMatches) {
        const specifiersText = specifierMatches[1];
        const specifierNames = specifiersText
          .split(",")
          .map(s => s.trim())
          .map(s => {
            const asMatch = s.match(/(\w+)\s+as\s+(\w+)/);
            return asMatch ? asMatch[2] : s; // 返回别名或原名
          })
          .filter(name => name.length > 0);

        // 检查冲突并处理
        const changes: ImportChange[] = [];

        // 对于自定义导入，我们应该只移除本地变量名冲突的导入
        for (const name of specifierNames) {
          const existingImports = existingImportsByName.get(name) || [];
          const hasConflict = existingImports.some(
            imp => imp.source !== importSource
          );

          if (hasConflict) {
            // 移除所有来自不同源的导入
            for (const imp of existingImports) {
              if (imp.source !== importSource) {
                const node = imp.node;

                // 移除整个导入语句
                changes.push({
                  type: "replace",
                  start: node.start!,
                  end: node.end!,
                  text: "",
                });
              }
            }
          }
        }

        // 应用变更
        if (changes.length > 0) {
          code = StringReplacer.applyImportChanges(code, changes);
        }
      }
    }

    // 插入自定义导入
    return this.addImportToCode(code, customImport);
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
