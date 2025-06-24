# i18n-extract-utils

一个强大的工具，用于在 JavaScript、TypeScript、React 和 Vue 应用中提取和转换国际化字符串。

## 概述

i18n-extract-utils 帮助您通过以下方式实现应用的国际化：

- 从源代码中自动提取需要翻译的文本
- 将这些字符串转换为您的翻译方法（如 `t()` 或 `$t`）
- 为组件添加所需的导入和钩子
- 保留代码的格式和结构

## 安装

```bash
npm install i18n-extract-utils --save-dev
# 或者
yarn add i18n-extract-utils --dev
```

## 使用方法

### 推荐配置（新）

推荐所有新项目使用 `i18nConfig` 选项。旧选项（`translationMethod`、`hookName`、`hookImport`）已废弃，未来将移除。

#### React 示例

```javascript
const { transformCode } = require('i18n-extract-utils');

const result = transformCode('path/to/your/file.js', {
  i18nConfig: {
    framework: 'react',
    i18nImport: {
      name: 't', // 翻译函数名
      importName: 'useTranslation', // hook 变量名
      source: 'react-i18next' // 导入源
    }
  }
});

console.log(`转换后的代码: ${result.code}`);
console.log(`找到 ${result.extractedStrings.length} 个需要翻译的字符串`);
```

#### Vue 示例

```javascript
const { transformCode } = require('i18n-extract-utils');

const result = transformCode('path/to/your/file.vue', {
  i18nConfig: {
    framework: 'vue',
    i18nImport: {
      name: '$t',
      importName: 'useI18n',
      source: 'vue-i18n'
    }
  }
});

console.log(`转换后的代码: ${result.code}`);
console.log(`找到 ${result.extractedStrings.length} 个需要翻译的字符串`);
```

### 已废弃的选项

- `translationMethod`（请使用 `i18nConfig.i18nImport.name` 替代）
- `hookName`（请使用 `i18nConfig.i18nImport.importName` 替代）
- `hookImport`（请使用 `i18nConfig.i18nImport.source` 替代）

## 配置参考

### TransformOptions

| 选项                  | 类型      | 说明                                               |
|-----------------------|-----------|----------------------------------------------------|
| pattern               | string    | 匹配要提取文本的模式，默认：`___(.+)___`           |
| outputPath            | string    | 提取的多语言文件输出路径                           |
| generateKey           | function  | 生成唯一 key 的函数                                 |
| existingTranslations  | string\|object | 已有翻译（文件路径或对象）                    |
| i18nConfig            | object    | 多语言主配置（见下表）                             |

#### i18nConfig

| 选项        | 类型   | 说明                                                         |
|-------------|--------|--------------------------------------------------------------|
| framework   | string | 框架类型：'react'、'react15'、'vue'、'vue2'、'vue3'           |
| i18nImport  | object | 国际化导入配置（见下表）                                      |
| i18nCall    | func   | 自定义调用表达式生成方法                                      |

#### i18nImport

| 选项        | 类型   | 说明                                                         |
|-------------|--------|--------------------------------------------------------------|
| name        | string | 翻译函数名（如 't'、'$t'）                                    |
| importName  | string | hook 或导入变量名（如 'useTranslation'、'useI18n'）           |
| source      | string | 导入源（如 'react-i18next'、'vue-i18n'）                      |
| custom      | string | （可选）自定义导入语句                                        |

## 注意

- Vue 支持已全面集成，推荐使用 `vue-i18n` 进行国际化处理。
- 请尽快迁移到新配置，旧选项未来版本将移除。
