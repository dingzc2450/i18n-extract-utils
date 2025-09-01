/**
 * Frameworks 框架模块导出
 * 提供各种框架支持和传统处理器
 * @deprecated 后续 版本将不再维护 并会在正式版本移除
 */

// 框架支持
export {
  createFrameworkTransformer,
  detectFramework,
  mergeWithFrameworkDefaults,
  createFrameworkCodeGenerator,
} from "./framework-factory";
export { ReactTransformer } from "./react-support";
export { React15Transformer } from "./react15-support";
export { VueTransformer } from "./vue-support";
// 传统处理器
export { transformCodeLegacy } from "./legacy-transformer";
