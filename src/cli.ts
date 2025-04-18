#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import { processFiles } from './transformer';
import { TransformOptions } from './types';

const program = new Command();

program
  .name('i18n-extract')
  .description('提取和转换React组件中的多语言字符串')
  .version('1.0.0')
  .option('-p, --pattern <pattern>', '要处理的文件 glob 模式', 'src/**/*.{jsx,tsx}')
  .option('-s, --string-pattern <stringPattern>', '字符串提取的正则表达式模式 (默认: ___(.+)___)')
  .option('-o, --output <output>', '提取的字符串 JSON 输出路径')
  .option('-m, --method <method>', '翻译方法名 (默认: t)')
  .option('-h, --hook <hook>', '翻译 hook 名称 (默认: useTranslation)')
  .option('-i, --import <import>', '翻译 hook 导入路径 (默认: react-i18next)')
  .action(async (cmdOptions) => {
    const options: TransformOptions = {
      pattern: cmdOptions.stringPattern,
      outputPath: cmdOptions.output ? path.resolve(cmdOptions.output) : undefined,
      translationMethod: cmdOptions.method || 't',
      hookName: cmdOptions.hook || 'useTranslation',
      hookImport: cmdOptions.import || 'react-i18next'
    };

    const filePattern = cmdOptions.pattern;
    
    try {
      console.log(`处理匹配模式的文件: ${filePattern}`);
      const result = await processFiles(filePattern, options);
      
      console.log(`处理了 ${result.modifiedFiles.length} 个文件`);
      console.log(`找到 ${result.extractedStrings.length} 个可翻译字符串`);
      
      if (options.outputPath) {
        console.log(`提取的字符串已保存到 ${options.outputPath}`);
      }
    } catch (error) {
      console.error('处理文件时出错:', error);
      process.exit(1);
    }
  });

program.parse();