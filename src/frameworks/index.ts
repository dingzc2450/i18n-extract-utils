/**
 * Frameworks 框架模块导出
 * 提供各种框架支持和传统处理器
 */

// 框架支持
export { createFrameworkTransformer, detectFramework, mergeWithFrameworkDefaults, createFrameworkCodeGenerator } from "./framework-factory";
export { ReactTransformer } from "../plugins/react-plugin";
export { React15Transformer } from "./react15-support";
export { VueTransformer } from "./vue-support";

// 传统处理器
export { transformCodeLegacy } from "./legacy-transformer";

// 代码生成器
export { UniversalCodeGenerator } from "./universal-code-generator";
export { VueCodeGenerator } from "./vue-code-generator";
