export interface TransformOptions {
  pattern?: string; // 匹配的模式，默认为 ___(.+)___
  outputPath?: string; // 提取的多语言输出路径
  translationMethod?: string; // 替换的翻译方法名，默认为 t
  hookName?: string; // 添加的hook名称，默认为 useTranslation
  hookImport?: string; // hook的导入路径，默认为 'react-i18next'
  /**
   * A function to generate a unique key for a given string value.
   * If not provided, the string value itself is used as the key.
   * @param value The extracted string value.
   * @param filePath The path of the file where the string was found.
   * @returns The generated key.
   */
  generateKey?: (value: string, filePath: string) => string;
}

export interface ExtractedString {
  key: string; // The generated or default key for translation
  value: string;
  filePath: string;
  line: number;
  column: number;
}