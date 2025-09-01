/**
 * 插件索引文件
 * 导出所有可用的框架插件
 */

export { ReactPlugin } from "./react-plugin";
export { React15Plugin } from "./react15-plugin";
export { VuePlugin } from "./vue-plugin";
export { GenericJSPlugin } from "./generic-js-plugin";

import { CoreProcessor } from "../core/processor";
import { ReactPlugin } from "./react-plugin";
import { React15Plugin } from "./react15-plugin";
import { VuePlugin } from "./vue-plugin";
import { GenericJSPlugin } from "./generic-js-plugin";

/**
 * 创建带有默认插件的核心处理器
 */
export function createProcessorWithDefaultPlugins(): CoreProcessor {
  const processor = new CoreProcessor();

  // 按优先级注册插件 - 特殊框架插件在前，通用框架插件在后
  processor.registerPlugin(new React15Plugin()); // React15需要在React之前检查
  processor.registerPlugin(new VuePlugin()); // Vue在React之前检查以避免.tsx冲突
  processor.registerPlugin(new ReactPlugin()); // React作为通用的JSX处理器
  processor.registerPlugin(new GenericJSPlugin()); // 通用插件最后注册作为后备

  return processor;
}
