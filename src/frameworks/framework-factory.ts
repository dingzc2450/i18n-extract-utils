// framework-factory.ts
// 框架工厂，根据配置选择合适的 I18nTransformer

import type {
  TransformOptions,
  I18nTransformer,
  FrameworkCodeGenerator,
} from "../types";
import { Framework } from "../types";
import { ReactTransformer } from "./react-support";
import { React15Transformer } from "./react15-support";
import { VueTransformer } from "./vue-support";
import { UniversalCodeGenerator } from "./universal-code-generator";
import { normalizeConfig } from "../core/config-normalizer";

/**
 * 根据 i18nConfig.framework 创建对应的 transformer
 */
export function createFrameworkTransformer(
  userOptions: TransformOptions
): I18nTransformer {
  // 使用配置规范化模块处理配置
  const normalizedConfig = normalizeConfig(userOptions);
  const framework = normalizedConfig.normalizedI18nConfig.framework;

  switch (framework) {
    case Framework.React:
      return new ReactTransformer();

    case Framework.React15:
      return new React15Transformer();

    case Framework.Vue:
    case Framework.Vue3:
      return new VueTransformer();

    case Framework.Vue2:
      // Vue 2 可以复用 VueTransformer，但可能需要不同的默认配置
      return new VueTransformer();

    default:
      console.warn(`Unknown framework: ${framework}, falling back to React`);
      return new ReactTransformer();
  }
}

/**
 * 根据文件内容和配置自动检测框架类型
 */
export function detectFramework(code: string, filePath: string): Framework {
  // 检查文件扩展名
  const extension = filePath.split(".").pop()?.toLowerCase();

  if (extension === "vue") {
    return Framework.Vue;
  }

  // 强React15特征检测
  const hasStrongReact15Features =
    code.includes("React.createClass") ||
    code.includes("createReactClass") ||
    code.includes("getInitialState") ||
    code.includes("componentWillMount") ||
    code.includes("componentWillReceiveProps") ||
    code.includes("componentWillUpdate") ||
    code.includes("getDefaultProps");

  if (hasStrongReact15Features) {
    return Framework.React15;
  }

  // 检查Vue特征
  // 增强Vue检测逻辑，可检测更多Vue特征
  const hasVueImport =
    code.includes("import Vue") ||
    code.includes('from "vue"') ||
    code.includes("from 'vue'");

  const hasVueStructure =
    code.includes("export default {") &&
    (code.includes("data()") ||
      code.includes("methods:") ||
      code.includes("computed:") ||
      code.includes("components:"));

  const hasVue3Features =
    code.includes("defineComponent") ||
    code.includes("setup()") ||
    code.includes("setup:");

  if (hasVueImport || hasVueStructure || hasVue3Features) {
    return Framework.Vue;
  }

  // 检查React
  if (
    code.includes("import React") ||
    code.includes('from "react"') ||
    code.includes("from 'react'")
  ) {
    // 检查是否为 React 15 (通过缺少现代特征来判断)
    const hasModernFeatures =
      // Hooks
      code.includes("useState") ||
      code.includes("useEffect") ||
      code.includes("useCallback") ||
      code.includes("useMemo") ||
      code.includes("useContext") ||
      code.includes("useReducer") ||
      code.includes("useRef") ||
      // React 16+ 特征
      code.includes("React.Fragment") ||
      code.includes("React.memo") ||
      code.includes("React.lazy") ||
      code.includes("React.Suspense") ||
      code.includes("<>") || // Fragment语法
      code.includes("</>"); // Fragment闭合标签

    // 检查是否符合React15特征
    const isReact15Compatible =
      (!hasModernFeatures && code.includes("React.createElement")) || // 使用createElement但没有现代特征
      (/class\s+\w+\s+extends\s+React\.Component/.test(code) &&
        !hasModernFeatures); // ES5类但没有现代特征

    if (isReact15Compatible) {
      return Framework.React15;
    }

    return Framework.React;
  }

  // 默认返回 react
  return Framework.React;
}

/**
 * 获取框架的默认 i18n 配置
 */
export function getFrameworkDefaults(
  framework: string
): Partial<TransformOptions> {
  const normalizedFramework = framework.toLowerCase() as Lowercase<Framework>;

  switch (normalizedFramework) {
    case Framework.React:
      return {
        i18nConfig: {
          framework: Framework.React,
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
      };

    case "react15":
      return {
        i18nConfig: {
          framework: Framework.React15, // 使用枚举值
          i18nImport: {
            name: "t",
            // React15不使用hooks，直接从i18n导入t函数
            source: "i18n",
            importName: "t", // 明确设置导入名也是t，不使用hook
          },
        },
      };

    case Framework.Vue:
    case Framework.Vue3:
      return {
        i18nConfig: {
          framework: Framework.Vue,
          i18nImport: {
            name: "t",
            importName: "useI18n",
            source: "vue-i18n",
          },
          nonReactConfig: {
            functionName: "$t",
            importType: "named",
            source: "vue-i18n",
            namespace: "i18n",
          },
        },
      };

    case Framework.Vue2:
      return {
        i18nConfig: {
          framework: Framework.Vue2, // 临时类型断言
          i18nImport: {
            name: "$t",
            source: "vue-i18n",
          },
        },
      };

    default:
      return {
        i18nConfig: {
          framework: Framework.React,
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
      };
  }
}

/**
 * 合并用户配置和框架默认配置
 * @deprecated 使用 normalizeConfig 代替
 */
export function mergeWithFrameworkDefaults(
  userOptions: TransformOptions
): TransformOptions {
  // 使用新的配置规范化模块
  const normalizedConfig = normalizeConfig(userOptions);

  // 返回完整的配置，保持向后兼容
  return {
    ...userOptions,
    pattern: normalizedConfig.pattern,
    outputPath: normalizedConfig.outputPath,
    i18nConfig: {
      framework: normalizedConfig.normalizedI18nConfig.framework as Framework,
      i18nImport: normalizedConfig.normalizedI18nConfig.i18nImport,
      nonReactConfig: normalizedConfig.normalizedI18nConfig.nonReactConfig,
    },
  };
}

/**
 * 创建框架特定的代码生成器（新架构）
 */
export function createFrameworkCodeGenerator(): FrameworkCodeGenerator {
  // 现在统一使用 UniversalCodeGenerator 处理所有情况
  return new UniversalCodeGenerator();
}
