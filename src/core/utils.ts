/**
 * 核心共用工具方法
 * 提供可复用的AST处理和导入管理功能
 */

import { parse } from "@babel/parser";
import * as t from "@babel/types";
import * as tg from "../babel-type-guards";
import type { ImportRequirement, HookRequirement } from "./types";
import fs from "fs";
/**
 * AST解析工具类
 */
export class ASTParserUtils {
  /**
   * 获取默认解析器插件
   */
  static getDefaultParserPlugins(filePath: string): string[] {
    const plugins = ["decorators-legacy"];

    // Vue文件需要TypeScript和JSX支持
    if (/\.vue$/.test(filePath)) {
      plugins.push("typescript", "jsx");
    } else if (/\.tsx?$/.test(filePath)) {
      plugins.push("typescript");

      if (/\.tsx$/.test(filePath)) {
        plugins.push("jsx");
      }
    } else if (/\.jsx$/.test(filePath)) {
      plugins.push("jsx");
    }

    return plugins;
  }

  /**
   * 获取解析器配置
   */
  static getParserConfig(
    filePath: string,
    additionalPlugins: string[] = []
  ): object {
    const defaultConfig = {
      sourceType: "module" as const,
      plugins: this.getDefaultParserPlugins(filePath),
      strictMode: false,
    };

    return {
      ...defaultConfig,
      plugins: [...defaultConfig.plugins, ...additionalPlugins],
    };
  }

  /**
   * 安全解析代码
   */
  static parseCode(
    code: string,
    filePath: string,
    additionalPlugins: string[] = []
  ): t.File {
    const config = this.getParserConfig(filePath, additionalPlugins);
    return parse(code, config);
  }
}

/**
 * 导入和Hook管理工具类
 */
export class ImportHookUtils {
  /**
   * 查找导入插入位置
   */
  static findImportInsertPosition(programPath: any): number {
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
  static generateImportStatement(importReq: ImportRequirement): string {
    if (importReq.isDefault) {
      return `import ${importReq.specifiers[0].name} from "${importReq.source}";`;
    } else {
      const specifiers = importReq.specifiers
        .map(spec => (spec.alias ? `${spec.name} as ${spec.alias}` : spec.name))
        .join(", ");
      return `import { ${specifiers} } from "${importReq.source}";`;
    }
  }

  /**
   * 检查是否已存在导入
   */
  static hasExistingImportAST(
    programPath: any,
    importReq: ImportRequirement
  ): boolean {
    let exists = false;

    programPath.node.body.forEach((node: any) => {
      if (
        tg.isImportDeclaration(node) &&
        node.source.value === importReq.source
      ) {
        importReq.specifiers.forEach(spec => {
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
   * 检查是否已存在hook调用
   */
  static hasExistingHookCall(path: any, hookReq: HookRequirement): boolean {
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
  static calculateHookInsertPosition(
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
 * 字符串处理工具类
 */
export class StringUtils {
  /**
   * 转义正则表达式特殊字符
   */
  static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * 标准化导入语句用于比较
   */
  static normalizeImportStatement(statement: string): string {
    return statement.replace(/\s+/g, " ").trim();
  }
}

/**
 * 文件缓存工具类
 */
export class FileCacheUtils {
  private static cache = new Map<
    string,
    { content: string; mtimeMs: number }
  >();

  /**
   * 带缓存地读取文件。
   * 比较文件的最后修改时间，如果未变则直接使用缓存。
   * @param filePath 要读取的文件的绝对路径。
   * @param options 读取选项。
   * @param options.noCache 如果为 true，则绕过缓存，直接从磁盘读取。
   * @returns 文件内容的字符串。
   */
  static readFileWithCache(
    filePath: string,
    options: { noCache?: boolean } = {}
  ): string {
    const { noCache = false } = options;
    const cached = this.cache.get(filePath);
    const mtimeMs = fs.existsSync(filePath)
      ? fs.statSync(filePath).mtimeMs
      : -1;
    if (!noCache && cached && cached.mtimeMs === mtimeMs) {
      return cached.content;
    }

    const content = fs.readFileSync(filePath, "utf-8");
    this.cache.set(filePath, { content, mtimeMs });
    return content;
  }

  /**
   * 清除文件读取缓存。
   * @param filePath 如果提供，则只清除指定文件的缓存。如果未提供，则清除所有缓存。
   */
  static clearCache(filePath?: string): void {
    if (filePath) {
      this.cache.delete(filePath);
    } else {
      this.cache.clear();
    }
  }
}

// 支持插值的正则
const DEFAULT_PATTERN = /___([\s\S]+?)___/g;

/**
 * Gets the default extraction pattern.
 * @returns The default regular expression pattern.
 */
export function getDefaultPattern(): RegExp {
  return new RegExp(DEFAULT_PATTERN.source, "g");
}
