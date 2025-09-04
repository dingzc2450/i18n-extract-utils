/**
 * 重构后AST替换器的集成测试
 * 验证重构后的功能与原始功能保持一致
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@babel/parser';
import { collectContextAwareReplacementInfo } from '../../src/context-aware-ast-replacer';
import type { SmartImportManager, ImportInfo } from '../../src/smart-import-manager';
import type { ContextInfo } from '../../src/context-detector';
import type { NormalizedTransformOptions } from '../../src/core/config-normalizer';

// Mock SmartImportManager
class MockSmartImportManager implements SmartImportManager {
  getImportInfo(_context: ContextInfo): ImportInfo {
    return {
      callName: 't',
      importPath: 'react-i18next',
      importType: 'named',
    };
  }

  stringifyImport(importInfo: ImportInfo): string {
    return `import { ${importInfo.callName} } from '${importInfo.importPath}';`;
  }
}

describe('Refactored AST Replacer Integration Tests', () => {
  let importManager: SmartImportManager;
  let options: NormalizedTransformOptions;

  beforeEach(() => {
    importManager = new MockSmartImportManager();
    options = {
      pattern: '___(.+)___',
      appendExtractedComment: false,
      extractedCommentType: 'block',
      keyGenerator: 'default',
      keyGeneratorOptions: {},
      useExistingKeys: true,
    } as NormalizedTransformOptions;
  });

  describe('String Literal Processing', () => {
    it('should process simple string literals', () => {
      const code = `const message = '___Hello World___';`;
      const ast = parse(code, { sourceType: 'module' });
      
      const existingValueToKey = new Map<string, string | number>();
      const extractedStrings: any[] = [];
      const usedExistingKeysList: any[] = [];

      const result = collectContextAwareReplacementInfo(
        ast,
        code,
        existingValueToKey,
        extractedStrings,
        usedExistingKeysList,
        importManager,
        options,
        '/test/file.js'
      );

      expect(result.modified).toBe(true);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].replacement).toContain('t(');
      expect(extractedStrings).toHaveLength(1);
      expect(extractedStrings[0].value).toBe('Hello World');
    });

    it('should handle multiple string literals', () => {
      const code = `
        const greeting = '___Hello___';
        const farewell = '___Goodbye___';
      `;
      const ast = parse(code, { sourceType: 'module' });
      
      const existingValueToKey = new Map<string, string | number>();
      const extractedStrings: any[] = [];
      const usedExistingKeysList: any[] = [];

      const result = collectContextAwareReplacementInfo(
        ast,
        code,
        existingValueToKey,
        extractedStrings,
        usedExistingKeysList,
        importManager,
        options,
        '/test/file.js'
      );

      expect(result.modified).toBe(true);
      expect(result.changes).toHaveLength(2);
      expect(extractedStrings).toHaveLength(2);
    });

    it('should handle partial string replacement', () => {
      const code = `const message = 'Hello ___World___ today';`;
      const ast = parse(code, { sourceType: 'module' });
      
      const existingValueToKey = new Map<string, string | number>();
      const extractedStrings: any[] = [];
      const usedExistingKeysList: any[] = [];

      const result = collectContextAwareReplacementInfo(
        ast,
        code,
        existingValueToKey,
        extractedStrings,
        usedExistingKeysList,
        importManager,
        options,
        '/test/file.js'
      );

      expect(result.modified).toBe(true);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].replacement).toContain('`Hello ${t(');
      expect(extractedStrings).toHaveLength(1);
      expect(extractedStrings[0].value).toBe('World');
    });
  });

  describe('JSX Processing', () => {
    it('should process JSX attributes', () => {
      const code = `<div title="___Hello World___">Content</div>`;
      const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
      
      const existingValueToKey = new Map<string, string | number>();
      const extractedStrings: any[] = [];
      const usedExistingKeysList: any[] = [];

      const result = collectContextAwareReplacementInfo(
        ast,
        code,
        existingValueToKey,
        extractedStrings,
        usedExistingKeysList,
        importManager,
        options,
        '/test/file.js'
      );

      expect(result.modified).toBe(true);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].replacement).toContain('{t(');
      expect(extractedStrings).toHaveLength(1);
      expect(extractedStrings[0].value).toBe('Hello World');
    });

    it('should process JSX text content', () => {
      const code = `<div>___Hello World___</div>`;
      const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
      
      const existingValueToKey = new Map<string, string | number>();
      const extractedStrings: any[] = [];
      const usedExistingKeysList: any[] = [];

      const result = collectContextAwareReplacementInfo(
        ast,
        code,
        existingValueToKey,
        extractedStrings,
        usedExistingKeysList,
        importManager,
        options,
        '/test/file.js'
      );

      expect(result.modified).toBe(true);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].replacement).toContain('{t(');
      expect(extractedStrings).toHaveLength(1);
      expect(extractedStrings[0].value).toBe('Hello World');
    });

    it('should handle JSX text with surrounding content', () => {
      const code = `<div>Hello ___World___ today</div>`;
      const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
      
      const existingValueToKey = new Map<string, string | number>();
      const extractedStrings: any[] = [];
      const usedExistingKeysList: any[] = [];

      const result = collectContextAwareReplacementInfo(
        ast,
        code,
        existingValueToKey,
        extractedStrings,
        usedExistingKeysList,
        importManager,
        options,
        '/test/file.js'
      );

      expect(result.modified).toBe(true);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].replacement).toContain('Hello {t(');
      expect(result.changes[0].replacement).toContain('} today');
      expect(extractedStrings).toHaveLength(1);
      expect(extractedStrings[0].value).toBe('World');
    });
  });

  describe('Template Literal Processing', () => {
    it('should process simple template literals', () => {
      const code = 'const message = `___Hello World___`;';
      const ast = parse(code, { sourceType: 'module' });
      
      const existingValueToKey = new Map<string, string | number>();
      const extractedStrings: any[] = [];
      const usedExistingKeysList: any[] = [];

      const result = collectContextAwareReplacementInfo(
        ast,
        code,
        existingValueToKey,
        extractedStrings,
        usedExistingKeysList,
        importManager,
        options,
        '/test/file.js'
      );

      expect(result.modified).toBe(true);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].replacement).toContain('t(');
      expect(extractedStrings).toHaveLength(1);
      expect(extractedStrings[0].value).toBe('Hello World');
    });

    it('should process template literals with expressions', () => {
      const code = 'const message = `___Hello ${user.name}___`;';
      const ast = parse(code, { sourceType: 'module' });
      
      const existingValueToKey = new Map<string, string | number>();
      const extractedStrings: any[] = [];
      const usedExistingKeysList: any[] = [];

      const result = collectContextAwareReplacementInfo(
        ast,
        code,
        existingValueToKey,
        extractedStrings,
        usedExistingKeysList,
        importManager,
        options,
        '/test/file.js'
      );

      expect(result.modified).toBe(true);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].replacement).toContain('t(');
      expect(extractedStrings).toHaveLength(1);
      expect(extractedStrings[0].value).toBe('Hello {arg1}');
    });

    it('should skip tagged template literals', () => {
      const code = 'const styled = css`___color: red___`;';
      const ast = parse(code, { sourceType: 'module' });
      
      const existingValueToKey = new Map<string, string | number>();
      const extractedStrings: any[] = [];
      const usedExistingKeysList: any[] = [];

      const result = collectContextAwareReplacementInfo(
        ast,
        code,
        existingValueToKey,
        extractedStrings,
        usedExistingKeysList,
        importManager,
        options,
        '/test/file.js'
      );

      expect(result.modified).toBe(false);
      expect(result.changes).toHaveLength(0);
      expect(extractedStrings).toHaveLength(0);
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle files with no matching patterns', () => {
      const code = `
        const message = 'Hello World';
        const greeting = \`Welcome \${user.name}\`;
      `;
      const ast = parse(code, { sourceType: 'module' });
      
      const existingValueToKey = new Map<string, string | number>();
      const extractedStrings: any[] = [];
      const usedExistingKeysList: any[] = [];

      const result = collectContextAwareReplacementInfo(
        ast,
        code,
        existingValueToKey,
        extractedStrings,
        usedExistingKeysList,
        importManager,
        options,
        '/test/file.js'
      );

      expect(result.modified).toBe(false);
      expect(result.changes).toHaveLength(0);
      expect(extractedStrings).toHaveLength(0);
    });

    it('should handle complex nested structures', () => {
      const code = `
        const config = {
          messages: {
            greeting: '___Hello___',
            farewell: '___Goodbye___'
          },
          components: [
            <div title="___Title___">___Content___</div>
          ]
        };
      `;
      const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
      
      const existingValueToKey = new Map<string, string | number>();
      const extractedStrings: any[] = [];
      const usedExistingKeysList: any[] = [];

      const result = collectContextAwareReplacementInfo(
        ast,
        code,
        existingValueToKey,
        extractedStrings,
        usedExistingKeysList,
        importManager,
        options,
        '/test/file.js'
      );

      expect(result.modified).toBe(true);
      expect(result.changes.length).toBeGreaterThan(0);
      expect(extractedStrings.length).toBeGreaterThan(0);
      
      // 验证所有提取的字符串都是唯一的
      const extractedValues = extractedStrings.map(s => s.value);
      const uniqueValues = [...new Set(extractedValues)];
      expect(uniqueValues).toHaveLength(extractedValues.length);
    });

    it('should handle existing keys correctly', () => {
      const code = `const message = '___Hello World___';`;
      const ast = parse(code, { sourceType: 'module' });
      
      const existingValueToKey = new Map([['Hello World', 'existing.key']]);
      const extractedStrings: any[] = [];
      const usedExistingKeysList: any[] = [];

      const result = collectContextAwareReplacementInfo(
        ast,
        code,
        existingValueToKey,
        extractedStrings,
        usedExistingKeysList,
        importManager,
        options,
        '/test/file.js'
      );

      expect(result.modified).toBe(true);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].replacement).toContain('t(');
      expect(result.changes[0].replacement).toContain('"existing.key"');
      expect(usedExistingKeysList).toHaveLength(1);
    });
  });

  describe('Performance Monitoring', () => {
    it('should complete processing within reasonable time', () => {
      const code = `
        const messages = [
          '___Message 1___',
          '___Message 2___',
          '___Message 3___',
          '___Message 4___',
          '___Message 5___'
        ];
        
        const components = [
          <div title="___Title 1___">___Content 1___</div>,
          <div title="___Title 2___">___Content 2___</div>,
          <div title="___Title 3___">___Content 3___</div>
        ];
      `;
      
      const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
      
      const existingValueToKey = new Map<string, string | number>();
      const extractedStrings: any[] = [];
      const usedExistingKeysList: any[] = [];

      const startTime = performance.now();
      const result = collectContextAwareReplacementInfo(
        ast,
        code,
        existingValueToKey,
        extractedStrings,
        usedExistingKeysList,
        importManager,
        options,
        '/test/file.js'
      );
      const endTime = performance.now();

      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(1000); // 应该在1秒内完成
      expect(result.modified).toBe(true);
      expect(extractedStrings.length).toBeGreaterThan(5);
    });
  });
});