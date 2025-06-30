/**
 * 核心处理器 - 重构后的统一处理逻辑
 * 所有框架都使用这个核心处理器，只是注入不同的插件
 */

import { parse } from "@babel/parser";
import * as t from "@babel/types";
import { StringReplacer } from "../string-replacer";
import { SmartImportManager } from "../smart-import-manager";
import { fallbackTransform } from "../fallback-transform";
import { ASTParserUtils, ImportHookUtils } from "./utils";
import { CoreExtractor } from "./extractor";
import { collectContextAwareReplacementInfo } from "../context-aware-ast-replacer";
import {
  FrameworkPlugin,
  ProcessingContext,
  ImportRequirement,
  HookRequirement,
  ProcessingMode,
  ProcessingResult,
  ExtractionResult,
} from "./types";
import {
  ExtractedString,
  TransformOptions,
  UsedExistingKey,
  ChangeDetail,
} from "../types";

/**
 * 核心处理器类 - 重构版本
 */
export class CoreProcessor {
  private plugins: FrameworkPlugin[] = [];
  private extractor = new CoreExtractor();

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
   * 暂时只支持 CONTEXT_AWARE   其余模式不支持
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
      throw new Error('AST转换模式暂不支持');
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
    return this.getDefaultPlugin();
  }

  /**
   * 获取默认插件
   */
  private getDefaultPlugin(): FrameworkPlugin {
    return {
      name: 'default-react',
      shouldApply: () => true,
      getRequiredImportsAndHooks: (extractedStrings, options, context) => {
        // 默认使用React hooks方式
        if (extractedStrings.length === 0) {
          return { imports: [], hooks: [] };
        }

        const imports: ImportRequirement[] = [
          {
            source: "react-i18next",
            specifiers: [{ name: "useTranslation" }],
            isDefault: false,
          },
        ];

        const hooks: HookRequirement[] = [
          {
            hookName: "useTranslation",
            variableName: "t",
            isDestructured: true,
            callExpression: "const { t } = useTranslation();",
          },
        ];

        return { imports, hooks };
      }
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
    if (extractedStrings.length === 0) return code;

    let modifiedCode = code;

    // 优先处理插件定义的导入和hook需求（统一格式）
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
          requirements.hooks,
          context.filePath
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
   * 使用AST统一处理导入和hook插入
   */
  private addImportsAndHooksWithAST(
    code: string,
    importRequirements: ImportRequirement[],
    hookRequirements: HookRequirement[],
    filePath: string = ""
  ): string {
    if (importRequirements.length === 0 && hookRequirements.length === 0) {
      return code;
    }

    try {
      // 如果没有提供文件路径，尝试从代码特征推断类型
      let inferredPath = filePath;
      if (!inferredPath) {
        if (code.includes("jsx") || /<[A-Z]/.test(code) || /<[a-z]+/.test(code)) {
          inferredPath = "file.tsx"; // JSX/TSX 文件
        } else if (code.includes("typescript") || /:\s*\w+/.test(code)) {
          inferredPath = "file.ts"; // TypeScript 文件
        } else {
          inferredPath = "file.js"; // 默认 JavaScript 文件
        }
      }

      const ast = ASTParserUtils.parseCode(code, inferredPath);
      let modifiedCode = code;

      // 处理导入
      if (importRequirements.length > 0) {
        for (const importReq of importRequirements) {
          if (!this.hasExistingImport(modifiedCode, importReq)) {
            const importStatement = ImportHookUtils.generateImportStatement(importReq);
            modifiedCode = this.addImportToCode(modifiedCode, importStatement);
          }
        }
      }

      // 处理 Hook 调用
      if (hookRequirements.length > 0) {
        for (const hookReq of hookRequirements) {
          if (!this.hasExistingHookCall(modifiedCode, hookReq)) {
            modifiedCode = this.addHookCallToCode(modifiedCode, hookReq);
          }
        }
      }

      return modifiedCode;
    } catch (error) {
      console.warn(`Failed to add imports and hooks with AST:`, error);
      return code;
    }
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
  private hasExistingImport(code: string, importReq: ImportRequirement): boolean {
    const importPattern = new RegExp(
      `import\\s+.*\\b${this.escapeRegex(importReq.specifiers[0].name)}\\b.*from\\s+['"]${this.escapeRegex(importReq.source)}['"]`
    );
    return importPattern.test(code);
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
    const lines = code.split('\n');
    let insertIndex = 0;

    // 查找最后一个导入的位置
    let lastImportIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('import ')) {
        lastImportIndex = i;
      } else if (line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('"use') && !line.startsWith("'use")) {
        break;
      }
    }

    if (lastImportIndex !== -1) {
      insertIndex = lastImportIndex + 1;
    }

    lines.splice(insertIndex, 0, importStatement);
    return lines.join('\n');
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
    return code.includes(hookReq.callExpression) || 
           code.includes(`${hookReq.hookName}()`);
  }

  /**
   * 添加Hook调用到代码中
   */
  private addHookCallToCode(code: string, hookReq: HookRequirement): string {
    let modifiedCode = code;
    
    // 处理所有函数，支持React组件和自定义Hook
    // 1. 查找React组件函数
    modifiedCode = this.addHookToFunctions(
      modifiedCode, 
      hookReq, 
      /^(\s*)(export\s+)?(default\s+)?function\s+([A-Z][a-zA-Z0-9]*)\s*\([^)]*\)\s*\{/gm,
      false // 不是自定义Hook
    );
    
    // 2. 查找React组件箭头函数
    modifiedCode = this.addHookToFunctions(
      modifiedCode, 
      hookReq, 
      /^(\s*)(export\s+)?(default\s+)?const\s+([A-Z][a-zA-Z0-9]*)\s*=\s*\([^)]*\)\s*=>\s*\{/gm,
      false // 不是自定义Hook
    );
    
    // 3. 查找自定义Hook函数
    modifiedCode = this.addHookToFunctions(
      modifiedCode, 
      hookReq, 
      /^(\s*)(export\s+)?(default\s+)?function\s+(use[A-Z][a-zA-Z0-9]*)\s*\([^)]*\)\s*\{/gm,
      true // 是自定义Hook
    );
    
    // 4. 查找自定义Hook箭头函数
    modifiedCode = this.addHookToFunctions(
      modifiedCode, 
      hookReq, 
      /^(\s*)(export\s+)?(default\s+)?const\s+(use[A-Z][a-zA-Z0-9]*)\s*=\s*\([^)]*\)\s*=>\s*\{/gm,
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
      const functionName = match[4];
      const indent = match[1];
      const openBracePos = (match.index || 0) + match[0].length;
      
      // 检查是否已经有Hook调用
      if (modifiedCode.includes(`${hookReq.hookName}()`)) {
        const functionStart = match.index || 0;
        const functionEnd = this.findFunctionEnd(modifiedCode, openBracePos);
        const functionContent = modifiedCode.slice(functionStart, functionEnd);
        
        if (functionContent.includes(`${hookReq.hookName}()`)) {
          return; // 这个函数已经有Hook调用了
        }
      }
      
      // 对于自定义Hook，检查是否有t()调用
      if (isCustomHook) {
        const functionStart = match.index || 0;
        const functionEnd = this.findFunctionEnd(modifiedCode, openBracePos);
        const functionContent = modifiedCode.slice(functionStart, functionEnd);
        
        if (!functionContent.includes('t(')) {
          return; // 自定义Hook没有使用t()，跳过
        }
      }
      
      // 插入Hook调用
      const hookCallLine = '\n' + indent + '  ' + hookReq.callExpression;
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
      if (code[pos] === '{') {
        braceCount++;
      } else if (code[pos] === '}') {
        braceCount--;
      }
    }
    
    return pos + 1;
  }

  /**
   * 提取函数体内容（简化版本，用于检查是否有t()调用）
   */
  private extractFunctionBody(code: string, functionStartPos: number): string {
    let braceCount = 0;
    let start = functionStartPos;
    let end = code.length;
    
    // 找到函数体开始的大括号位置
    // 注意 functionStartPos 应该已经在 { 之后了
    start = functionStartPos;
    
    // 从当前位置往前找到 {
    while (start > 0 && code[start - 1] !== '{') {
      start--;
    }
    
    if (start === 0) {
      // 无法找到开始的大括号，从 functionStartPos 开始
      start = functionStartPos;
      while (start < code.length && code[start] !== '{') {
        start++;
      }
    }
    
    if (start >= code.length) return '';
    
    braceCount = 1; // 开始时已经有一个开放的大括号
    
    // 找到匹配的结束大括号
    for (let i = start + 1; i < code.length; i++) {
      if (code[i] === '{') {
        braceCount++;
      } else if (code[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          end = i;
          break;
        }
      }
    }
    
    return code.slice(start, end + 1);
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
