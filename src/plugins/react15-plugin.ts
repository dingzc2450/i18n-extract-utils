/**
 * React 15 框架插件
 * 负责React15相关的处理逻辑，不使用hooks，直接导入翻译函数
 */

import type {
  FrameworkPlugin,
  ImportRequirement,
  HookRequirement,
} from "../core/types";
import type { NormalizedTransformOptions } from "../core/config-normalizer";
import type { ParserOptions } from "@babel/parser";
import { Framework } from "../types";

/**
 * React 15 插件实现
 * 特点：不使用hooks，直接导入翻译函数
 */
export class React15Plugin implements FrameworkPlugin {
  name = "react15";

  /**
   * 检测是否应该应用React15插件
   */
  shouldApply(
    _code: string,
    _filePath: string,
    options: NormalizedTransformOptions
  ): boolean {
    // 只根据框架类型判断是否应用
    return options.normalizedI18nConfig.framework === Framework.React15;
  }

  /**
   * 获取React15解析器配置
   */
  getParserConfig(): ParserOptions {
    return {
      plugins: ["jsx"],
    };
  }

  /**
   * 获取React15所需的导入和Hook需求
   * React15不需要hooks，只需要直接导入翻译函数
   */
  getRequiredImportsAndHooks(options: NormalizedTransformOptions): {
    imports: ImportRequirement[];
    hooks: HookRequirement[];
  } {
    // React15始终使用"i18n"作为默认导入源，除非测试中明确指定了其他源
    // 这里不使用options.i18nConfig?.i18nImport?.source以避免从规范化配置中获取错误的默认值
    let importSource = "i18n";

    // 只有在明确指定了不同源时才覆盖默认的"i18n"
    const explicitSource = options.normalizedI18nConfig.i18nImport.source;
    if (explicitSource && explicitSource !== "react-i18next") {
      importSource = explicitSource;
    }

    const functionName = this.getFunctionName(options);

    const imports: ImportRequirement[] = [
      {
        source: importSource,
        specifiers: [{ name: functionName }],
        isDefault: false,
      },
    ];

    // React15不需要hooks
    const hooks: HookRequirement[] = [];

    return { imports, hooks };
  }

  /**
   * React15特定的后处理
   */
  postProcess(code: string): string {
    return code;
  }

  /**
   * 获取翻译函数名 (React15使用的函数名)
   */
  private getFunctionName(options: NormalizedTransformOptions): string {
    return options.normalizedI18nConfig.i18nImport.name;
  }
}
