import { describe, it, expect } from 'vitest';
import { CoreProcessor } from '../src/core/processor';
import { TransformOptions } from '../src/types';

describe('Import Merging Logic', () => {
  const processor = new CoreProcessor();

  it('should merge imports from the same source', () => {
    const code = `import { a } from 'lib';
console.log('hello');`;
    const options: TransformOptions = {
      i18nConfig: {
        i18nImport: {
          source: 'lib',
          name: 'b',
          mergeImports: true,
        },
      },
    };
    
    const extractedStrings = [{ key: 'key1', value: 'hello', filePath: 'test.ts', line: 2, column: 12 }];
    const importReq = { source: 'lib', specifiers: [{ name: 'b' }] };

    const modifiedCode = (processor as any).addOrMergeImports(code, [importReq], 'test.ts');

    expect(modifiedCode.trim()).toBe(`import { a, b } from 'lib';
console.log('hello');`);
  });

  it('should add a new import if source is different', () => {
    const code = `import { a } from 'lib';
console.log('hello');`;
    const options: TransformOptions = {
      i18nConfig: {
        i18nImport: {
          source: 'other-lib',
          name: 'c',
          mergeImports: true,
        },
      },
    };

    const importReq = { source: 'other-lib', specifiers: [{ name: 'c' }] };
    const modifiedCode = (processor as any).addOrMergeImports(code, [importReq], 'test.ts');

    expect(modifiedCode.includes(`import { a } from 'lib';`)).toBe(true);
    expect(modifiedCode.includes(`import { c } from "other-lib";`)).toBe(true);
  });

  it('should not merge imports if mergeImports is false', () => {
    const code = `import { a } from 'lib';
console.log('hello');`;
    const options: TransformOptions = {
      i18nConfig: {
        i18nImport: {
          source: 'lib',
          name: 'b',
          mergeImports: false,
        },
      },
    };
    
    const importReq = { source: 'lib', specifiers: [{ name: 'b' }] };
    
    // We need to test addImportsAndHooks to check the flag
    const modifiedCode = (processor as any).addImportsAndHooks(code, [importReq], [], 'test.ts', options);

    expect(modifiedCode.includes(`import { a } from 'lib';`)).toBe(true);
    expect(modifiedCode.includes(`import { b } from "lib";`)).toBe(true);
  });

  it('should handle default and named imports merging', () => {
    const code = `import d from 'lib';
console.log('hello');`;
    const importReq = { source: 'lib', specifiers: [{ name: 'a' }] };
    const modifiedCode = (processor as any).addOrMergeImports(code, [importReq], 'test.ts');

    expect(modifiedCode.trim()).toBe(`import d, { a } from 'lib';
console.log('hello');`);
  });

  it('should handle adding a default import to existing named imports', () => {
    const code = `import { a } from 'lib';`;
    const importReq = { source: 'lib', specifiers: [{ name: 'd' }], isDefault: true };
    const modifiedCode = (processor as any).addOrMergeImports(code, [importReq], 'test.ts');
    expect(modifiedCode.trim()).toBe(`import d, { a } from 'lib';`);
  });

  it('should not add duplicate specifiers', () => {
    const code = `import { a } from 'lib';`;
    const importReq = { source: 'lib', specifiers: [{ name: 'a' }] };
    const modifiedCode = (processor as any).addOrMergeImports(code, [importReq], 'test.ts');
    expect(modifiedCode.trim()).toBe(code);
  });
});
