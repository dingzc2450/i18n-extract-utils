/**
 * 简化版配置处理器 - 临时解决方案
 * 恢复原有功能，只是添加配置预处理
 */

import { TransformOptions } from "../types";
import { ConfigProxy } from "../config/config-proxy";

/**
 * 为现有代码提供配置增强的包装器
 */
export function enhanceOptionsWithDefaults(
  userOptions: TransformOptions = {},
  code?: string,
  filePath?: string
): TransformOptions {
  // 使用配置代理预处理选项，确保所有默认值都设置好了
  return ConfigProxy.preprocessOptions(userOptions, code, filePath);
}

/**
 * 获取配置访问器，用于安全访问配置值
 */
export function getConfigAccessor(userOptions: TransformOptions = {}) {
  return ConfigProxy.getConfigAccessor(userOptions);
}

/**
 * 验证配置
 */
export function validateUserConfig(userOptions: TransformOptions) {
  return ConfigProxy.validateConfig(userOptions);
}
