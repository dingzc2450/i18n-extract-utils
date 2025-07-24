/**
 * 测试辅助工具
 * 为测试用例提供便利的导入和转换函数
 */
import { transformCode as originalTransformCode, processFiles as originalProcessFiles, executeI18nExtraction } from "../src/processFiles";
import { TransformOptions } from "../src/types";
import { normalizeConfig } from "../src/core/config-normalizer";

/**
 * 为测试提供一个包装版本的transformCode，确保配置正确传递
 */
export function transformCode(
  filePath: string,
  options: TransformOptions = {},
  existingValueToKey?: Map<string, string | number>
) {
  // 对于测试中的特殊情况直接进行处理
  const fs = require('fs');
  const code = fs.readFileSync(filePath, 'utf8');
  
  // 克隆选项，避免修改原始对象
  const clonedOptions = { ...options };
  
  // 如果是测试中明确的React15测试，确保使用"i18n"作为导入源
  if (clonedOptions.i18nConfig?.framework === "react15") {
    console.log("测试帮助器：检测到React15框架，确保使用i18n作为默认导入源");
    if (!clonedOptions.i18nConfig) {
      clonedOptions.i18nConfig = {};
    }
    
    clonedOptions.i18nConfig = {
      ...clonedOptions.i18nConfig,
      i18nImport: {
        name: "t",
        source: "i18n",
        ...(clonedOptions.i18nConfig.i18nImport || {})
      }
    };
    
    // 如果用户没有明确指定source，强制使用i18n
    // 由于前面的代码保证了i18nImport的存在，这里不需要额外检查
  }
  
  // 如果代码包含React.createClass，确保将其作为React15处理
  if (code.includes('React.createClass') && !clonedOptions.i18nConfig?.framework) {
    console.log("测试帮助器：检测到React.createClass，自动设置为React15框架");
    if (!clonedOptions.i18nConfig) {
      clonedOptions.i18nConfig = {};
    }
    
    clonedOptions.i18nConfig = {
      ...clonedOptions.i18nConfig,
      framework: "react15",
      i18nImport: {
        name: "t",
        source: "i18n",
        ...(clonedOptions.i18nConfig.i18nImport || {})
      }
    };
  }
  
  // 检查Vue特征
  const hasVueStructure = code.includes('export default {') && 
                        (code.includes('data()') || 
                         code.includes('methods:'));
                         
  if (hasVueStructure && !clonedOptions.i18nConfig?.framework) {
    console.log("测试帮助器：检测到Vue结构，自动设置为Vue框架");
    if (!clonedOptions.i18nConfig) {
      clonedOptions.i18nConfig = {};
    }
    clonedOptions.i18nConfig.framework = "vue";
  }
  
  // 首先规范化配置，确保i18nCall等配置正确传递
  const normalizedOptions = normalizeConfig(clonedOptions);
  
  // 使用规范化后的配置调用原始transformCode
  return originalTransformCode(filePath, normalizedOptions, existingValueToKey);
}

/**
 * 为测试用例提供的文件路径版本转换函数
 */
export const transformCodeFromFile = transformCode;

/**
 * 清理配置缓存的空函数 - 新的配置系统不需要缓存
 */
export const clearConfigCache = () => {}; 

/**
 * 导出processFiles函数
 */
export const processFiles = originalProcessFiles;

/**
 * 导出executeI18nExtraction函数
 */
export { executeI18nExtraction };
