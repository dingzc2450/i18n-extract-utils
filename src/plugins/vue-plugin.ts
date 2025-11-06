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
import { StringReplacer } from "../string-replacer";
import type { NormalizedTransformOptions } from "../core/config-normalizer";
import type { ParserOptions } from "@babel/parser";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";
import { getKeyAndRecord } from "../key-manager";
import { attachExtractedCommentToNode } from "../core/ast-utils";
import { getVueCompilerManager } from "./vue/compiler-manager";

// -------------------------
// Lightweight Vue AST types
// -------------------------
// 说明：避免直接硬依赖 @vue/compiler-dom 的完整类型定义，仅声明本插件所需的最小结构。
// 注意：loc 在部分 content 变体上可能不存在，因此均定义为可选，使用前做守卫。
interface VueASTLocation {
  start: {
    line: number;
    column: number;
    offset: number;
  };
  end: {
    line: number;
    column: number;
    offset: number;
  };
}

interface VueASTProps {
  type: number; // 6: Attribute, 7: Directive
  name: string;
  value?: { content: string };
  arg?: { content: string; type: number };
  exp?: {
    content: string;
    type: number;
    loc?: VueASTLocation;
  };
  loc: VueASTLocation;
}

interface VueASTNode {
  type: number; // 1: Element, 2: Text, 5: Interpolation 等
  content?:
    | string
    | {
        content: string;
        type: number;
        loc?: VueASTLocation;
        // Vue 编译器在某些场景会附带 ast（表达式 AST）
        // 在本地类型里作为可选属性声明
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - 动态属性
        ast?: VueNestedASTNode;
      };
  children?: VueASTNode[];
  props?: Array<VueASTProps>;
  loc: VueASTLocation;
}

interface VueNestedASTNode {
  type: string;
  value?: string;
  test?: VueNestedASTNode;
  consequent?: VueNestedASTNode;
  alternate?: VueNestedASTNode;
  quasis?: Array<{ value: { raw: string } }>;
  expressions?: VueNestedASTNode[];
  name?: string;
  object?: VueNestedASTNode;
  property?: VueNestedASTNode;
  start?: number;
  end?: number;
  extra?: {
    parenStart?: number;
    [key: string]: unknown;
  };
  callee?: VueNestedASTNode;
  arguments?: VueNestedASTNode[];
  operator?: string;
  left?: VueNestedASTNode;
  right?: VueNestedASTNode;
}

interface Replacement {
  start: number;
  end: number;
  newText: string;
}

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
    const vueFile = this.parseVueFile(code);

    // 处理模板部分
    if (vueFile.template) {
      vueFile.template = this.processTemplate(
        vueFile.template,
        translationMethodForTemplate,
        extractedStrings,
        usedExistingKeysList,
        options,
        existingValueToKeyMap || new Map(),
        filePath
      );
    }

    // 处理脚本部分
    if (vueFile.script) {
      const scriptResult = this.processScript(
        vueFile.script,
        vueFile.isSetupScript,
        options,
        extractedStrings,
        usedExistingKeysList,
        existingValueToKeyMap || new Map(),
        filePath,
        {
          noImport,
          translationMethod: translationMethodForScript,
          useThisInScript,
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
    const processedCode = this.assembleVueFile(vueFile);

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
    const extractedStrings: ExtractedString[] = [];
    const usedExistingKeysList: UsedExistingKey[] = [];
    const changes: ChangeDetail[] = [];

    // 获取i18n配置
    const i18nConfig = options.normalizedI18nConfig || {};
    const i18nImportConfig = i18nConfig.i18nImport;

    const translationMethod = i18nImportConfig.name;
    const hookName = i18nImportConfig.importName;
    const hookImport = i18nImportConfig.source;

    try {
      const ast = parse(code, {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
        errorRecovery: true,
      });

      // 处理JavaScript中的字符串
      this.processScriptStrings(
        ast,
        translationMethod,
        extractedStrings,
        usedExistingKeysList,
        options,
        existingValueToKeyMap || new Map(),
        filePath,
        false
      );

      // 添加必要的导入和setup
      this.addI18nSetupToScript(
        ast,
        translationMethod,
        hookName,
        hookImport,
        false, // 不是setup script
        extractedStrings.length > 0 || usedExistingKeysList.length > 0
      );

      const { code: processedCode } = generate(ast, {
        retainLines: true,
        compact: false,
        jsescOption: { minimal: true },
      });

      return {
        code: processedCode,
        extractedStrings,
        usedExistingKeysList,
        changes,
      };
    } catch (error) {
      console.error("Error processing JS Vue:", error);
      return {
        code,
        extractedStrings,
        usedExistingKeysList,
        changes,
      };
    }
  }

  /**
   * 解析Vue文件结构
   */
  private parseVueFile(code: string): {
    template?: string;
    templateAttrs?: string;
    script?: string;
    scriptAttrs?: string;
    style?: string;
    styleAttrs?: string;
    isSetupScript: boolean;
  } {
    // 提取各个部分（包含开始标签的属性字符串）
    const tplBlock = this.extractBlock(code, "template");
    const scriptBlock = this.extractBlock(code, "script");
    const styleBlock = this.extractBlock(code, "style");

    const isSetupScript = (scriptBlock?.attrs || "").includes("setup");

    return {
      template: tplBlock?.inner,
      templateAttrs: tplBlock?.attrs,
      script: scriptBlock?.inner,
      scriptAttrs: scriptBlock?.attrs,
      style: styleBlock?.inner,
      styleAttrs: styleBlock?.attrs,
      isSetupScript,
    };
  }

  /**
   * 提取Vue文件中的特定section（template、script、style）
   */
  private extractBlock(
    code: string,
    sectionName: string
  ): { inner: string; attrs: string } | undefined {
    const startTag = new RegExp(`<${sectionName}([^>]*)>`, "i");

    const startMatch = code.match(startTag);
    if (!startMatch) return undefined;

    const attrs = startMatch[1] || ""; // 包含前导空格
    const startIndex = startMatch.index! + startMatch[0].length;
    let depth = 1;
    let currentIndex = startIndex;

    // 使用标签计数来正确处理嵌套标签
    while (currentIndex < code.length && depth > 0) {
      const nextStart = code.indexOf(`<${sectionName}`, currentIndex);
      const nextEnd = code.indexOf(`</${sectionName}>`, currentIndex);

      if (nextEnd === -1) {
        // 没有找到结束标签
        break;
      }

      if (nextStart !== -1 && nextStart < nextEnd) {
        // 找到嵌套的开始标签
        depth++;
        currentIndex = nextStart + 1;
      } else {
        // 找到结束标签
        depth--;
        if (depth === 0) {
          // 找到最外层结束标签
          return { inner: code.substring(startIndex, nextEnd), attrs };
        }
        currentIndex = nextEnd + 1;
      }
    }

    // 如果没有匹配到完整标签，返回到文件结束
    return { inner: code.substring(startIndex), attrs };
  }

  /**
   * 处理模板部分
   * 根据配置使用AST或正则表达式处理Vue模板
   */
  private processTemplate(
    template: string,
    translationMethod: string,
    extractedStrings: ExtractedString[],
    usedExistingKeysList: UsedExistingKey[],
    options: NormalizedTransformOptions,
    existingValueToKeyMap: ExistingValueToKeyMapType,
    filePath: string
  ): string {
    const mode = options.vueTemplateMode;

    // 如果指定使用正则表达式处理或者没有预加载编译器，使用正则表达式
    if (
      mode === "regex" ||
      !getVueCompilerManager().hasLoadedCompiler("vue3")
    ) {
      if (mode === "ast") {
        console.warn(
          "AST mode is not supported without a loaded compiler.\
           Using regex mode instead.\n If you want to use AST mode,\
           ensure that the Vue compiler is properly installed and loaded.\
           Example: npm install @vue/compiler-sfc and use `extractI18n` function with vueTemplateMode set to 'ast'."
        );
      }
      return this.processTemplateWithRegex(
        template,
        translationMethod,
        extractedStrings,
        usedExistingKeysList,
        options,
        existingValueToKeyMap,
        filePath
      );
    }

    try {
      // 获取预加载的编译器实例
      const compiler = getVueCompilerManager().getLoadedCompiler("vue3");

      // 解析模板
      const parsedTemplate = compiler.parse(`<template>${template}</template>`);

      if (!parsedTemplate.descriptor || !parsedTemplate.descriptor.template) {
        throw new Error("Failed to parse template");
      }

      const { ast } = parsedTemplate.descriptor.template;
      if (!ast) {
        throw new Error("Failed to generate AST from template");
      }

      // 收集模板中的替换位置
      const replacements = this.collectTemplateReplacements(ast as VueASTNode, {
        translationMethod,
        options,
        existingValueToKeyMap,
        extractedStrings,
        usedExistingKeysList,
        filePath,
      });

      // 应用替换并返回
      return this.applyTemplateReplacements(template, replacements);
    } catch (error) {
      throw new Error(`Vue compiler error: ${error}`);
    }
  }

  /**
   * 使用正则表达式直接处理模板
   */
  private processTemplateWithRegex(
    template: string,
    translationMethod: string,
    extractedStrings: ExtractedString[],
    usedExistingKeysList: UsedExistingKey[],
    options: NormalizedTransformOptions,
    existingValueToKeyMap: ExistingValueToKeyMapType,
    filePath: string
  ): string {
    const patternRegex = new RegExp(options.pattern, "g");

    // 处理所有表达式和字符串
    const processExpressions = (
      text: string,
      inInterpolation: boolean = false
    ): string => {
      // 处理三元表达式和模板字面量组合
      const ternaryRegex =
        /([^?:]+)\s*\?\s*(?:(?:`|['"])(___[^'"`]+(?:\${[^}]+}[^'"`]*)?___)(?:`|['"])|`(___[^`]+\${[^}]+}[^`]*___)`)(?:\s*:\s*)(?:(?:`|['"])(___[^'"`]+(?:\${[^}]+}[^'"`]*)?___)(?:`|['"])|`(___[^`]+\${[^}]+}[^`]*___)`)|\?(?:`|['"])(___[^'"`]+___)/g;

      let processedText = text.replace(
        ternaryRegex,
        (match, condition, trueStr, trueTempl, falseStr, _falseTempl) => {
          // 生成true分支的key和翻译函数调用
          const trueText = trueTempl || trueStr;
          const trueKey = getKeyAndRecord(
            trueText,
            { filePath, line: 0, column: 0 },
            existingValueToKeyMap,
            new Map(),
            extractedStrings,
            usedExistingKeysList,
            options
          );

          const trueCallExpr = t.callExpression(
            t.identifier(translationMethod),
            [t.stringLiteral(String(trueKey))]
          );

          const { code: trueCall } = generate(trueCallExpr, {
            compact: true,
            jsescOption: { minimal: true },
          });

          // 生成false分支的key和翻译函数调用
          const falseText = falseStr;
          const falseKey = falseText
            ? getKeyAndRecord(
                falseText,
                { filePath, line: 0, column: 0 },
                existingValueToKeyMap,
                new Map(),
                extractedStrings,
                usedExistingKeysList,
                options
              )
            : null;

          let falseCall = "";
          if (falseKey !== null) {
            const falseCallExpr = t.callExpression(
              t.identifier(translationMethod),
              [t.stringLiteral(String(falseKey))]
            );

            const { code } = generate(falseCallExpr, {
              compact: true,
              jsescOption: { minimal: true },
            });
            falseCall = code;
          }

          return falseCall
            ? `${condition.trim()} ? ${trueCall} : ${falseCall}`
            : `${condition.trim()} ? ${trueCall} : ""`;
        }
      );

      // 处理字符串字面量
      processedText = processedText.replace(
        patternRegex,
        (fullMatch, extractedValue) => {
          if (!extractedValue) return fullMatch;

          // 获取或生成键值
          const key = getKeyAndRecord(
            fullMatch,
            { filePath, line: 0, column: 0 },
            existingValueToKeyMap,
            new Map(),
            extractedStrings,
            usedExistingKeysList,
            options
          );

          // 生成翻译函数调用
          const callExpr = t.callExpression(t.identifier(translationMethod), [
            t.stringLiteral(String(key)),
          ]);

          const { code: callCode } = generate(callExpr, {
            compact: true,
            jsescOption: { minimal: true },
          });

          if (inInterpolation) {
            // 已在插值表达式中
            return options.appendExtractedComment
              ? `${callCode} /* ${extractedValue} */`
              : callCode;
          } else {
            // 不在插值表达式中
            return options.appendExtractedComment
              ? `{{ ${callCode} }} <!-- ${extractedValue} -->`
              : `{{ ${callCode} }}`;
          }
        }
      );

      // 处理模板字符串
      const templateLiteralRegex = /`(___[^`]+(?:\${[^}]+}[^`]*)?___)`/g;
      processedText = processedText.replace(
        templateLiteralRegex,
        (match, templateStr) => {
          // 直接提取整个模板字符串
          const key = getKeyAndRecord(
            templateStr,
            { filePath, line: 0, column: 0 },
            existingValueToKeyMap,
            new Map(),
            extractedStrings,
            usedExistingKeysList,
            options
          );

          const callExpr = t.callExpression(t.identifier(translationMethod), [
            t.stringLiteral(String(key)),
          ]);

          const { code: callCode } = generate(callExpr, {
            compact: true,
            jsescOption: { minimal: true },
          });

          return inInterpolation ? callCode : `{{ ${callCode} }}`;
        }
      );

      return processedText;
    };

    // 分段处理插值表达式和普通文本
    const interpolationRegex = /{{([^}]+)}}/g;
    let lastIndex = 0;
    let result = "";

    let match;
    while ((match = interpolationRegex.exec(template)) !== null) {
      // 处理插值表达式之前的普通文本
      const beforeText = template.slice(lastIndex, match.index);
      if (beforeText) {
        result += processExpressions(beforeText);
      }

      // 处理插值表达式内的内容
      const [fullMatch, expr] = match;
      let processedExpr = processExpressions(expr, true);
      processedExpr = processedExpr.trim();
      // 如果替换后仍被外层引号包裹（例如 '{{ '\$t("欢迎")' }}' 的情况），去除外层引号
      if (
        (processedExpr.startsWith("'") && processedExpr.endsWith("'")) ||
        (processedExpr.startsWith('"') && processedExpr.endsWith('"'))
      ) {
        processedExpr = processedExpr.substring(1, processedExpr.length - 1);
      }
      result += `{{ ${processedExpr} }}`;

      lastIndex = match.index + fullMatch.length;
    }

    // 处理剩余的普通文本
    if (lastIndex < template.length) {
      const remainingText = template.slice(lastIndex);
      result += processExpressions(remainingText);
    }

    return result;
  }

  // -------------------------
  // Template AST helpers
  // -------------------------
  private applyTemplateReplacements(
    template: string,
    replacements: Replacement[]
  ): string {
    if (replacements.length === 0) return template;
    // 按位置从后往前，避免偏移污染
    const sorted = [...replacements].sort((a, b) => b.start - a.start);
    let result = template;
    const templateTagLength = "<template>".length;
    for (const { start, end, newText } of sorted) {
      result =
        result.slice(0, start - templateTagLength) +
        newText +
        result.slice(end - templateTagLength);
    }
    return result;
  }

  private collectTemplateReplacements(
    node: VueASTNode,
    ctx: {
      translationMethod: string;
      options: NormalizedTransformOptions;
      existingValueToKeyMap: ExistingValueToKeyMapType;
      extractedStrings: ExtractedString[];
      usedExistingKeysList: UsedExistingKey[];
      filePath: string;
    }
  ): Replacement[] {
    const {
      translationMethod,
      options,
      existingValueToKeyMap,
      extractedStrings,
      usedExistingKeysList,
      filePath,
    } = ctx;

    const replacements: Replacement[] = [];

    const visit = (n: VueASTNode): void => {
      // 文本节点 (type=2)
      if (n.type === 2 && typeof n.content === "string") {
        const matches = n.content.match(options.pattern);
        if (matches) {
          const key = getKeyAndRecord(
            n.content,
            {
              filePath,
              line: n.loc.start.line,
              column: n.loc.start.column,
            },
            existingValueToKeyMap,
            new Map(),
            extractedStrings,
            usedExistingKeysList,
            options
          );

          replacements.push({
            start: n.loc.start.offset,
            end: n.loc.end.offset,
            newText: `{{ ${translationMethod}('${key}') }}`,
          });
        }
      }

      // 插值 (type=5)
      if (n.type === 5 && n.content && typeof n.content === "object") {
        const contentObj = n.content as {
          content: string;
          type: number;
          loc?: VueASTLocation;
          ast?: VueNestedASTNode;
        };

        if (contentObj.type === 4 && contentObj.ast) {
          const newText = this.processNestedExpression(contentObj, n.loc, ctx);
          if (contentObj.loc) {
            replacements.push({
              start: contentObj.loc.start.offset,
              end: contentObj.loc.end.offset,
              newText,
            });
          }
        } else {
          const expressionContent = contentObj.content;
          if (
            typeof expressionContent === "string" &&
            expressionContent.match(options.pattern) &&
            contentObj.loc
          ) {
            const key = getKeyAndRecord(
              expressionContent,
              {
                filePath,
                line: n.loc.start.line,
                column: n.loc.start.column,
              },
              existingValueToKeyMap,
              new Map(),
              extractedStrings,
              usedExistingKeysList,
              options
            );

            replacements.push({
              start: contentObj.loc.start.offset,
              end: contentObj.loc.end.offset,
              newText: `${translationMethod}('${key}')`,
            });
          }
        }
      }

      // 元素属性
      if (n.props) {
        n.props.forEach(prop => {
          // 静态属性 (type=6)
          if (
            prop.type === 6 &&
            prop.value?.content &&
            prop.value.content.match(options.pattern)
          ) {
            const key = getKeyAndRecord(
              prop.value.content,
              {
                filePath,
                line: prop.loc.start.line,
                column: prop.loc.start.column,
              },
              existingValueToKeyMap,
              new Map(),
              extractedStrings,
              usedExistingKeysList,
              options
            );

            replacements.push({
              start: prop.loc.start.offset,
              end: prop.loc.end.offset,
              newText: `:${prop.name}="${translationMethod}('${key}')"`,
            });
          }

          // 指令/动态绑定 (type=7)
          if (
            prop.type === 7 &&
            prop.exp &&
            typeof prop.exp.content === "string" &&
            prop.exp.content.match(options.pattern) &&
            prop.exp.loc
          ) {
            const key = getKeyAndRecord(
              prop.exp.content,
              {
                filePath,
                line: prop.loc.start.line,
                column: prop.loc.start.column,
              },
              existingValueToKeyMap,
              new Map(),
              extractedStrings,
              usedExistingKeysList,
              options
            );

            replacements.push({
              start: prop.exp.loc.start.offset,
              end: prop.exp.loc.end.offset,
              newText: `${translationMethod}('${key}')`,
            });
          }
        });
      }

      // 子节点
      if (n.children) {
        n.children.forEach(c => visit(c));
      }
    };

    visit(node);
    return replacements;
  }

  private processNestedExpression(
    typedContent: {
      content: string;
      type: number;
      loc?: VueASTLocation;
      ast?: VueNestedASTNode;
    },
    nodeLoc: VueASTLocation,
    ctx: {
      translationMethod: string;
      options: NormalizedTransformOptions;
      existingValueToKeyMap: ExistingValueToKeyMapType;
      extractedStrings: ExtractedString[];
      usedExistingKeysList: UsedExistingKey[];
      filePath: string;
    }
  ): string {
    const {
      translationMethod,
      options,
      existingValueToKeyMap,
      extractedStrings,
      usedExistingKeysList,
      filePath,
    } = ctx;
    if (!typedContent.ast) return typedContent.content;

    const indexOffset =
      typedContent.ast.extra?.parenStart !== undefined ? 1 : 0;

    const recur = (
      astNode?: VueNestedASTNode,
      offset = indexOffset
    ): string => {
      if (!astNode) return "";

      if (astNode.type === "StringLiteral") {
        const str = astNode.value;
        if (str && str.match(options.pattern)) {
          const key = getKeyAndRecord(
            str,
            {
              filePath,
              line: nodeLoc.start.line,
              column: nodeLoc.start.column,
            },
            existingValueToKeyMap,
            new Map(),
            extractedStrings,
            usedExistingKeysList,
            options
          );
          return `${translationMethod}('${key}')`;
        }
        return str ? `'${str}'` : "";
      }

      if (
        astNode.type === "ConditionalExpression" &&
        astNode.test &&
        astNode.consequent &&
        astNode.alternate
      ) {
        const testStart = (astNode.test.start ?? 0) - offset;
        const testEnd = (astNode.test.end ?? 0) - offset;
        const test =
          testStart >= 0 &&
          testEnd <= typedContent.content.length &&
          astNode.test.start !== undefined &&
          astNode.test.end !== undefined
            ? typedContent.content.substring(testStart, testEnd)
            : this.reconstructExpression(astNode.test, typedContent.content);
        const consequent = recur(astNode.consequent, offset);
        const alternate = recur(astNode.alternate, offset);
        return test && consequent && alternate
          ? `${test} ? ${consequent} : ${alternate}`
          : typedContent.content;
      }

      if (astNode.type === "TemplateLiteral") {
        const quasis = astNode.quasis || [];
        const expressions = astNode.expressions || [];
        let rawString = "";
        const expressionNames: string[] = [];
        expressions.forEach(expr => {
          if (expr.type === "Identifier") {
            expressionNames.push(expr.name || "type");
          } else if (expr.type === "MemberExpression") {
            const obj = expr.object?.name || "";
            const prop = expr.property?.name || "";
            expressionNames.push(obj && prop ? `${obj}.${prop}` : "type");
          } else {
            expressionNames.push("type");
          }
        });
        for (let i = 0; i < quasis.length; i++) {
          rawString += quasis[i].value.raw;
          if (i < expressions.length) {
            rawString += "${" + expressionNames[i] + "}";
          }
        }
        if (rawString.match(options.pattern)) {
          const translationKey = getKeyAndRecord(
            rawString,
            {
              filePath,
              line: nodeLoc.start.line,
              column: nodeLoc.start.column,
            },
            existingValueToKeyMap,
            new Map(),
            extractedStrings,
            usedExistingKeysList,
            options
          );
          return `${translationMethod}('${translationKey}')`;
        }
        return rawString ? `\`${rawString}\`` : "";
      }

      if (astNode.type === "Identifier") {
        return astNode.name || typedContent.content;
      }
      if (astNode.type === "MemberExpression") {
        // 尽力还原 a.b 形式
        const obj = recur(astNode.object, offset);
        const prop = recur(astNode.property, offset);
        return obj && prop ? `${obj}.${prop}` : typedContent.content;
      }

      // 其他类型回退
      return typedContent.content;
    };

    return recur(typedContent.ast);
  }

  /**
   * 处理Vue脚本部分
   */
  private processScript(
    script: string,
    isSetup: boolean,
    options: NormalizedTransformOptions,
    extractedStrings: ExtractedString[],
    usedExistingKeysList: UsedExistingKey[],
    existingValueToKeyMap: ExistingValueToKeyMapType,
    filePath: string,
    scriptOptions?: {
      noImport?: boolean;
      translationMethod?: string;
      useThisInScript?: boolean;
    }
  ): { code: string } {
    if (!script) return { code: script };

    try {
      // 解析脚本
      const ast = parse(script, {
        sourceType: "module",
        ...this.getParserConfig(),
      });

      // 获取i18n配置
      const translationMethod =
        scriptOptions?.translationMethod ||
        options.normalizedI18nConfig.i18nImport?.name;
      const useThisInScript = scriptOptions?.useThisInScript === true;
      const hookName = options.normalizedI18nConfig.i18nImport.importName;
      const hookSource = options.normalizedI18nConfig.i18nImport?.source;

      // 专门为Vue <script setup>中的注释处理添加的逻辑
      const extractedCommentType = options.extractedCommentType;
      const appendExtractedComment = options.appendExtractedComment;

      const useStringReplacement = scriptOptions?.noImport === true;

      if (useStringReplacement) {
        const scriptChanges = this.collectScriptChanges(
          ast,
          script,
          translationMethod,
          extractedStrings,
          usedExistingKeysList,
          options,
          existingValueToKeyMap,
          filePath,
          useThisInScript,
          appendExtractedComment,
          extractedCommentType
        );

        const updatedScript =
          scriptChanges.length > 0
            ? StringReplacer.applyChanges(script, scriptChanges)
            : script;

        return { code: updatedScript };
      }

      // 处理脚本中的字符串
      // 为<script setup>格式特别处理，将注释放到语句级别而不是函数调用
      if (isSetup && appendExtractedComment) {
        // 保存函数调用与原始文本的映射，用于后续添加注释
        const callExpressionMap = new Map<t.CallExpression, string>();

        // 修改遍历逻辑以收集调用表达式和原始文本
        traverse(ast, {
          StringLiteral(path) {
            const { value } = path.node;
            if (!value) return;

            const pattern = new RegExp(options.pattern, "g");

            const matches = [...value.matchAll(pattern)];
            if (matches.length === 0) return;

            for (const match of matches) {
              const fullMatch = match[0];
              const extractedValue = match[1];

              if (!extractedValue) continue;

              // 获取或生成键值
              const key = getKeyAndRecord(
                fullMatch,
                {
                  filePath,
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                },
                existingValueToKeyMap,
                new Map(),
                extractedStrings,
                usedExistingKeysList,
                options
              );

              // 创建函数调用
              const callee = useThisInScript
                ? t.memberExpression(
                    t.thisExpression(),
                    t.identifier(translationMethod)
                  )
                : t.identifier(translationMethod);
              const callExpr = t.callExpression(callee, [
                t.stringLiteral(String(key)),
              ]);

              // 存储映射关系
              callExpressionMap.set(callExpr, extractedValue);

              // 替换当前字符串
              path.replaceWith(callExpr);
              path.skip();
            }
          },
        });

        // 第二次遍历，为函数调用添加注释到所在语句
        if (callExpressionMap.size > 0) {
          traverse(ast, {
            CallExpression(path) {
              if (callExpressionMap.has(path.node)) {
                const extractedValue = callExpressionMap.get(path.node)!;
                const statement = path.findParent(p => p.isStatement());

                if (statement) {
                  // 找到了语句级别的父节点，添加注释到语句
                  if (!statement.node.trailingComments) {
                    statement.node.trailingComments = [];
                  }

                  if (extractedCommentType === "line") {
                    statement.node.trailingComments.push({
                      type: "CommentLine",
                      value: ` ${extractedValue} `,
                    } as t.CommentLine);
                  } else {
                    statement.node.trailingComments.push({
                      type: "CommentBlock",
                      value: ` ${extractedValue} `,
                    } as t.CommentBlock);
                  }
                } else {
                  // 找不到语句级别的父节点，直接在函数调用上添加注释
                  attachExtractedCommentToNode(
                    path.node,
                    extractedValue,
                    extractedCommentType
                  );
                }
              }
            },
          });
        }
      } else {
        // 非setup脚本或不添加注释，使用标准处理
        this.processScriptStrings(
          ast,
          translationMethod,
          extractedStrings,
          usedExistingKeysList,
          options,
          existingValueToKeyMap,
          filePath,
          useThisInScript
        );
      }

      // 添加i18n需要的导入，除非scriptOptions明确要求不自动注入
      const needsImport =
        !scriptOptions?.noImport && extractedStrings.length > 0;
      this.addI18nSetupToScript(
        ast,
        translationMethod,
        hookName,
        hookSource,
        isSetup,
        needsImport
      );

      // 生成代码
      const { code } = generate(ast, {
        retainLines: true,
        compact: false,
        jsescOption: { minimal: true },
      });

      return { code };
    } catch (error) {
      // 将错误向上抛出，让调用方处理
      console.error("Error processing Vue script:", error);
      throw error;
    }
  }

  private collectScriptChanges(
    ast: t.File,
    originalScript: string,
    translationMethod: string,
    extractedStrings: ExtractedString[],
    usedExistingKeysList: UsedExistingKey[],
    options: NormalizedTransformOptions,
    existingValueToKeyMap: ExistingValueToKeyMapType,
    filePath: string,
    useThisInScript: boolean,
    appendExtractedComment?: boolean,
    extractedCommentType?: "block" | "line"
  ): ChangeDetail[] {
    const patternRegex = new RegExp(options.pattern, "g");
    const changes: ChangeDetail[] = [];
    const generatedKeysMap = new Map<string, string | number>();

    const createCallExpression = (key: string, originalText: string) => {
      const callee = useThisInScript
        ? t.memberExpression(
            t.thisExpression(),
            t.identifier(translationMethod)
          )
        : t.identifier(translationMethod);
      const callExpr = t.callExpression(callee, [t.stringLiteral(String(key))]);

      if (appendExtractedComment) {
        attachExtractedCommentToNode(
          callExpr,
          originalText,
          extractedCommentType || "block"
        );
      }

      return callExpr;
    };

    const recordChange = (node: t.Node, replacementNode: t.Node) => {
      if (!node.loc) return;

      const start = node.start ?? 0;
      const end = node.end ?? start;
      const originalSegment = originalScript.slice(start, end);

      const replacement = generate(replacementNode, {
        jsescOption: { minimal: true },
        compact: false,
      }).code;

      changes.push({
        filePath,
        original: originalSegment,
        replacement,
        line: node.loc.start.line,
        column: node.loc.start.column,
        endLine: node.loc.end.line,
        endColumn: node.loc.end.column,
        start,
        end,
      });
    };

    traverse(ast, {
      StringLiteral(path) {
        const { value } = path.node;
        if (!value) return;

        const matches = [...value.matchAll(patternRegex)];
        if (matches.length === 0) return;

        const match = matches[0];
        const fullMatch = match[0];
        const extractedValue = match[1];
        if (!extractedValue) return;

        const key = getKeyAndRecord(
          fullMatch,
          {
            filePath,
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
          },
          existingValueToKeyMap,
          generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        if (key === undefined) return;

        const callExpr = createCallExpression(String(key), extractedValue);
        recordChange(path.node, callExpr);
        path.skip();
      },
      TemplateLiteral(path) {
        const { quasis, expressions } = path.node;
        if (quasis.length === 0) return;

        let hasReplacement = false;
        const parts: t.Expression[] = [];

        for (let i = 0; i < quasis.length; i++) {
          const quasi = quasis[i];
          const rawValue = quasi.value.raw;

          if (rawValue) {
            const matches = [...rawValue.matchAll(patternRegex)];
            if (matches.length > 0) {
              hasReplacement = true;
              let lastIndex = 0;

              for (const match of matches) {
                const fullMatch = match[0];
                const extractedValue = match[1];
                const matchIndex = match.index ?? 0;

                if (matchIndex > lastIndex) {
                  const beforeText = rawValue.slice(lastIndex, matchIndex);
                  if (beforeText) {
                    parts.push(t.stringLiteral(beforeText));
                  }
                }

                const key = getKeyAndRecord(
                  fullMatch,
                  {
                    filePath,
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                  },
                  existingValueToKeyMap,
                  generatedKeysMap,
                  extractedStrings,
                  usedExistingKeysList,
                  options
                );

                if (key !== undefined) {
                  const callExpr = createCallExpression(
                    String(key),
                    extractedValue
                  );
                  parts.push(callExpr);
                }

                lastIndex = matchIndex + fullMatch.length;
              }

              if (lastIndex < rawValue.length) {
                const afterText = rawValue.slice(lastIndex);
                if (afterText) {
                  parts.push(t.stringLiteral(afterText));
                }
              }
            } else {
              parts.push(t.stringLiteral(rawValue));
            }
          }

          if (i < expressions.length) {
            const expr = expressions[i];
            if (expr) {
              parts.push(t.cloneNode(expr, true) as t.Expression);
            }
          }
        }

        if (!hasReplacement) return;

        let replacementExpr = parts[0];
        for (let i = 1; i < parts.length; i++) {
          replacementExpr = t.binaryExpression("+", replacementExpr, parts[i]);
        }

        recordChange(path.node, replacementExpr);
        path.skip();
      },
    });

    return changes;
  }

  /**
   * 处理脚本中的字符串
   */
  private processScriptStrings(
    ast: t.File,
    translationMethod: string,
    extractedStrings: ExtractedString[],
    usedExistingKeysList: UsedExistingKey[],
    options: NormalizedTransformOptions,
    existingValueToKeyMap: ExistingValueToKeyMapType,
    filePath: string,
    useThisInScript: boolean = false
  ) {
    const patternRegex = new RegExp(options.pattern, "g");

    const createCallExpression = (key: string) => {
      const callee = useThisInScript
        ? t.memberExpression(
            t.thisExpression(),
            t.identifier(translationMethod)
          )
        : t.identifier(translationMethod);
      return t.callExpression(callee, [t.stringLiteral(String(key))]);
    };

    // 使用self捕获外部的this上下文，用于在traverse内部调用类方法

    // 遍历AST，寻找匹配的字符串
    traverse(ast, {
      StringLiteral(path) {
        const { value } = path.node;
        if (!value) return;

        // 检查字符串是否匹配模式
        const matches = [...value.matchAll(patternRegex)];
        if (matches.length === 0) return;

        for (const match of matches) {
          const fullMatch = match[0];
          const extractedValue = match[1];

          if (!extractedValue) continue;

          // 获取或生成键值
          const key = getKeyAndRecord(
            fullMatch,
            {
              filePath,
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
            },
            existingValueToKeyMap,
            new Map(),
            extractedStrings,
            usedExistingKeysList,
            options
          );

          // 替换字符串为函数调用
          const callExpr = createCallExpression(String(key));
          // 添加提取的注释
          if (options.appendExtractedComment) {
            const commentType = options.extractedCommentType || "line";
            attachExtractedCommentToNode(callExpr, extractedValue, commentType);
          }

          path.replaceWith(callExpr);
          path.skip();
        }
      },
      TemplateLiteral(path) {
        // 处理模板字符串
        const { quasis, expressions } = path.node;
        if (quasis.length === 0) return;

        // 检查是否有任何部分匹配模式
        let hasMatch = false;
        for (const quasi of quasis) {
          const value = quasi.value.raw;
          if (!value) continue;

          const matches = [...value.matchAll(patternRegex)];
          if (matches.length > 0) {
            hasMatch = true;
            break;
          }
        }

        if (!hasMatch) return;

        // 转换模板字符串为动态拼接
        const parts: t.Expression[] = [];

        for (let i = 0; i < quasis.length; i++) {
          const quasi = quasis[i];
          const value = quasi.value.raw;

          if (value) {
            // 处理当前部分中的所有匹配
            const matches = [...value.matchAll(patternRegex)];
            if (matches.length > 0) {
              // 将当前部分拆分成多个部分
              let lastIndex = 0;
              for (const match of matches) {
                const fullMatch = match[0];
                const extractedValue = match[1];
                const matchIndex = match.index!;

                if (matchIndex > lastIndex) {
                  // 添加匹配前的文本
                  const beforeText = value.substring(lastIndex, matchIndex);
                  if (beforeText) {
                    parts.push(t.stringLiteral(beforeText));
                  }
                }

                // 获取或生成键值
                const key = getKeyAndRecord(
                  fullMatch,
                  {
                    filePath,
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                  },
                  existingValueToKeyMap,
                  new Map(),
                  extractedStrings,
                  usedExistingKeysList,
                  options
                );

                // 添加i18n函数调用
                const callExpr = createCallExpression(String(key));
                // 添加提取的注释
                if (options.appendExtractedComment) {
                  attachExtractedCommentToNode(
                    callExpr,
                    extractedValue,
                    "block"
                  );
                }

                parts.push(callExpr);
                lastIndex = matchIndex + fullMatch.length;
              }

              // 添加最后一部分
              if (lastIndex < value.length) {
                const afterText = value.substring(lastIndex);
                if (afterText) {
                  parts.push(t.stringLiteral(afterText));
                }
              }
            } else {
              // 没有匹配，直接添加
              parts.push(t.stringLiteral(value));
            }
          }

          // 添加表达式
          if (i < expressions.length) {
            // 确保表达式是有效的t.Expression
            const expr = expressions[i];
            if (expr) {
              parts.push(expr as t.Expression);
            }
          }
        }

        // 使用+运算符连接所有部分
        if (parts.length > 0) {
          let result: t.Expression = parts[0];
          for (let i = 1; i < parts.length; i++) {
            result = t.binaryExpression("+", result, parts[i]);
          }
          path.replaceWith(result);
        }
        path.skip();
      },
    });
  }

  /**
   * 向脚本中添加i18n设置
   */
  private addI18nSetupToScript(
    ast: t.File,
    translationMethod: string,
    hookName: string,
    hookImport: string,
    isSetupScript: boolean,
    needsImport: boolean
  ) {
    if (!needsImport) return;

    // 检查导入是否已存在
    let hasImport = false;
    let hasUseI18n = false;

    const createUseI18nStatement = this.createUseI18nStatement.bind(this);

    // 遍历AST，检查是否已有必要的导入和调用
    traverse(ast, {
      ImportDeclaration(path) {
        if (
          path.node.source.value === hookImport &&
          path.node.specifiers.some(
            s =>
              t.isImportSpecifier(s) &&
              t.isIdentifier(s.imported) &&
              s.imported.name === hookName
          )
        ) {
          hasImport = true;
        }
      },
      VariableDeclaration(path) {
        path.node.declarations.forEach(decl => {
          if (
            t.isVariableDeclarator(decl) &&
            t.isObjectPattern(decl.id) &&
            decl.id.properties.some(
              p =>
                t.isObjectProperty(p) &&
                t.isIdentifier(p.key) &&
                p.key.name === translationMethod
            ) &&
            t.isCallExpression(decl.init) &&
            t.isIdentifier(decl.init.callee) &&
            decl.init.callee.name === hookName
          ) {
            hasUseI18n = true;
          }
        });
      },
    });

    // 添加导入语句
    if (!hasImport) {
      const importStmt = t.importDeclaration(
        [t.importSpecifier(t.identifier(hookName), t.identifier(hookName))],
        t.stringLiteral(hookImport)
      );

      // 插入到文件开头
      ast.program.body.unshift(importStmt);
    }

    // 添加i18n hook调用
    if (!hasUseI18n) {
      // 根据是否为setup脚本使用不同的方法
      if (isSetupScript) {
        // 对于setup脚本，直接在顶层添加
        const useI18nStmt = createUseI18nStatement(translationMethod, hookName);

        // 插入到导入语句之后
        let insertIndex = 0;
        for (let i = 0; i < ast.program.body.length; i++) {
          if (t.isImportDeclaration(ast.program.body[i])) {
            insertIndex = i + 1;
          } else {
            break;
          }
        }
        ast.program.body.splice(insertIndex, 0, useI18nStmt);
      } else {
        // 对于非setup脚本，需要找到setup方法或导出对象
        let hasAddedUseI18n = false;

        // 使用额外的遍历来找到setup方法或导出对象
        traverse(ast, {
          ObjectMethod: {
            enter(path) {
              if (
                t.isIdentifier(path.node.key) &&
                path.node.key.name === "setup" &&
                !hasAddedUseI18n
              ) {
                if (t.isBlockStatement(path.node.body)) {
                  const setupBody = path.node.body.body;
                  let hasExistingUseI18n = false;

                  // 检查是否已有useI18n调用
                  for (const stmt of setupBody) {
                    if (
                      t.isVariableDeclaration(stmt) &&
                      stmt.declarations.some(
                        decl =>
                          t.isVariableDeclarator(decl) &&
                          t.isObjectPattern(decl.id) &&
                          decl.id.properties.some(
                            p =>
                              t.isObjectProperty(p) &&
                              t.isIdentifier(p.key) &&
                              p.key.name === translationMethod
                          )
                      )
                    ) {
                      hasExistingUseI18n = true;
                      break;
                    }
                  }

                  // 如果没有找到useI18n调用，添加一个
                  if (!hasExistingUseI18n) {
                    setupBody.unshift(
                      createUseI18nStatement(translationMethod, hookName)
                    );
                  }

                  hasAddedUseI18n = true;
                  path.stop();
                }
              }
            },
          },
          ObjectProperty: {
            enter(path) {
              if (
                t.isIdentifier(path.node.key) &&
                path.node.key.name === "setup" &&
                t.isFunctionExpression(path.node.value) &&
                !hasAddedUseI18n
              ) {
                const funcNode = path.node.value;
                if (t.isBlockStatement(funcNode.body)) {
                  const setupBody = funcNode.body.body;
                  let hasExistingUseI18n = false;

                  // 检查是否已有useI18n调用
                  for (const stmt of setupBody) {
                    if (
                      t.isVariableDeclaration(stmt) &&
                      stmt.declarations.some(
                        decl =>
                          t.isVariableDeclarator(decl) &&
                          t.isObjectPattern(decl.id) &&
                          decl.id.properties.some(
                            p =>
                              t.isObjectProperty(p) &&
                              t.isIdentifier(p.key) &&
                              p.key.name === translationMethod
                          )
                      )
                    ) {
                      hasExistingUseI18n = true;
                      break;
                    }
                  }

                  // 如果没有找到useI18n调用，添加一个
                  if (!hasExistingUseI18n) {
                    setupBody.unshift(
                      createUseI18nStatement(translationMethod, hookName)
                    );
                  }

                  hasAddedUseI18n = true;
                  path.stop();
                }
              }
            },
          },
          ExportDefaultDeclaration: {
            enter(path) {
              if (
                t.isObjectExpression(path.node.declaration) &&
                !hasAddedUseI18n
              ) {
                // 检查export default对象是否有setup方法
                let hasSetupMethod = false;
                const objProps = path.node.declaration.properties;

                for (const prop of objProps) {
                  if (
                    (t.isObjectMethod(prop) &&
                      t.isIdentifier(prop.key) &&
                      prop.key.name === "setup") ||
                    (t.isObjectProperty(prop) &&
                      t.isIdentifier(prop.key) &&
                      prop.key.name === "setup")
                  ) {
                    hasSetupMethod = true;
                    break;
                  }
                }

                // 如果没有setup方法，添加一个
                if (!hasSetupMethod) {
                  const setupMethod = t.objectMethod(
                    "method",
                    t.identifier("setup"),
                    [],
                    t.blockStatement([
                      createUseI18nStatement(translationMethod, hookName),
                      t.returnStatement(t.objectExpression([])),
                    ])
                  );

                  path.node.declaration.properties.unshift(setupMethod);
                  hasAddedUseI18n = true;
                  path.stop();
                }
              }
            },
          },
        });

        // 如果既没有setup方法也没有export default，可能是React函数组件被强制设置为Vue
        // 在这种情况下，需要在函数组件内部添加useI18n调用
        if (!hasAddedUseI18n) {
          this.addUseI18nToReactComponents(ast, translationMethod, hookName);
        }
      }
    }
  }

  /**
   * 创建useI18n语句
   */
  private createUseI18nStatement(
    translationMethod: string,
    hookName: string
  ): t.VariableDeclaration {
    return t.variableDeclaration("const", [
      t.variableDeclarator(
        t.objectPattern([
          t.objectProperty(
            t.identifier(translationMethod),
            t.identifier(translationMethod),
            false,
            true
          ),
        ]),
        t.callExpression(t.identifier(hookName), [])
      ),
    ]);
  }

  /**
   * 添加useI18n到React组件
   */
  private addUseI18nToReactComponents(
    ast: t.File,
    translationMethod: string,
    hookName: string
  ) {
    const createUseI18nStatement = this.createUseI18nStatement.bind(this);

    // 使用额外的遍历来找到React组件函数并添加useI18n调用
    traverse(ast, {
      FunctionDeclaration: {
        enter(path) {
          // 检查是否是组件函数 (首字母大写)
          const funcName = path.node.id?.name;
          if (
            funcName &&
            /^[A-Z]/.test(funcName) &&
            t.isBlockStatement(path.node.body)
          ) {
            // 检查是否已有useI18n调用
            let hasUseI18n = false;

            path.node.body.body.forEach(stmt => {
              if (
                t.isVariableDeclaration(stmt) &&
                stmt.declarations.some(
                  decl =>
                    t.isVariableDeclarator(decl) &&
                    t.isObjectPattern(decl.id) &&
                    decl.id.properties.some(
                      p =>
                        t.isObjectProperty(p) &&
                        t.isIdentifier(p.key) &&
                        p.key.name === translationMethod
                    )
                )
              ) {
                hasUseI18n = true;
              }
            });

            // 如果没有找到useI18n调用，添加一个
            if (!hasUseI18n) {
              path.node.body.body.unshift(
                createUseI18nStatement(translationMethod, hookName)
              );
            }
          }
        },
      },
      ArrowFunctionExpression: {
        enter(path) {
          // 检查是否是导出的组件
          const parent = path.parent;
          if (
            t.isVariableDeclarator(parent) &&
            t.isIdentifier(parent.id) &&
            /^[A-Z]/.test(parent.id.name) &&
            t.isBlockStatement(path.node.body)
          ) {
            // 检查是否已有useI18n调用
            let hasUseI18n = false;

            path.node.body.body.forEach(stmt => {
              if (
                t.isVariableDeclaration(stmt) &&
                stmt.declarations.some(
                  decl =>
                    t.isVariableDeclarator(decl) &&
                    t.isObjectPattern(decl.id) &&
                    decl.id.properties.some(
                      p =>
                        t.isObjectProperty(p) &&
                        t.isIdentifier(p.key) &&
                        p.key.name === translationMethod
                    )
                )
              ) {
                hasUseI18n = true;
              }
            });

            // 如果没有找到useI18n调用，添加一个
            if (!hasUseI18n) {
              path.node.body.body.unshift(
                createUseI18nStatement(translationMethod, hookName)
              );
            }
          }
        },
      },
    });
  }

  /**
   * 重新组装Vue文件
   */
  private assembleVueFile(vueFile: {
    template?: string;
    templateAttrs?: string;
    script?: string;
    scriptAttrs?: string;
    style?: string;
    styleAttrs?: string;
    isSetupScript: boolean;
  }): string {
    let result = "";

    if (vueFile.template) {
      const inner = this.stripOuterNewlines(vueFile.template);
      const attrs = vueFile.templateAttrs || "";
      result += `<template${attrs}>\n${inner}\n</template>\n\n`;
    }

    if (vueFile.script) {
      const attrs =
        vueFile.scriptAttrs || (vueFile.isSetupScript ? " setup" : "");
      const scriptTag = `<script${attrs}>`;
      const inner = this.stripOuterNewlines(vueFile.script);
      result += `${scriptTag}\n${inner}\n</script>\n\n`;
    }

    if (vueFile.style) {
      const inner = this.stripOuterNewlines(vueFile.style);
      const attrs = vueFile.styleAttrs || "";
      result += `<style${attrs}>\n${inner}\n</style>\n`;
    }

    return result.trim();
  }

  /**
   * 移除section内部首尾多余的单个换行（支持 \n 与 \r\n），避免在重组装时产生额外空行
   */
  private stripOuterNewlines(content: string): string {
    let out = content;
    if (out.startsWith("\r\n")) {
      out = out.slice(2);
    } else if (out.startsWith("\n")) {
      out = out.slice(1);
    }

    if (out.endsWith("\r\n")) {
      out = out.slice(0, -2);
    } else if (out.endsWith("\n")) {
      out = out.slice(0, -1);
    }
    return out;
  }

  /**
   * 重构AST表达式为源代码字符串
   * 用于保留非字符串部分的原始表达式
   */
  private reconstructExpression(
    astNode: unknown,
    originalContent: string
  ): string {
    if (!astNode) return "";

    // 对于有start和end的节点，直接从原始内容中提取
    if (typeof astNode === "object" && astNode !== null) {
      const obj = astNode as Record<string, unknown>;
      if (
        typeof obj.start === "number" &&
        typeof obj.end === "number" &&
        originalContent
      ) {
        // 直接使用start和end提取，这些索引是相对于插值表达式内容的
        return originalContent.substring(
          obj.start as number,
          obj.end as number
        );
      }
    }

    // 回退：根据节点类型手动重构
    if (typeof astNode === "object" && astNode !== null) {
      const obj = astNode as Record<string, unknown>;
      const type = obj.type;
      if (type === "BinaryExpression") {
        const left = this.reconstructExpression(obj.left, originalContent);
        const right = this.reconstructExpression(obj.right, originalContent);
        const op =
          typeof obj.operator === "string" ? (obj.operator as string) : "+";
        return `${left} ${op} ${right}`;
      }
      if (type === "Identifier") {
        return typeof obj.name === "string" ? (obj.name as string) : "";
      }
      if (type === "StringLiteral") {
        return `'${typeof obj.value === "string" ? (obj.value as string) : ""}'`;
      }
      if (type === "MemberExpression") {
        const o = this.reconstructExpression(obj.object, originalContent);
        const p = this.reconstructExpression(obj.property, originalContent);
        return `${o}.${p}`;
      }
      if (type === "CallExpression") {
        const callee = this.reconstructExpression(obj.callee, originalContent);
        const argsArr = Array.isArray(obj.arguments)
          ? (obj.arguments as unknown[])
          : [];
        const args = argsArr
          .map(a => this.reconstructExpression(a, originalContent))
          .join(", ");
        return `${callee}(${args})`;
      }
    }
    return "";
  }
}
