// Vue 框架的多语言提取与替换实现 - 使用 VueCodeGenerator 作为核心处理器

import type { I18nTransformer, TransformOptions } from "../types";
import { VueCodeGenerator } from "./vue-code-generator";

/**
 * Vue 框架的多语言提取与替换实现
 * 使用 VueCodeGenerator 作为核心处理器，确保代码一致性
 * 支持 Vue 3 Composition API 和 Vue 2 Options API
 */
export class VueTransformer implements I18nTransformer {
  private codeGenerator = new VueCodeGenerator();

  extractAndReplace(
    code: string,
    filePath: string,
    options: TransformOptions,
    existingValueToKey?: Map<string, string | number>
  ) {
    // 直接使用 VueCodeGenerator 的 processCode 方法
    return this.codeGenerator.processCode(
      code,
      filePath,
      options,
      existingValueToKey
    );
  }
}

/**
 * 检查代码中是否已存在 Vue i18n 相关的设置
 * 使用 VueCodeGenerator 的 canHandle 方法来判断
 */
export function hasVueI18nSetup(
  code: string,
  hookName: string = "useI18n"
): boolean {
  // 简单检查是否包含 useI18n 调用
  return (
    code.includes(`${hookName}(`) || code.includes(`const { t } = ${hookName}`)
  );
}

/**
 * Vue 组件类型判断工具
 * 使用 VueCodeGenerator 的 canHandle 方法来判断
 */
export function isVueComponent(code: string, filePath: string = ""): boolean {
  const generator = new VueCodeGenerator();
  return generator.canHandle(code, filePath);
}
