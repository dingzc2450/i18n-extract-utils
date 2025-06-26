/**
 * 核心处理器 - 统一的上下文感知处理逻辑
 * 所有框架都使用这个核心处理器，只是注入不同的插件
 */

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import {
  ExtractedString,
  TransformOptions,
  UsedExistingKey,
  ChangeDetail,
} from "./types";
import { collectContextAwareReplacementInfo } from "./context-aware-ast-replacer";
import { collectReplacementInfo } from "./enhanced-ast-replacer";
import { StringReplacer } from "./string-replacer";
import { SmartImportManager } from "./smart-import-manager";
import * as tg from "./babel-type-guards";
import { isJSXElement, isJSXFragment } from "./frameworks/react-support";
import { fallbackTransform } from "./fallback-transform";

/**
 * 框架特定处理插件接口
 */
export interface FrameworkPlugin {
  name: string;

  /**
   * 检测是否应该应用此插件
   */
  shouldApply(
    code: string,
    filePath: string,
    options: TransformOptions
  ): boolean;

  /**
   * 预处理代码（可选）
   */
  preProcess?(code: string, options: TransformOptions): string;

  /**
   * 获取需要的导入和hook调用
   */
  getRequiredImportsAndHooks?(
    extractedStrings: ExtractedString[],
    options: TransformOptions,
    context: ProcessingContext
  ): {
    imports: ImportRequirement[];
    hooks: HookRequirement[];
  };

  /**
   * 后处理代码 - 轻量级的最终处理（主要的导入和hook插入已由CoreProcessor完成）
   */
  postProcess?(
    code: string,
    extractedStrings: ExtractedString[],
    options: TransformOptions,
    context: ProcessingContext
  ): string;

  /**
   * 获取解析器配置
   */
  getParserConfig?(): object;
}

/**
 * 处理上下文
 */
export interface ProcessingContext {
  filePath: string;
  originalCode: string;
  hasModifications: boolean;
  requiredImports?: Set<string>;
  detectedFramework?: string;
}

/**
 * 导入需求接口
 */
export interface ImportRequirement {
  source: string; // 导入源，如 "react-i18next"
  specifiers: Array<{
    name: string; // 导入名称，如 "useTranslation"
    alias?: string; // 别名，如果有的话
  }>;
  isDefault?: boolean; // 是否为默认导入
}

/**
 * Hook调用需求接口
 */
export interface HookRequirement {
  hookName: string; // hook名称，如 "useTranslation"
  variableName: string; // 变量名，如 "t"
  isDestructured: boolean; // 是否解构，如 const { t } = useTranslation()
  callExpression: string; // 完整的调用表达式
}

/**
 * 处理模式
 */
export enum ProcessingMode {
  CONTEXT_AWARE = "context-aware", // 上下文感知模式（默认，推荐）
  AST_TRANSFORM = "ast-transform", // AST转换模式（可能破坏格式，但更稳妥）
}

/**
 * 核心处理器类
 */
export class CoreProcessor {
  private plugins: FrameworkPlugin[] = [];

  constructor() {
    // 注册内置插件
    this.registerPlugin(new ReactPlugin());
    this.registerPlugin(new VuePlugin());
    this.registerPlugin(new GenericJSPlugin());
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
  ): {
    code: string;
    extractedStrings: ExtractedString[];
    usedExistingKeysList: UsedExistingKey[];
    changes: ChangeDetail[];
  } {
    try {
      // 1. 确定处理模式 - 默认使用上下文感知模式
      const mode = this.determineProcessingMode(options);

      // 2. 选择合适的插件
      const plugin = this.selectPlugin(code, filePath, options);

      // 3. 预处理
      let processedCode = plugin.preProcess
        ? plugin.preProcess(code, options)
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
        existingValueToKey,
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
      console.error(`Error processing code in ${filePath}:`, error);
      const extractedStrings: ExtractedString[] = [];
      const usedExistingKeysList: UsedExistingKey[] = [];
      return {
        code: fallbackTransform(code, extractedStrings, options),
        extractedStrings,
        usedExistingKeysList,
        changes: [],
      };
    }
  }

  /**
   * 确定处理模式
   */
  private determineProcessingMode(options: TransformOptions): ProcessingMode {
    // 如果用户明确指定了字符串替换模式
    if (
      options.preserveFormatting === true ||
      options.useStringReplacement === true ||
      options.i18nConfig?.nonReactConfig
    ) {
      return ProcessingMode.CONTEXT_AWARE;
    }

    // 如果用户明确指定了AST转换模式
    if (options.useASTTransform === true) {
      return ProcessingMode.AST_TRANSFORM;
    }
    // 默认ast
    return ProcessingMode.AST_TRANSFORM;
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

    // 回退到通用JS插件
    return this.plugins[this.plugins.length - 1];
  }

  /**
   * 获取解析器配置
   */
  private getParserConfig(plugin: FrameworkPlugin, filePath: string): object {
    const defaultConfig = {
      sourceType: "module" as const,
      plugins: this.getDefaultParserPlugins(filePath),
      strictMode: false,
    };

    const pluginConfig = plugin.getParserConfig?.() || {};

    return {
      ...defaultConfig,
      ...pluginConfig,
      plugins: [
        ...defaultConfig.plugins,
        ...((pluginConfig as any).plugins || []),
      ],
    };
  }

  /**
   * 获取默认解析器插件
   */
  private getDefaultParserPlugins(filePath: string): string[] {
    const plugins = ["decorators-legacy"];

    if (/\.tsx?$/.test(filePath)) {
      plugins.push("typescript");
    }

    if (/\.jsx$/.test(filePath) || /\.tsx$/.test(filePath)) {
      plugins.push("jsx");
    }

    return plugins;
  }

  /**
   * 提取和替换逻辑
   */
  private extractAndReplace(
    ast: t.File,
    code: string,
    mode: ProcessingMode,
    options: TransformOptions,
    existingValueToKey: Map<string, string | number> = new Map(),
    filePath: string
  ): {
    extractedStrings: ExtractedString[];
    usedExistingKeysList: UsedExistingKey[];
    changes: ChangeDetail[];
    modified: boolean;
    requiredImports?: Set<string>;
  } {
    const extractedStrings: ExtractedString[] = [];
    const usedExistingKeysList: UsedExistingKey[] = [];

    if (mode === ProcessingMode.CONTEXT_AWARE) {
      // 使用上下文感知模式
      const importManager = new SmartImportManager(
        options.i18nConfig?.i18nImport,
        options.i18nConfig?.nonReactConfig
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
    if (mode === ProcessingMode.AST_TRANSFORM) {
      // 使用AST转换模式
      // 就是以前旧的方式 暂时不应用 TODO 待做
      console.log("Using AST transform mode (legacy)");
      // 使用传统字符串替换模式
      const translationMethod =
        options.i18nConfig?.i18nImport?.name ||
        options.translationMethod ||
        "t";

      const result = collectReplacementInfo(
        ast,
        code,
        existingValueToKey,
        extractedStrings,
        usedExistingKeysList,
        translationMethod,
        options,
        filePath
      );

      return {
        extractedStrings,
        usedExistingKeysList,
        changes: result.changes,
        modified: result.modified,
        requiredImports: undefined,
      };
    }
    console.error("Unknown processing mode:", mode);
    return {
      // 使用AST转换模式
      extractedStrings: [],
      usedExistingKeysList: [],
      changes: [],
      modified: false, // AST转换模式通常会修改代码
    };
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
   * 添加上下文感知的导入（从ReactPlugin移植的遗留方法）
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
   * 统一处理导入和hook调用的通用方法
   */
  private processImportsAndHooks(
    code: string,
    extractedStrings: ExtractedString[],
    options: TransformOptions,
    context: ProcessingContext,
    plugin: FrameworkPlugin
  ): string {
    if (extractedStrings.length === 0) return code;

    let modifiedCode = code;

    // 处理上下文感知的导入（新格式）
    if (context.requiredImports && context.requiredImports.size > 0) {
      modifiedCode = this.addContextAwareImportsLegacy(
        modifiedCode,
        context.requiredImports
      );
    }

    // 处理插件定义的导入和hook需求（统一格式）
    if (plugin.getRequiredImportsAndHooks) {
      const requirements = plugin.getRequiredImportsAndHooks(
        extractedStrings,
        options,
        context
      );
      if (requirements.imports.length > 0 || requirements.hooks.length > 0) {
        modifiedCode = this.addImportsAndHooksWithAST(
          modifiedCode,
          requirements.imports,
          requirements.hooks
        );
      }
    }

    return modifiedCode;
  }

  /**
   * 使用AST统一处理导入和hook插入
   */
  private addImportsAndHooksWithAST(
    code: string,
    importRequirements: ImportRequirement[],
    hookRequirements: HookRequirement[]
  ): string {
    if (importRequirements.length === 0 && hookRequirements.length === 0) {
      return code;
    }

    try {
      const ast = parse(code, {
        sourceType: "module",
        plugins: ["jsx", "typescript", "decorators-legacy"],
        strictMode: false,
      });

      const importInserts: Array<{ position: number; content: string }> = [];
      const hookInserts: Array<{ position: number; content: string }> = [];

      const self = this;

      traverse(ast, {
        Program: {
          enter(path) {
            // 处理导入需求
            for (const importReq of importRequirements) {
              if (!self.hasExistingImportAST(path, importReq)) {
                const insertPosition = self.findImportInsertPosition(path);
                const importStatement = self.generateImportStatement(importReq);

                importInserts.push({
                  position: insertPosition,
                  content:
                    insertPosition > 0
                      ? `\n${importStatement}`
                      : `${importStatement}\n`,
                });
              }
            }
          },
        },
        "FunctionDeclaration|FunctionExpression|ArrowFunctionExpression": (
          path
        ) => {
          // 跳过嵌套函数
          if (path.findParent((p) => tg.isFunction(p.node))) {
            return;
          }

          // 检查是否为React组件或自定义hook
          if (self.shouldAddHooks(path, hookRequirements)) {
            for (const hookReq of hookRequirements) {
              if (
                !self.hasExistingHookCall(path, hookReq) &&
                tg.isFunction(path.node) &&
                path.node.body &&
                tg.isBlockStatement(path.node.body) &&
                path.node.body.start !== undefined &&
                path.node.body.start !== null
              ) {
                const hookInsertInfo = self.calculateHookInsertPosition(
                  path,
                  hookReq,
                  code
                );
                if (hookInsertInfo) {
                  hookInserts.push(hookInsertInfo);
                }
              }
            }
          }
        },
      });

      // 应用所有插入（从后往前避免位置偏移）
      const allInserts = [...importInserts, ...hookInserts].sort(
        (a, b) => b.position - a.position
      );

      let modifiedCode = code;
      for (const insert of allInserts) {
        modifiedCode =
          modifiedCode.slice(0, insert.position) +
          insert.content +
          modifiedCode.slice(insert.position);
      }

      return modifiedCode;
    } catch (error) {
      console.warn(`Failed to add imports and hooks with AST:`, error);
      return code;
    }
  }

  /**
   * 查找导入插入位置
   */
  private findImportInsertPosition(programPath: any): number {
    let insertPosition = 0;

    for (let i = 0; i < programPath.node.body.length; i++) {
      const node = programPath.node.body[i];
      if (
        tg.isExpressionStatement(node) &&
        tg.isStringLiteral(node.expression) &&
        /^['"]use (client|server)['"]$/.test(node.expression.value)
      ) {
        // 在指令后插入
        insertPosition = node.end || 0;
      } else if (tg.isImportDeclaration(node)) {
        // 在最后一个导入后插入
        insertPosition = node.end || 0;
      } else {
        // 遇到非导入非指令语句，停止
        break;
      }
    }

    return insertPosition;
  }

  /**
   * 生成导入语句
   */
  private generateImportStatement(importReq: ImportRequirement): string {
    if (importReq.isDefault) {
      return `import ${importReq.specifiers[0].name} from "${importReq.source}";`;
    } else {
      const specifiers = importReq.specifiers
        .map((spec) =>
          spec.alias ? `${spec.name} as ${spec.alias}` : spec.name
        )
        .join(", ");
      return `import { ${specifiers} } from "${importReq.source}";`;
    }
  }

  /**
   * 检查是否已存在导入
   */
  private hasExistingImportAST(
    programPath: any,
    importReq: ImportRequirement
  ): boolean {
    let exists = false;

    programPath.node.body.forEach((node: any) => {
      if (
        tg.isImportDeclaration(node) &&
        node.source.value === importReq.source
      ) {
        importReq.specifiers.forEach((spec) => {
          node.specifiers.forEach((existingSpec: any) => {
            if (
              importReq.isDefault &&
              t.isImportDefaultSpecifier(existingSpec)
            ) {
              exists = true;
            } else if (
              tg.isImportSpecifier(existingSpec) &&
              tg.isIdentifier(existingSpec.imported) &&
              existingSpec.imported.name === spec.name
            ) {
              exists = true;
            }
          });
        });
      }
    });

    return exists;
  }

  /**
   * 检查是否应该添加hooks
   */
  private shouldAddHooks(
    path: any,
    hookRequirements: HookRequirement[]
  ): boolean {
    // 检查是否返回JSX
    let returnsJSX = false;
    path.traverse({
      ReturnStatement(returnPath: any) {
        if (
          returnPath.node.argument &&
          (isJSXElement(returnPath.node.argument) ||
            isJSXFragment(returnPath.node.argument))
        ) {
          returnsJSX = true;
          returnPath.stop();
        }
      },
    });

    // 检查是否为自定义hook
    let isCustomHook = false;
    if (
      tg.isFunction(path.node) &&
      (tg.isFunctionDeclaration(path.node) ||
        tg.isFunctionExpression(path.node)) &&
      path.node.id &&
      /^use[A-Z\d_]/.test(path.node.id.name)
    ) {
      isCustomHook = true;
    }

    // 检查是否使用了翻译函数
    let usesTranslation = false;
    for (const hookReq of hookRequirements) {
      path.traverse({
        CallExpression(callPath: any) {
          if (
            tg.isIdentifier(callPath.node.callee) &&
            callPath.node.callee.name === hookReq.variableName
          ) {
            usesTranslation = true;
            callPath.stop();
          }
        },
      });
    }

    return returnsJSX || (isCustomHook && usesTranslation);
  }

  /**
   * 检查是否已存在hook调用
   */
  private hasExistingHookCall(path: any, hookReq: HookRequirement): boolean {
    let exists = false;

    if (path.node.body && tg.isBlockStatement(path.node.body)) {
      path.node.body.body.forEach((stmt: any) => {
        if (tg.isVariableDeclaration(stmt)) {
          stmt.declarations.forEach((decl: any) => {
            if (
              tg.isVariableDeclarator(decl) &&
              tg.isCallExpression(decl.init) &&
              tg.isIdentifier(decl.init.callee) &&
              decl.init.callee.name === hookReq.hookName
            ) {
              exists = true;
            }
          });
        }
      });
    }

    return exists;
  }

  /**
   * 计算hook插入位置
   */
  private calculateHookInsertPosition(
    path: any,
    hookReq: HookRequirement,
    code: string
  ): { position: number; content: string } | null {
    const functionBodyStart = path.node.body.start + 1; // +1 跳过 {

    // 计算缩进
    let functionIndent = "  ";
    if (
      path.node.body.body.length > 0 &&
      path.node.body.body[0].start !== undefined &&
      path.node.body.body[0].start !== null
    ) {
      const firstStatementStart = path.node.body.body[0].start;
      const lineStart = code.lastIndexOf("\n", firstStatementStart) + 1;
      functionIndent = code.slice(lineStart, firstStatementStart);
    } else {
      const functionStart = path.node.start || 0;
      const lineStart = code.lastIndexOf("\n", functionStart) + 1;
      const baseFunctionIndent = code.slice(lineStart, functionStart);
      functionIndent = baseFunctionIndent + "  ";
    }

    return {
      position: functionBodyStart,
      content: `\n${functionIndent}${hookReq.callExpression}`,
    };
  }
}

/**
 * React 插件
 */
class ReactPlugin implements FrameworkPlugin {
  name = "react";

  shouldApply(
    code: string,
    filePath: string,
    options: TransformOptions
  ): boolean {
    // 检查是否为React文件
    if (options.i18nConfig?.framework === "react") return true;

    // 如果使用了旧格式的React配置
    if (options.hookName || options.hookImport || options.translationMethod) {
      return /\.(jsx|tsx|js|ts)$/.test(filePath);
    }

    return (
      /\.(jsx|tsx)$/.test(filePath) ||
      code.includes("import React") ||
      code.includes('from "react"') ||
      code.includes("from 'react'") ||
      this.hasJSXElements(code)
    );
  }

  private hasJSXElements(code: string): boolean {
    return /<[A-Z][a-zA-Z0-9]*/.test(code) || /<[a-z]+/.test(code);
  }

  getParserConfig(): object {
    return {
      plugins: ["jsx"],
    };
  }

  postProcess(
    code: string,
    extractedStrings: ExtractedString[],
    options: TransformOptions,
    context: ProcessingContext
  ): string {
    if (extractedStrings.length === 0) return code;

    let modifiedCode = code;

    // 如果有上下文感知的必要导入，添加它们
    if (context.requiredImports && context.requiredImports.size > 0) {
      modifiedCode = this.addContextAwareImports(
        modifiedCode,
        context.requiredImports
      );
    } else {
      // 回退到传统的React hook处理，使用AST解析
      const hookName =
        options.i18nConfig?.i18nImport?.importName ||
        options.hookName ||
        "useTranslation";
      const hookSource =
        options.i18nConfig?.i18nImport?.source ||
        options.hookImport ||
        "react-i18next";
      const translationMethod =
        options.i18nConfig?.i18nImport?.name ||
        options.translationMethod ||
        "t";

      // 使用AST处理导入和hook调用
      modifiedCode = this.addHookAndImportWithAST(
        modifiedCode,
        hookName,
        hookSource,
        translationMethod
      );
    }

    return modifiedCode;
  }

  /**
   * 使用AST找到插入位置，然后在原始代码字符串中插入（不重新生成代码）
   */
  private addHookAndImportWithAST(
    code: string,
    hookName: string,
    hookSource: string,
    translationMethod: string
  ): string {
    try {
      // 解析AST
      const ast = parse(code, {
        sourceType: "module",
        plugins: ["jsx", "typescript", "decorators-legacy"],
        strictMode: false,
      });

      // 记录需要插入的位置和内容
      let importInsertInfo: { position: number; content: string } | null = null;
      const hookInsertInfos: Array<{ position: number; content: string }> = [];

      traverse(ast, {
        Program: {
          enter(path) {
            // 检查是否已存在导入
            let importExists = false;
            path.node.body.forEach((node) => {
              if (
                tg.isImportDeclaration(node) &&
                node.source.value === hookSource
              ) {
                node.specifiers.forEach((spec) => {
                  if (
                    tg.isImportSpecifier(spec) &&
                    tg.isIdentifier(spec.imported) &&
                    spec.imported.name === hookName
                  ) {
                    importExists = true;
                  }
                });
              }
            });

            // 如果导入不存在，找到插入位置
            if (!importExists) {
              // 找到正确的插入位置（在指令和其他导入之后）
              let insertPosition = 0;

              for (let i = 0; i < path.node.body.length; i++) {
                const node = path.node.body[i];
                if (
                  tg.isExpressionStatement(node) &&
                  tg.isStringLiteral(node.expression) &&
                  /^['"]use (client|server)['"]$/.test(node.expression.value)
                ) {
                  // 在指令后插入
                  insertPosition = node.end || 0;
                } else if (tg.isImportDeclaration(node)) {
                  // 在最后一个导入后插入
                  insertPosition = node.end || 0;
                } else {
                  // 遇到非导入非指令语句，停止
                  break;
                }
              }

              // 创建导入语句
              const importStatement = `import { ${hookName} } from "${hookSource}";`;

              if (insertPosition > 0) {
                // 在指定位置后插入
                importInsertInfo = {
                  position: insertPosition,
                  content: `\n${importStatement}`,
                };
              } else {
                // 在文件开头插入
                importInsertInfo = {
                  position: 0,
                  content: `${importStatement}\n`,
                };
              }
            }
          },
        },
        "FunctionDeclaration|FunctionExpression|ArrowFunctionExpression": (
          path
        ) => {
          // 跳过嵌套函数
          if (path.findParent((p) => tg.isFunction(p.node))) {
            return;
          }

          // 检查是否为组件（返回JSX）或自定义hook（函数名以use开头）
          let returnsJSX = false;
          let isCustomHook = false;

          // 检查函数名
          if (
            tg.isFunction(path.node) &&
            (tg.isFunctionDeclaration(path.node) ||
              tg.isFunctionExpression(path.node)) &&
            path.node.id &&
            /^use[A-Z\d_]/.test(path.node.id.name)
          ) {
            isCustomHook = true;
          }

          // 检查是否返回JSX
          path.traverse({
            ReturnStatement(returnPath) {
              if (
                returnPath.node.argument &&
                (isJSXElement(returnPath.node.argument) ||
                  isJSXFragment(returnPath.node.argument))
              ) {
                returnsJSX = true;
                returnPath.stop();
              }
            },
          });

          // 检查函数体内是否有 t(...) 调用
          let hasTCall = false;
          path.traverse({
            CallExpression(callPath) {
              if (
                tg.isIdentifier(callPath.node.callee) &&
                callPath.node.callee.name === translationMethod
              ) {
                hasTCall = true;
                callPath.stop();
              }
            },
          });

          // 组件 或 自定义hook且用到t()，都插入hook语句
          if (
            (returnsJSX || (isCustomHook && hasTCall)) &&
            tg.isFunction(path.node) &&
            path.node.body &&
            tg.isBlockStatement(path.node.body)
          ) {
            // 检查hook调用是否已存在
            let callExists = false;
            path.node.body.body.forEach((stmt) => {
              if (tg.isVariableDeclaration(stmt)) {
                stmt.declarations.forEach((decl) => {
                  if (
                    tg.isVariableDeclarator(decl) &&
                    tg.isCallExpression(decl.init) &&
                    tg.isIdentifier(decl.init.callee) &&
                    decl.init.callee.name === hookName
                  ) {
                    if (
                      tg.isIdentifier(decl.id) ||
                      tg.isObjectPattern(decl.id)
                    ) {
                      callExists = true;
                    }
                  }
                });
              }
            });

            // 如果hook调用不存在，记录插入位置
            if (
              !callExists &&
              path.node.body.start !== undefined &&
              path.node.body.start !== null
            ) {
              // 生成hook调用语句
              let hookCallStatement: string;
              if (translationMethod === "default") {
                hookCallStatement = `const t = ${hookName}();`;
              } else {
                hookCallStatement = `const { ${translationMethod} } = ${hookName}();`;
              }

              // 找到函数体开始位置的下一行进行插入
              const functionBodyStart = path.node.body.start + 1; // +1 跳过 {

              // 查找函数体内第一个语句的缩进
              let functionIndent = "  "; // 默认缩进
              if (
                path.node.body.body.length > 0 &&
                path.node.body.body[0].start !== undefined &&
                path.node.body.body[0].start !== null
              ) {
                const firstStatementStart = path.node.body.body[0].start;
                const lineStart =
                  code.lastIndexOf("\n", firstStatementStart) + 1;
                functionIndent = code.slice(lineStart, firstStatementStart);
              } else {
                // 如果没有语句，通过函数开始位置计算缩进
                const functionStart = path.node.start || 0;
                const lineStart = code.lastIndexOf("\n", functionStart) + 1;
                const baseFunctionIndent = code.slice(lineStart, functionStart);
                functionIndent = baseFunctionIndent + "  "; // 函数体内缩进
              }

              hookInsertInfos.push({
                position: functionBodyStart,
                content: `\n${functionIndent}${hookCallStatement}`,
              });
            }
          }
        },
      });

      // 应用所有插入操作（从后往前，避免位置偏移）
      let modifiedCode = code;
      const allInserts = [
        ...(importInsertInfo ? [importInsertInfo] : []),
        ...hookInsertInfos,
      ].sort((a, b) => b.position - a.position); // 从后往前排序

      for (const insert of allInserts) {
        modifiedCode =
          modifiedCode.slice(0, insert.position) +
          insert.content +
          modifiedCode.slice(insert.position);
      }

      return modifiedCode;
    } catch (error) {
      console.warn(
        `Failed to add hook and import with AST for ${hookName}:`,
        error
      );
      return code;
    }
  }
  /**
   * 压缩解构赋值为单行格式
   */
  private compactDestructuring(
    code: string,
    translationMethod: string,
    hookName: string
  ): string {
    // 查找并替换多行的解构赋值格式
    // 匹配类似这样的模式：
    // const {
    //   t
    // } = useTranslations();
    const multiLinePattern = new RegExp(
      `const\\s*\\{\\s*${translationMethod}\\s*\\}\\s*=\\s*${hookName}\\(\\);`,
      "gs" // g = global, s = dotall (. matches newlines)
    );

    return code.replace(
      multiLinePattern,
      `const { ${translationMethod} } = ${hookName}();`
    );
  }

  /**
   * 添加上下文感知的导入
   */
  private addContextAwareImports(
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
        if (!this.hasExistingImport(modifiedCode, parsedImport)) {
          modifiedCode = this.addImportStatement(modifiedCode, parsedImport);
          addedImports.add(importKey);
        }

        // 如果需要 Hook 调用，添加 Hook 调用
        if (parsedImport.needsHook && parsedImport.hookImport) {
          modifiedCode = this.addHookCallIfNeeded(
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
   * 检查是否已存在导入（用于上下文感知导入）
   */
  private hasExistingImport(code: string, importInfo: any): boolean {
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
   * 添加导入语句（用于上下文感知导入）
   */
  private addImportStatement(code: string, importInfo: any): string {
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
   * 添加 Hook 调用（用于上下文感知导入）
   */
  private addHookCallIfNeeded(code: string, hookInfo: any): string {
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

/**
 * Vue 插件
 */
class VuePlugin implements FrameworkPlugin {
  name = "vue";

  shouldApply(
    code: string,
    filePath: string,
    options: TransformOptions
  ): boolean {
    if (options.i18nConfig?.framework === "vue") return true;

    return (
      /\.vue$/.test(filePath) ||
      code.includes("import Vue") ||
      code.includes('from "vue"') ||
      code.includes("from 'vue'")
    );
  }

  postProcess(
    code: string,
    extractedStrings: ExtractedString[],
    options: TransformOptions,
    context: ProcessingContext
  ): string {
    // Vue特定的后处理逻辑
    // 这里可以添加Vue特有的导入和配置
    return code;
  }
}

/**
 * 通用JS插件 - 最低优先级，处理所有其他JS/TS文件
 */
class GenericJSPlugin implements FrameworkPlugin {
  name = "generic";

  shouldApply(
    code: string,
    filePath: string,
    options: TransformOptions
  ): boolean {
    // 最后的回退选项，处理所有JS/TS文件
    return /\.(js|ts|mjs|cjs)$/.test(filePath);
  }

  postProcess(
    code: string,
    extractedStrings: ExtractedString[],
    options: TransformOptions,
    context: ProcessingContext
  ): string {
    // 对于通用JS文件，我们假设翻译函数已经可用
    // 或者用户会自己处理导入
    return code;
  }
}
