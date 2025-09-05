/**
 * Vue 框架插件
 * 提供完整的Vue SFC支持，包括模板、脚本和样式的处理
 *
 * 此插件已经整合了原frameworks目录中VueCodeGenerator的所有功能
 * 不再依赖于frameworks目录
 */

import type {
  FrameworkPlugin,
  ProcessingContext,
  ImportRequirement,
  HookRequirement,
} from "../core/types";
import type { ExtractedString, UsedExistingKey, ChangeDetail } from "../types";
import type { NormalizedTransformOptions } from "../core/config-normalizer";
import type { ParserOptions } from "@babel/parser";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";
import { getKeyAndRecord } from "../key-manager";
import { attachExtractedCommentToNode } from "../core/ast-utils";

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
    if (context.result.extractedStrings.length === 0) {
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
  }

  /**
   * 处理Vue代码
   * 整合了原VueCodeGenerator的核心功能
   */
  processCode(
    code: string,
    filePath: string,
    options: NormalizedTransformOptions,
    existingValueToKey?: Map<string, string | number>
  ) {
    // 检查是否为Vue单文件组件
    const isVueSFC =
      filePath.endsWith(".vue") ||
      code.includes("<template>") ||
      code.includes("<script");

    if (isVueSFC) {
      // 处理Vue单文件组件
      return this.processSFC(code, filePath, options, existingValueToKey);
    } else {
      // 处理纯JavaScript Vue组件
      return this.processJavaScriptVue(
        code,
        filePath,
        options,
        existingValueToKey
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
    existingValueToKey?: Map<string, string | number>
  ) {
    const extractedStrings: ExtractedString[] = [];
    const usedExistingKeysList: UsedExistingKey[] = [];
    const changes: ChangeDetail[] = [];

    // 获取i18n配置
    const i18nConfig = options.normalizedI18nConfig || {};
    const i18nImportConfig = i18nConfig.i18nImport;

    const translationMethod = i18nImportConfig.name;

    // 解析Vue单文件组件
    const vueFile = this.parseVueFile(code);

    // 处理模板部分
    if (vueFile.template) {
      vueFile.template = this.processTemplate(
        vueFile.template,
        translationMethod,
        extractedStrings,
        usedExistingKeysList,
        options,
        existingValueToKey || new Map(),
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
        existingValueToKey || new Map(),
        filePath
      );
      vueFile.script = scriptResult.code;
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
    existingValueToKey?: Map<string, string | number>
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
        existingValueToKey || new Map(),
        filePath
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
    script?: string;
    style?: string;
    isSetupScript: boolean;
  } {
    // 提取各个部分
    const template = this.extractSection(code, "template");
    const script = this.extractSection(code, "script");
    const style = this.extractSection(code, "style");

    const isSetupScript = code.includes("<script setup");

    return {
      template,
      script,
      style,
      isSetupScript,
    };
  }

  /**
   * 提取Vue文件中的特定section（template、script、style）
   */
  private extractSection(
    code: string,
    sectionName: string
  ): string | undefined {
    const startTag = new RegExp(`<${sectionName}[^>]*>`, "i");

    const startMatch = code.match(startTag);
    if (!startMatch) return undefined;

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
          return code.substring(startIndex, nextEnd);
        }
        currentIndex = nextEnd + 1;
      }
    }

    // 如果没有匹配到完整标签，返回到文件结束
    return code.substring(startIndex);
  }

  /**
   * 处理模板部分 - 使用直接的字符串处理方法
   */
  private processTemplate(
    template: string,
    translationMethod: string,
    extractedStrings: ExtractedString[],
    usedExistingKeysList: UsedExistingKey[],
    options: NormalizedTransformOptions,
    existingValueToKey: Map<string, string | number>,
    filePath: string
  ): string {
    // 直接使用字符串替换方法处理模板
    // 这比使用Vue AST更可靠，因为我们只需要替换特定的字符串
    return this.processTemplateWithRegex(
      template,
      translationMethod,
      extractedStrings,
      usedExistingKeysList,
      options,
      existingValueToKey,
      filePath
    );
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
    existingValueToKey: Map<string, string | number>,
    filePath: string
  ): string {
    const patternRegex = new RegExp(options.pattern, "g");

    let processedTemplate = template;

    // 特别情况: 处理三元运算符中的字符串，如: {{ condition ? '___字符串1___' : '___字符串2___' }}
    // 这个正则表达式匹配Vue模板中的三元表达式
    const ternaryRegex =
      /{{(.+?)\?\s*['"](___[^'"]+___)['"]\s*:\s*['"](___[^'"]+___)['"]\s*}}/g;
    processedTemplate = processedTemplate.replace(
      ternaryRegex,
      (_match, condition, trueStr, falseStr) => {
        // 处理true分支
        const trueKey = getKeyAndRecord(
          `'${trueStr}'`,
          { filePath, line: 0, column: 0 },
          existingValueToKey,
          new Map(),
          extractedStrings,
          usedExistingKeysList,
          options
        );

        const trueCallExpr = t.callExpression(t.identifier(translationMethod), [
          t.stringLiteral(String(trueKey)),
        ]);

        const { code: trueCallCode } = generate(trueCallExpr, {
          compact: true,
          jsescOption: { minimal: true, quotes: "double" },
        });

        // 处理false分支
        const falseKey = getKeyAndRecord(
          `'${falseStr}'`,
          { filePath, line: 0, column: 0 },
          existingValueToKey,
          new Map(),
          extractedStrings,
          usedExistingKeysList,
          options
        );

        const falseCallExpr = t.callExpression(
          t.identifier(translationMethod),
          [t.stringLiteral(String(falseKey))]
        );

        const { code: falseCallCode } = generate(falseCallExpr, {
          compact: true,
          jsescOption: { minimal: true, quotes: "double" },
        });

        // 重新组装三元表达式
        return `{{ ${condition.trim()} ? ${trueCallCode} : ${falseCallCode} }}`;
      }
    );

    // 处理所有其他的普通字符串
    processedTemplate = processedTemplate.replace(
      patternRegex,
      (fullMatch, extractedValue) => {
        if (!extractedValue) return fullMatch;

        // 检查是否在三元表达式内部（避免重复处理）
        const isInTernary = (position: number) => {
          const ternaryRegex = /{{.+?\?.+?:.+?}}/g;
          let ternaryMatch;

          // 寻找最后一个匹配的三元表达式
          while (
            (ternaryMatch = ternaryRegex.exec(processedTemplate)) !== null
          ) {
            if (
              ternaryMatch.index < position &&
              position < ternaryMatch.index + ternaryMatch[0].length
            ) {
              return true;
            }
          }

          return false;
        };

        // 如果这个字符串在三元表达式内，跳过它
        const matchIndex = processedTemplate.indexOf(fullMatch);
        if (isInTernary(matchIndex)) {
          return fullMatch;
        }

        // 获取或生成键值
        const key = getKeyAndRecord(
          fullMatch,
          { filePath, line: 0, column: 0 },
          existingValueToKey,
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
          jsescOption: { minimal: true, quotes: "double" },
        });

        // 判断是否在表达式内部
        if (fullMatch.includes("{{") && fullMatch.includes("}}")) {
          // 已经在插值表达式中，不需要额外添加 {{}}
          const replacement = callCode;
          if (options.appendExtractedComment) {
            return `${replacement} /* ${extractedValue} */`;
          }
          return replacement;
        } else {
          // 不在插值表达式中，需要添加 {{}}
          const replacement = `{{ ${callCode} }}`;
          if (options.appendExtractedComment) {
            return `${replacement} <!-- ${extractedValue} -->`;
          }
          return replacement;
        }
      }
    );

    return processedTemplate;
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
    existingValueToKey: Map<string, string | number>,
    filePath: string
  ): { code: string } {
    if (!script) return { code: script };

    try {
      // 解析脚本
      const ast = parse(script, {
        sourceType: "module",
        ...this.getParserConfig(),
      });

      // 获取i18n配置
      const translationMethod = options.normalizedI18nConfig.i18nImport?.name;
      const hookName = options.normalizedI18nConfig.i18nImport.importName;
      const hookSource = options.normalizedI18nConfig.i18nImport?.source;

      // 专门为Vue <script setup>中的注释处理添加的逻辑
      const extractedCommentType = options.extractedCommentType;
      const appendExtractedComment = options.appendExtractedComment;

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
                existingValueToKey,
                new Map(),
                extractedStrings,
                usedExistingKeysList,
                options
              );

              // 创建函数调用
              const callExpr = t.callExpression(
                t.identifier(translationMethod),
                [t.stringLiteral(String(key))]
              );

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
          existingValueToKey,
          filePath
        );
      }

      // 添加i18n需要的导入
      this.addI18nSetupToScript(
        ast,
        translationMethod,
        hookName,
        hookSource,
        isSetup,
        extractedStrings.length > 0
      );

      // 生成代码
      const { code } = generate(ast, {
        retainLines: true,
        compact: false,
      });

      return { code };
    } catch (error) {
      console.error("Error processing Vue script:", error);
      return { code: script };
    }
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
    existingValueToKey: Map<string, string | number>,
    filePath: string
  ) {
    const patternRegex = new RegExp(options.pattern, "g");

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
            existingValueToKey,
            new Map(),
            extractedStrings,
            usedExistingKeysList,
            options
          );

          // 替换字符串为函数调用
          const callExpr = t.callExpression(t.identifier(translationMethod), [
            t.stringLiteral(String(key)),
          ]);

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
                  existingValueToKey,
                  new Map(),
                  extractedStrings,
                  usedExistingKeysList,
                  options
                );

                // 添加i18n函数调用
                const callExpr = t.callExpression(
                  t.identifier(translationMethod),
                  [t.stringLiteral(String(key))]
                );

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
    script?: string;
    style?: string;
    isSetupScript: boolean;
  }): string {
    let result = "";

    if (vueFile.template) {
      result += `<template>\n${vueFile.template}\n</template>\n\n`;
    }

    if (vueFile.script) {
      const scriptTag = vueFile.isSetupScript ? "<script setup>" : "<script>";
      result += `${scriptTag}\n${vueFile.script}\n</script>\n\n`;
    }

    if (vueFile.style) {
      result += `<style>\n${vueFile.style}\n</style>\n`;
    }

    return result.trim();
  }
}
