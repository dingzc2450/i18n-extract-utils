/**
 * React 15 框架插件
 * 负责React15相关的处理逻辑，不使用hooks，直接导入翻译函数
 */

import {
  FrameworkPlugin,
  ProcessingContext,
  ImportRequirement,
  HookRequirement,
} from "../core/types";
import {
  ExtractedString,
  TransformOptions,
} from "../types";

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
    code: string,
    filePath: string,
    options: TransformOptions
  ): boolean {
    // 如果明确指定了其他框架，不应该使用React15插件
    if (options.i18nConfig?.framework && options.i18nConfig.framework !== "react15") {
      return false;
    }
    
    // 明确指定为React15框架
    if (options.i18nConfig?.framework === "react15") return true;

    // 强React15特征检测 - 这些是React15特有的
    const hasStrongReact15Features = 
      code.includes('React.createClass') || 
      code.includes('createReactClass') ||
      code.includes('getInitialState') ||
      code.includes('componentWillMount') ||
      code.includes('componentWillReceiveProps') ||
      code.includes('componentWillUpdate') ||
      code.includes('getDefaultProps');

    // 如果有强React15特征，直接返回true
    if (hasStrongReact15Features) return true;

    // 现代React特征检测 - 这些表明不是React15
    const hasModernReactFeatures = 
      // Hooks
      code.includes('useState') || 
      code.includes('useEffect') || 
      code.includes('useCallback') ||
      code.includes('useMemo') ||
      code.includes('useContext') ||
      code.includes('useReducer') ||
      code.includes('useRef') ||
      code.includes('useLayoutEffect') ||
      code.includes('useImperativeHandle') ||
      code.includes('useDebugValue') ||
      // React 16.3+ 特征
      code.includes('componentDidCatch') ||
      code.includes('getDerivedStateFromError') ||
      code.includes('getDerivedStateFromProps') ||
      code.includes('getSnapshotBeforeUpdate') ||
      // React 16+ 特征
      code.includes('React.Fragment') ||
      code.includes('React.memo') ||
      code.includes('React.lazy') ||
      code.includes('React.Suspense') ||
      code.includes('React.forwardRef') ||
      // JSX Fragments
      code.includes('<>') ||
      code.includes('</>') ||
      // 现代导入方式
      code.includes('import React, { ') ||
      code.includes('from "react/jsx-runtime"') ||
      code.includes('from "react/jsx-dev-runtime"');

    // 如果有现代React特征，肯定不是React15
    if (hasModernReactFeatures) return false;

    // 更严格的React15判断：
    // 1. 必须有React导入
    // 2. 使用的是老式的类组件语法或者老式的函数组件
    // 3. 没有现代特征
    const hasReactImport = code.includes('import React') || 
                          code.includes('from "react"') || 
                          code.includes("from 'react'");

    if (!hasReactImport) return false;

    // 检查是否是老式的函数组件写法（React15风格）
    const hasOldStyleFunctionComponent = 
      // 使用React.createElement而不是JSX语法且没有JSX标签
      (code.includes('React.createElement') && !/\<[A-Za-z]/.test(code));

    // 检查是否是ES5类组件（但不是React.createClass）
    const hasES5ClassComponent = 
      /class\s+\w+\s+extends\s+React\.Component/.test(code) &&
      !hasModernReactFeatures;

    // 只有在明确是老式写法时才认为是React15
    return hasOldStyleFunctionComponent || 
           (hasES5ClassComponent && this.isLikelyReact15ClassComponent(code));
  }

  /**
   * 检查类组件是否像React15风格
   */
  private isLikelyReact15ClassComponent(code: string): boolean {
    // 检查是否使用了React15特有的生命周期方法或模式
    const react15Patterns = [
      'componentWillMount',
      'componentWillReceiveProps', 
      'componentWillUpdate',
      'getInitialState',
      'getDefaultProps',
    ];

    const hasReact15Patterns = react15Patterns.some(pattern => 
      code.includes(pattern)
    );

    // 如果有React15特有模式，肯定是React15
    if (hasReact15Patterns) return true;

    // 检查是否是非常简单的类组件（可能是React15风格）
    // 只有render方法，没有现代生命周期方法
    const hasSimpleClassComponent = 
      /class\s+\w+\s+extends\s+React\.Component\s*\{[\s\S]*render\s*\(\s*\)\s*\{/.test(code) &&
      !code.includes('componentDidMount') &&
      !code.includes('componentDidUpdate') &&
      !code.includes('componentWillUnmount') &&
      !code.includes('setState') && // 现代类组件通常会有setState
      code.includes('React.createElement'); // 且使用createElement而非JSX

    return hasSimpleClassComponent;
  }

  /**
   * 获取React15解析器配置
   */
  getParserConfig(): object {
    return {
      plugins: ["jsx"],
    };
  }

  /**
   * 获取React15所需的导入和Hook需求
   * React15不需要hooks，只需要直接导入翻译函数
   */
  getRequiredImportsAndHooks(
    extractedStrings: ExtractedString[],
    options: TransformOptions,
    context: ProcessingContext
  ): {
    imports: ImportRequirement[];
    hooks: HookRequirement[];
  } {
    if (extractedStrings.length === 0) {
      return { imports: [], hooks: [] };
    }

    const importSource = this.getImportSource(options);
    const importName = this.getImportName(options);

    const imports: ImportRequirement[] = [
      {
        source: importSource,
        specifiers: [{ name: importName }],
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
  postProcess(
    code: string,
    extractedStrings: ExtractedString[],
    options: TransformOptions,
    context: ProcessingContext
  ): string {
    // React15不需要特殊的后处理
    return code;
  }


  /**
   * 获取导入来源
   */
  private getImportSource(options: TransformOptions): string {
    return (
      options.i18nConfig?.i18nImport?.source ||
      options.hookImport ||
      "i18n"
    );
  }

  /**
   * 获取导入名称
   */
  private getImportName(options: TransformOptions): string {
    return (
      options.i18nConfig?.i18nImport?.importName ||
      options.i18nConfig?.i18nImport?.name ||
      options.translationMethod ||
      "t"
    );
  }
}
