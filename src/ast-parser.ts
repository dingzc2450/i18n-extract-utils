import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { ExtractedString, TransformOptions } from './types';
import fs from 'fs';

const DEFAULT_PATTERN = /___(.+)___/g;

export function extractStringsFromCode(code: string, filePath: string, options?: TransformOptions): ExtractedString[] {
  const extractedStrings: ExtractedString[] = [];
  const pattern = options?.pattern ? new RegExp(options.pattern, 'g') : DEFAULT_PATTERN;
  
  let match;
  while ((match = pattern.exec(code)) !== null) {
    const value = match[1];
    const startIndex = match.index;
    
    // 计算行和列
    const upToMatch = code.slice(0, startIndex);
    const lines = upToMatch.split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;
    
    extractedStrings.push({
      value,
      filePath,
      line,
      column
    });
  }
  
  return extractedStrings;
}

export function hasTranslationHook(code: string, hookName: string = 'useTranslation'): boolean {
  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript']
    });
    
    let hasHook = false;
    
    traverse(ast, {
      CallExpression(path) {
        if (t.isIdentifier(path.node.callee) && path.node.callee.name === hookName) {
          hasHook = true;
          path.stop();
        }
      }
    });
    
    return hasHook;
  } catch (error) {
    console.error(`Error analyzing code: ${error}`);
    return false;
  }
}

export function transformCode(filePath: string, options: TransformOptions): { code: string, extractedStrings: ExtractedString[] } {
  const code = fs.readFileSync(filePath, 'utf8');
  const extractedStrings = extractStringsFromCode(code, filePath, options);
  
  const translationMethod = options.translationMethod || 't';
  const hookName = options.hookName || 'useTranslation';
  const hookImport = options.hookImport || 'react-i18next';
  
  // 如果没有需要翻译的字符串，直接返回原代码
  if (extractedStrings.length === 0) {
    return { code, extractedStrings };
  }
  
  let transformedCode = code;
  const pattern = options?.pattern ? new RegExp(options.pattern, 'g') : DEFAULT_PATTERN;
  
  // 替换匹配的模式为翻译方法调用
  transformedCode = transformedCode.replace(pattern, `${translationMethod}("$1")`);
  
  // 检查是否已经导入和使用了hook
  const hasHook = hasTranslationHook(code, hookName);
  
  // 如果没有hook，添加它
  if (!hasHook) {
    try {
      const ast = parse(transformedCode, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript']
      });
      
      let hasImport = false;
      
      // 检查是否有导入语句
      traverse(ast, {
        ImportDeclaration(path) {
          if (path.node.source.value === hookImport) {
            hasImport = true;
            
            // 检查是否已经导入了指定的hook
            const specifiers = path.node.specifiers;
            for (const specifier of specifiers) {
              if (
                t.isImportSpecifier(specifier) && 
                t.isIdentifier(specifier.imported) && 
                specifier.imported.name === hookName
              ) {
                return;
              }
            }
            
            // 如果没有导入指定的hook，修改导入语句
            path.stop();
          }
        }
      });
      
      // 添加导入语句（如果需要）
      if (!hasImport) {
        transformedCode = `import { ${hookName} } from '${hookImport}';\n${transformedCode}`;
      }
      
      // 找到合适的位置添加hook使用语句
      const componentAst = parse(transformedCode, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript']
      });
      
      let functionBodyStart: number | null = null;
      
      traverse(componentAst, {
        FunctionDeclaration(path) {
          if (path.node.body && t.isBlockStatement(path.node.body)) {
            functionBodyStart = path.node.body.start! + 1;
            path.stop();
          }
        },
        ArrowFunctionExpression(path) {
          if (path.node.body && t.isBlockStatement(path.node.body)) {
            functionBodyStart = path.node.body.start! + 1;
            path.stop();
          }
        },
        FunctionExpression(path) {
          if (path.node.body && t.isBlockStatement(path.node.body)) {
            functionBodyStart = path.node.body.start! + 1;
            path.stop();
          }
        }
      });
      
      if (functionBodyStart) {
        transformedCode = 
          transformedCode.slice(0, functionBodyStart) + 
          `\n  const { ${translationMethod} } = ${hookName}();\n` + 
          transformedCode.slice(functionBodyStart);
      }
      
    } catch (error) {
      console.error(`Error transforming code: ${error}`);
    }
  }
  
  return { code: transformedCode, extractedStrings };
}