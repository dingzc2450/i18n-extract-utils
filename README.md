# i18n-extract-utils

A powerful utility for extracting and transforming internationalization strings in JavaScript, TypeScript, and React applications.

## Overview

i18n-extract-utils helps you internationalize your application by automatically:

- Extracting text that needs translation from your source code
- Transforming those strings to use your translation method (e.g., `t()`)
- Adding required imports and hooks to your components
- Preserving your code's formatting and structure

## Installation

```bash
npm install i18n-extract-utils --save-dev
# or
yarn add i18n-extract-utils --dev
```

## Usage

```javascript
const { transformCode } = require('i18n-extract-utils');

// Transform a single file
const result = transformCode('path/to/your/file.js', {
  translationMethod: 't',
  hookName: 'useTranslation',
  hookImport: 'react-i18next'
});

console.log(`Transformed code: ${result.code}`);
console.log(`Found ${result.extractedStrings.length} strings for translation`);
```
