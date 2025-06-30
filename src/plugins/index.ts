/**
 * 插件索引文件
 * 导出所有可用的框架插件
 */

export { ReactPlugin } from "./react-plugin";
export { React15Plugin } from "./react15-plugin";
export { VuePlugin } from "./vue-plugin";
export { GenericJSPlugin } from "./generic-js-plugin";

// 插件注册工厂函数
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
  
  // 按优先级注册插件 - React15需要在React之前检查
  processor.registerPlugin(new React15Plugin());
  processor.registerPlugin(new ReactPlugin());
  processor.registerPlugin(new VuePlugin());
  processor.registerPlugin(new GenericJSPlugin()); // 通用插件最后注册作为后备
  
  return processor;
}
