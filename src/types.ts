export interface TransformOptions {
  pattern?: string; // 匹配的模式，默认为 ___(.+)___
  outputPath?: string; // 提取的多语言输出路径
  translationMethod?: string; // 替换的翻译方法名，默认为 t
  hookName?: string; // 添加的hook名称，默认为 useTranslation
  hookImport?: string; // hook的导入路径，默认为 'react-i18next'
}

export interface ExtractedString {
  value: string;
  filePath: string;
  line: number;
  column: number;
}