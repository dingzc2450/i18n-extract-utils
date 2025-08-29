/**
 * 核心处理器 - 重构后的统一处理逻辑
 * 所有框架都使用这个核心处理器，只是注入不同的插件
 */

import { parse } from "@babel/parser";
import generate from "@babel/generator";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { StringReplacer } from "../string-replacer";
import { SmartImportManager } from "../smart-import-manager";
import { fallbackTransform } from "../fallback-transform";
import { ASTParserUtils, ImportHookUtils } from "./utils";
import { collectContextAwareReplacementInfo } from "../context-aware-ast-replacer";
import { createI18nError, logError, I18nError } from "./error-handler";
import {
  normalizeConfig,
  CONFIG_DEFAULTS,
  getTranslationMethodName,
  getHookName,
  getImportSource,
  NormalizedTransformOptions,
} from "./config-normalizer";
import {
  FrameworkPlugin,
  ProcessingContext,
  ImportRequirement,
  HookRequirement,
  ProcessingMode,
  ProcessingResult,
  ExtractionResult,
  ImportChange,
} from "./types";
import { ExtractedString, TransformOptions, UsedExistingKey } from "../types";

/**
 * 核心处理器类 - 重构版本
 */
export class CoreProcessor {
  private plugins: FrameworkPlugin[] = [];

  constructor() {
    // 插件将在外部注册，不在此处硬编码
  }

  /**
   * 注册框架插件
   */
  registerPlugin(plugin: FrameworkPlugin): void {
    this.plugins.push(plugin);
  }

  /**
   * 处理代码的主入口
   */
  processCode(
    code: string,
    filePath: string,
    options: TransformOptions,
    existingValueToKey?: Map<string, string | number>
  ): ProcessingResult {
    try {
      // 规范化配置，确保一致性
      const normalizedOptions = normalizeConfig(options);

      // 1. 确定处理模式 - 默认使用上下文感知模式
      const mode = this.determineProcessingMode(normalizedOptions);

      // 2. 选择合适的插件
      const plugin = this.selectPlugin(code, filePath, normalizedOptions);

      // 3. 预处理
      let processedCode = plugin.preProcess
        ? plugin.preProcess(code, normalizedOptions)
        : code;

      // 4. 解析AST
      const parserConfig = this.getParserConfig(plugin, filePath);
      const ast = parse(processedCode, parserConfig);

      // 5. 提取和替换
      const result = this.extractAndReplace(
        ast,
        processedCode,
        mode,
        options,
        existingValueToKey || new Map(),
        filePath
      );

      // 6. 如果没有修改，直接返回
      if (!result.modified || result.changes.length === 0) {
        return {
          code: processedCode,
          extractedStrings: result.extractedStrings,
          usedExistingKeysList: result.usedExistingKeysList,
          changes: result.changes,
        };
      }

      // 7. 应用字符串替换
      let modifiedCode = StringReplacer.applyChanges(
        processedCode,
        result.changes
      );

      // 8. 后处理 - 添加导入、hooks等
      const context: ProcessingContext = {
        filePath,
        originalCode: code,
        hasModifications: true,
        requiredImports: result.requiredImports,
        detectedFramework: plugin.name,
      };

      // 统一处理导入和hook调用
      modifiedCode = this.processImportsAndHooks(
        modifiedCode,
        result.extractedStrings,
        options,
        context,
        plugin
      );

      // 插件特定的后处理（可选）
      if (plugin.postProcess) {
        modifiedCode = plugin.postProcess(
          modifiedCode,
          result.extractedStrings,
          options,
          context
        );
      }

      return {
        code: modifiedCode,
        extractedStrings: result.extractedStrings,
        usedExistingKeysList: result.usedExistingKeysList,
        changes: result.changes,
      };
    } catch (error) {
      // 使用统一的错误处理
      let errorCode = "PARSING001"; // 默认为解析错误
      let params = [String(error)];

      if (error instanceof Error) {
        if (error.message.includes("No plugin found")) {
          errorCode = "PLUGIN002";
          params = [filePath];
        } else if (error.message.includes("Vue")) {
          errorCode = "VUE001";
          params = [error.message];
        } else if (error.message.includes("React")) {
          errorCode = "REACT001";
          params = [error.message];
        }
      }

      // 创建并记录错误
      const i18nError = createI18nError(errorCode, params, {
        filePath,
        originalError: error instanceof Error ? error : undefined,
      });

      logError(i18nError);

      const extractedStrings: ExtractedString[] = [];
      const usedExistingKeysList: UsedExistingKey[] = [];

      return {
        code: fallbackTransform(code, extractedStrings, options),
        extractedStrings,
        usedExistingKeysList,
        changes: [],
        error: i18nError, // 包含错误信息
      };
    }
  }

  /**
   * 确定处理模式
   * 暂时只支持 CONTEXT_AWARE   其余模式不支持
   */
  private determineProcessingMode(
    options: TransformOptions | NormalizedTransformOptions
  ): ProcessingMode {
    // 如果用户明确指定了字符串替换模式
    if (
      options.preserveFormatting === true ||
      ("normalizedI18nConfig" in options
        ? options.normalizedI18nConfig.nonReactConfig
        : options.i18nConfig?.nonReactConfig)
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
   * 选择合适的插件
   */
  private selectPlugin(
    code: string,
    filePath: string,
    options: TransformOptions
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
   * 获取默认插件
   */
  private getDefaultPlugin(
    options: TransformOptions | NormalizedTransformOptions
  ): FrameworkPlugin {
    // 检查是否是React15框架
    const isReact15 =
      "normalizedI18nConfig" in options
        ? options.normalizedI18nConfig.framework === "react15"
        : options.i18nConfig?.framework === "react15";

    return {
      name: isReact15 ? "default-react15" : "default-react",
      shouldApply: () => true,
      getRequiredImportsAndHooks: (
        extractedStrings,
        pluginOptions,
        context
      ) => {
        // 没有提取字符串时不需要导入
        if (extractedStrings.length === 0) {
          return { imports: [], hooks: [] };
        }

        // 使用规范化的配置获取值
        const hookName = getHookName(pluginOptions);
        const hookSource = getImportSource(pluginOptions);
        const translationMethod = getTranslationMethodName(pluginOptions);

        // 检查是否是React15框架
        const isReact15 = pluginOptions.i18nConfig?.framework === "react15";

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
   * 获取解析器配置
   */
  private getParserConfig(plugin: FrameworkPlugin, filePath: string): object {
    const defaultConfig = ASTParserUtils.getParserConfig(filePath);
    const pluginConfig = plugin.getParserConfig?.() || {};

    return {
      ...defaultConfig,
      ...pluginConfig,
      plugins: [
        ...(defaultConfig as any).plugins,
        ...((pluginConfig as any).plugins || []),
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
    options: TransformOptions,
    existingValueToKey: Map<string, string | number>,
    filePath: string
  ): ExtractionResult {
    const extractedStrings: ExtractedString[] = [];
    const usedExistingKeysList: UsedExistingKey[] = [];

    if (mode === ProcessingMode.CONTEXT_AWARE) {
      // 使用上下文感知模式 - 暂时保持使用原有的方法，后续可以迁移到新的extractor

      // 规范化配置获取导入信息
      const normalizedOptions = normalizeConfig(options);

      const importConfig = normalizedOptions.normalizedI18nConfig.i18nImport;
      const nonReactConfig =
        normalizedOptions.normalizedI18nConfig.nonReactConfig;

      const importManager = new SmartImportManager(
        importConfig,
        nonReactConfig
      );

      const result = collectContextAwareReplacementInfo(
        ast,
        code,
        existingValueToKey,
        extractedStrings,
        usedExistingKeysList,
        importManager,
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
    extractedStrings: ExtractedString[],
    options: TransformOptions,
    context: ProcessingContext,
    plugin: FrameworkPlugin
  ): string {
    let modifiedCode = code;

    // 优先处理插件定义的导入和hook需求（统一格式）
    if (plugin.getRequiredImportsAndHooks) {
      const requirements = plugin.getRequiredImportsAndHooks(
        extractedStrings,
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
    options: TransformOptions = {}
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
          modifiedCode = this.addOrMergeImports(modifiedCode, importRequirements, filePath);
        } else {
          // 旧的、非合并的添加逻辑
          for (const importReq of importRequirements) {
            const importStatement = ImportHookUtils.generateImportStatement(importReq);
            // 修复：应该检查 modifiedCode，而不是原始的 code
            if (!modifiedCode.includes(importStatement)) {
               modifiedCode = this.addImportToCode(modifiedCode, importStatement);
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
      console.warn(`Failed to add imports and hooks:`, error);
      return code;
    }
  }

  /**
   * 获取mergeImports配置值
   * @param options 转换选项
   * @returns mergeImports的布尔值
   */
  private getMergeImports(options: TransformOptions): boolean {
    // 优先使用新配置格式
    if (options.i18nConfig?.i18nImport?.mergeImports !== undefined) {
      return options.i18nConfig.i18nImport.mergeImports !== false;
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
    filePath: string
  ): string {
    const parserConfig = ASTParserUtils.getParserConfig(filePath);
    const ast = parse(code, {
      ...parserConfig,
      sourceFilename: filePath,
      ranges: true,
    });

    const changes: ImportChange[] = [];
    const existingImports = new Map<
      string,
      { node: t.ImportDeclaration; specifiers: Set<string> }
    >();
    let lastImportEndPos = 0;

    // 1. 分析现有导入
    traverse(ast, {
      ImportDeclaration: (path) => {
        const node = path.node;
        const source = node.source.value;

        if (!existingImports.has(source)) {
          existingImports.set(source, { node, specifiers: new Set() });
        }

        const existing = existingImports.get(source)!;
        node.specifiers.forEach((spec) => {
          if (t.isImportSpecifier(spec)) {
            const importedName =
              spec.imported.type === "Identifier"
                ? spec.imported.name
                : spec.imported.value;
            existing.specifiers.add(importedName);
          } else if (t.isImportDefaultSpecifier(spec)) {
            existing.specifiers.add("default");
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
          (req.specifiers || []).forEach((spec) => {
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
        const newSpecifiers: (t.ImportSpecifier | t.ImportDefaultSpecifier)[] =
          [];
        if (req.isDefault) {
          newSpecifiers.push(
            t.importDefaultSpecifier(t.identifier(req.specifiers[0].name))
          );
        } else {
          (req.specifiers || []).forEach((s) => {
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
          (req.specifiers || []).forEach((s) => newSpecifierNames.add(s.name));
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
        const parsedImport = JSON.parse(importInfoStr);

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
      console.warn(`Failed to add context-aware imports:`, error);
      return code;
    }
  }

  /**
   * 检查是否已存在导入（简化版本）
   */
  private hasExistingImport(
    code: string,
    importReq: ImportRequirement
  ): boolean {
    try {
      const ast = parse(code, {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
      });
      let found = false;

      traverse(ast, {
        ImportDeclaration(path) {
          if (path.node.source.value === importReq.source) {
            // 检查是否满足所有需要的 specifiers
            const existingSpecifiers = new Set(
              path.node.specifiers.map((s) => {
                if (t.isImportDefaultSpecifier(s)) return "default";
                if (t.isImportSpecifier(s) && s.imported.type === "Identifier")
                  return s.imported.name;
                return null;
              })
            );

            const requiredSpecifiers = new Set(
              importReq.specifiers.map((s) =>
                importReq.isDefault ? "default" : s.name
              )
            );

            let allRequiredFound = true;
            for (const reqSpec of requiredSpecifiers) {
              if (!existingSpecifiers.has(reqSpec)) {
                allRequiredFound = false;
                break;
              }
            }

            if (allRequiredFound) {
              found = true;
              path.stop();
            }
          }
        },
      });

      return found;
    } catch (e) {
      // 如果解析失败，回退到简单的正则检查
      const importPattern = new RegExp(
        `import\\s+.*\\b${this.escapeRegex(
          importReq.specifiers[0].name
        )}\\b.*from\\s+['"]${this.escapeRegex(importReq.source)}['"]`
      );
      return importPattern.test(code);
    }
  }

  /**
   * 检查是否已存在导入（遗留方法）
   */
  private hasExistingImportLegacy(code: string, importInfo: any): boolean {
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
  private addImportStatementLegacy(code: string, importInfo: any): string {
    const importStatement =
      importInfo.needsHook && importInfo.hookImport
        ? importInfo.hookImport.importStatement || importInfo.importStatement
        : importInfo.importStatement;

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
    matches.reverse().forEach((match, index) => {
      const functionName = match[4];
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
  private addHookCallIfNeededLegacy(code: string, hookInfo: any): string {
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
   * 转义正则表达式特殊字符
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
