/**
 * 框架适配器索引
 * 统一导出所有适配器和工具
 */

// 类型导出
export type {
  FrameworkAdapter,
  CallExpressionStrategy,
  ImportPolicy,
  AdapterContext,
  AdapterImportInfo,
  ImportEdit,
  HookEdit,
  AdapterFactory,
} from "./types";

export { CallStyle, ImportType } from "./types";

// 基础类导出
export {
  BaseAdapter,
  BaseCallStrategy,
  ThisMethodCallStrategy,
  BaseImportPolicy,
  NoImportPolicy,
  AdapterRegistry,
  adapterRegistry,
} from "./base-adapter";

// Vue 适配器导出
export {
  VueAdapter,
  VueContextType,
  VueScriptSetupImportPolicy,
  VueOptionsAPIImportPolicy,
  createVueAdapter,
} from "./vue-adapter";

// Vue 导入策略导出
export {
  VueScriptSetupImportPolicy as VueScriptSetupPolicy,
  VueOptionsAPIImportPolicy as VueOptionsAPIPolicy,
  VueCompositionAPIImportPolicy,
  VueGlobalImportPolicy,
  VueImportPolicyFactory,
  VueImportPolicy, // 向后兼容
} from "./vue-import-policy";

// React 适配器导出
export {
  ReactAdapter,
  React15Adapter,
  GenericJSAdapter,
  ReactContextType,
  ReactHookImportPolicy,
  createReactAdapter,
  createReact15Adapter,
  createGenericJSAdapter,
} from "./react-adapter";

// ============================================================================
// 适配器注册
// ============================================================================

import { Framework } from "../../types";
import { adapterRegistry } from "./base-adapter";
import { createVueAdapter } from "./vue-adapter";
import {
  createReactAdapter,
  createReact15Adapter,
  createGenericJSAdapter,
} from "./react-adapter";

// 注册所有适配器
adapterRegistry.register(Framework.Vue, createVueAdapter);
adapterRegistry.register("vue2" as Framework, createVueAdapter);
adapterRegistry.register("vue3" as Framework, createVueAdapter);
adapterRegistry.register(Framework.React, createReactAdapter);
adapterRegistry.register(Framework.React15, createReact15Adapter);

/**
 * 获取适配器的便捷函数
 */
export function getAdapter(context: {
  framework: Framework;
  options: import("../config-normalizer").NormalizedTransformOptions;
}) {
  return adapterRegistry.get(context.framework, context.options);
}
