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

interface ReplacementInfo {
  start: number;
  end: number;
  replacement: string;
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
  
  // 使用 AST 来进行更精确的替换
  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      tokens: true,
      ranges: true,
    });
    
    // 存储所有需要替换的位置和替换内容
    const replacements: ReplacementInfo[] = [];
    
    traverse(ast, {
      // 处理 JSX 属性中的国际化文本
      JSXAttribute(path) {
        if (path.node.value && t.isStringLiteral(path.node.value)) {
          const value = path.node.value.value;
          const pattern = options?.pattern ? new RegExp(options.pattern) : DEFAULT_PATTERN;
          const match = pattern.exec(value);
          
          if (match) {
            const textToTranslate = match[1];
            // JSX 属性需要使用 {t('xxx')} 形式
            replacements.push({
              start: path.node.value.start!,
              end: path.node.value.end!,
              replacement: `{${translationMethod}('${textToTranslate}')}`
            });
          }
        }
      },
      
      // 处理字符串字面量中的国际化文本
      StringLiteral(path) {
        // 跳过已经在 JSX 属性中处理的情况
        if (path.parent && t.isJSXAttribute(path.parent)) {
          return;
        }
        
        const value = path.node.value;
        const pattern = options?.pattern ? new RegExp(options.pattern) : DEFAULT_PATTERN;
        const match = pattern.exec(value);
        
        if (match) {
          const textToTranslate = match[1];
          // 普通字符串直接替换为 t('xxx')
          replacements.push({
            start: path.node.start!,
            end: path.node.end!,
            replacement: `${translationMethod}('${textToTranslate}')`
          });
        }
      },
      
      // 处理 JSX 文本中的国际化文本
      JSXText(path) {
        const value = path.node.value;
        const pattern = options?.pattern ? new RegExp(options.pattern, 'g') : DEFAULT_PATTERN;
        let match;
        let lastIndex = 0;
        let newText = '';
        
        while ((match = pattern.exec(value)) !== null) {
          const textToTranslate = match[1];
          const matchStart = match.index;
          const matchEnd = matchStart + match[0].length;
          
          // 将前面的文本保留
          newText += value.substring(lastIndex, matchStart);
          // 添加翻译函数
          newText += `{${translationMethod}('${textToTranslate}')}`;
          
          lastIndex = matchEnd;
        }
        
        // 添加剩余的文本
        if (lastIndex > 0) {
          newText += value.substring(lastIndex);
          replacements.push({
            start: path.node.start!,
            end: path.node.end!,
            replacement: newText
          });
        }
      }
    });
    
    // 应用所有替换，从后往前替换，以避免位置偏移
    let transformedCode = code;
    replacements
      .sort((a, b) => b.start - a.start)
      .forEach(({ start, end, replacement }) => {
        transformedCode = 
          transformedCode.substring(0, start) + 
          replacement + 
          transformedCode.substring(end);
      });
    
    // 检查是否已经导入和使用了hook
    const hasHook = hasTranslationHook(code, hookName);
    
    // 如果没有hook，添加它
    if (!hasHook && replacements.length > 0) {
      const astAfterReplace = parse(transformedCode, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript']
      });
      
      let hasImport = false;
      
      // 检查是否有导入语句
      traverse(astAfterReplace, {
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
    }
    
    return { code: transformedCode, extractedStrings };
    
  } catch (error) {
    console.error(`Error performing AST-based transformation: ${error}`);
    console.error('Falling back to simple regex replacement');
    
    // 回退到基础替换方法
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
}