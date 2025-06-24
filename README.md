# i18n-extract-utils

A powerful utility for extracting and transforming internationalization strings in JavaScript, TypeScript, React, and Vue applications.

## Overview

i18n-extract-utils helps you internationalize your application by automatically:

- Extracting text that needs translation from your source code
- Transforming those strings to use your translation method (e.g., `t()` or `$t`)
- Adding required imports and hooks to your components
- Preserving your code's formatting and structure

## Installation

```bash
npm install i18n-extract-utils --save-dev
# or
yarn add i18n-extract-utils --dev
```

## Usage

### Recommended Configuration (New)

The recommended way is to use the `i18nConfig` option for all new projects. The old options (`translationMethod`, `hookName`, `hookImport`) are deprecated and will be removed in the future.

#### Example for React

```javascript
const { transformCode } = require('i18n-extract-utils');

const result = transformCode('path/to/your/file.js', {
  i18nConfig: {
    framework: 'react',
    i18nImport: {
      name: 't', // translation function name
      importName: 'useTranslation', // hook variable name
      source: 'react-i18next' // import source
    }
  }
});

console.log(`Transformed code: ${result.code}`);
console.log(`Found ${result.extractedStrings.length} strings for translation`);
```

#### Example for Vue

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

console.log(`Transformed code: ${result.code}`);
console.log(`Found ${result.extractedStrings.length} strings for translation`);
```

### Deprecated Options

- `translationMethod` (use `i18nConfig.i18nImport.name` instead)
- `hookName` (use `i18nConfig.i18nImport.importName` instead)
- `hookImport` (use `i18nConfig.i18nImport.source` instead)

## Configuration Reference

### TransformOptions

| Option                | Type      | Description                                                                                 |
|-----------------------|-----------|---------------------------------------------------------------------------------------------|
| pattern               | string    | Pattern to match text for extraction. Default: `___(.+)___`                                 |
| outputPath            | string    | Output path for extracted translations                                                      |
| generateKey           | function  | Function to generate unique key for a string                                                |
| existingTranslations  | string \| object | Existing translations (file path or object)                                         |
| i18nConfig            | object    | Main i18n configuration (see below)                                                         |

#### i18nConfig

| Option      | Type   | Description                                                                 |
|-------------|--------|-----------------------------------------------------------------------------|
| framework   | string | Framework type: 'react', 'react15', 'vue', 'vue2', 'vue3'                   |
| i18nImport  | object | i18n import config (see below)                                              |
| i18nCall    | func   | Custom call expression generator                                            |

#### i18nImport

| Option      | Type   | Description                                                                 |
|-------------|--------|-----------------------------------------------------------------------------|
| name        | string | Translation function name (e.g. 't', '$t')                                  |
| importName  | string | Hook or import variable name (e.g. 'useTranslation', 'useI18n')             |
| source      | string | Import source (e.g. 'react-i18next', 'vue-i18n')                            |
| custom      | string | (Optional) Custom import statement                                          |

## Notes

- Vue support is fully integrated, and we recommend using `vue-i18n` for internationalization.
- Please migrate to the new configuration as the old options will be removed in future versions.
