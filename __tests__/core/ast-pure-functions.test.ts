/**
 * AST纯函数模块的单元测试
 * 验证重构后的纯函数功能正确性
 */

import { describe, it, expect } from 'vitest';
import * as t from '@babel/types';
import {
  createPatternMatcher,
  matchPattern,
  buildLocationInfo,
  buildTranslationCall,
  buildTemplateLiteral,
  buildInterpolationObject,
  buildPartialReplacement,
  generateJSXElementsCode,
  extractTemplateRawString,
  buildTemplateTextFromNode,
  hasMeaningfulContent,
  buildJSXAttribute,
  buildJSXExpressionContainer,
  buildJSXText,
} from '../../src/core/ast-pure-functions';

describe('AST Pure Functions', () => {
  describe('createPatternMatcher', () => {
    it('should create reusable pattern matcher', () => {
      const matcher = createPatternMatcher('___(.+?)___');
      const text = 'Hello ___world___ and ___universe___';
      
      const matches = matcher.matchAll(text);
      expect(matches).toHaveLength(2);
      expect(matches[0][1]).toBe('world');
      expect(matches[1][1]).toBe('universe');
      
      // 测试重置功能
      matcher.reset();
      const singleMatch = matcher.matchSingle(text);
      expect(singleMatch?.[1]).toBe('world');
    });

    it('should handle no matches', () => {
      const matcher = createPatternMatcher('___(.+)___');
      const text = 'Hello world';
      
      const matches = matcher.matchAll(text);
      expect(matches).toHaveLength(0);
      
      const singleMatch = matcher.matchSingle(text);
      expect(singleMatch).toBeNull();
    });
  });

  describe('matchPattern', () => {
    it('should analyze pattern matching results correctly', () => {
      const pattern = /___(.+)___/g;
      
      // 测试单个完整匹配
      const result1 = matchPattern('___hello___', pattern);
      expect(result1.hasMatch).toBe(true);
      expect(result1.isFullMatch).toBe(true);
      expect(result1.matches).toHaveLength(1);
      expect(result1.fullMatchStart).toBe(0);
      expect(result1.fullMatchEnd).toBe(11);
      
      // 测试部分匹配
      const result2 = matchPattern('before ___hello___ after', pattern);
      expect(result2.hasMatch).toBe(true);
      expect(result2.isFullMatch).toBe(false);
      expect(result2.matches).toHaveLength(1);
      
      // 测试多个匹配
      const result3 = matchPattern('___first___ and ___second___', /___(.+?)___/g);
      expect(result3.hasMatch).toBe(true);
      expect(result3.isFullMatch).toBe(false);
      expect(result3.matches).toHaveLength(2);
      
      // 测试无匹配
      const result4 = matchPattern('no match here', pattern);
      expect(result4.hasMatch).toBe(false);
      expect(result4.isFullMatch).toBe(false);
      expect(result4.matches).toHaveLength(0);
    });
  });

  describe('buildLocationInfo', () => {
    it('should build standard location info', () => {
      const params = { filePath: '/test/file.js', line: 10, column: 5 };
      const location = buildLocationInfo(params);
      
      expect(location).toEqual({
        filePath: '/test/file.js',
        line: 10,
        column: 5,
      });
    });

    it('should extract location from AST node', () => {
      const node = t.stringLiteral('test');
      node.loc = {
        start: { line: 5, column: 2, index: 0 },
        end: { line: 5, column: 8, index: 6 },
      } as t.SourceLocation;
      
      const params = { filePath: '/test/file.js' };
      const location = buildLocationInfo(params, node);
      
      expect(location).toEqual({
        filePath: '/test/file.js',
        line: 5,
        column: 2,
      });
    });

    it('should use default values when node has no location', () => {
      const node = t.stringLiteral('test');
      const params = { filePath: '/test/file.js' };
      const location = buildLocationInfo(params, node);
      
      expect(location).toEqual({
        filePath: '/test/file.js',
        line: 0,
        column: 0,
      });
    });
  });

  describe('buildTranslationCall', () => {
    it('should build simple translation call', () => {
      const call = buildTranslationCall('t', 'hello.world');
      
      expect(t.isCallExpression(call)).toBe(true);
      expect(t.isIdentifier(call.callee) && call.callee.name).toBe('t');
      expect(call.arguments).toHaveLength(1);
      expect(t.isStringLiteral(call.arguments[0]) && call.arguments[0].value).toBe('hello.world');
    });

    it('should build translation call with interpolations', () => {
      const interpolations = t.objectExpression([
        t.objectProperty(t.identifier('name'), t.identifier('user')),
      ]);
      
      const call = buildTranslationCall('t', 'hello.user', interpolations);
      
      expect(t.isCallExpression(call)).toBe(true);
      expect(call.arguments).toHaveLength(2);
      expect(call.arguments[1]).toBe(interpolations);
    });

    it('should handle numeric keys', () => {
      const call = buildTranslationCall('t', 123);
      
      expect(t.isCallExpression(call)).toBe(true);
      expect(t.isStringLiteral(call.arguments[0]) && call.arguments[0].value).toBe('123');
    });
  });

  describe('buildTemplateLiteral', () => {
    it('should build template literal with parts and expressions', () => {
      const parts = ['Hello ', ' world'];
      const expressions = [t.identifier('name')];
      
      const template = buildTemplateLiteral(parts, expressions);
      
      expect(t.isTemplateLiteral(template)).toBe(true);
      expect(template.quasis).toHaveLength(2);
      expect(template.expressions).toHaveLength(1);
      expect(template.quasis[0].value.raw).toBe('Hello ');
      expect(template.quasis[1].value.raw).toBe(' world');
      expect(template.quasis[1].tail).toBe(true);
    });

    it('should handle empty parts correctly', () => {
      const parts = ['', '', ''];
      const expressions = [t.identifier('a'), t.identifier('b')];
      
      const template = buildTemplateLiteral(parts, expressions);
      
      expect(template.quasis).toHaveLength(3);
      expect(template.expressions).toHaveLength(2);
      expect(template.quasis.every(q => q.value.raw === '')).toBe(true);
    });
  });

  describe('buildInterpolationObject', () => {
    it('should build interpolation object from expressions', () => {
      const expressions = [
        t.identifier('user'),
        t.memberExpression(t.identifier('data'), t.identifier('count')),
      ];
      
      const obj = buildInterpolationObject(expressions);
      
      expect(t.isObjectExpression(obj)).toBe(true);
      expect(obj.properties).toHaveLength(2);
      
      const prop1 = obj.properties[0] as t.ObjectProperty;
      expect(t.isIdentifier(prop1.key) && prop1.key.name).toBe('arg1');
      expect(prop1.value).toBe(expressions[0]);
      
      const prop2 = obj.properties[1] as t.ObjectProperty;
      expect(t.isIdentifier(prop2.key) && prop2.key.name).toBe('arg2');
      expect(prop2.value).toBe(expressions[1]);
    });

    it('should handle empty expressions array', () => {
      const obj = buildInterpolationObject([]);
      
      expect(t.isObjectExpression(obj)).toBe(true);
      expect(obj.properties).toHaveLength(0);
    });
  });

  describe('buildJSXAttribute', () => {
    it('should build JSX attribute with expression container', () => {
      const attrName = t.jsxIdentifier('title');
      const callExpr = t.callExpression(t.identifier('t'), [t.stringLiteral('hello')]);
      
      const attr = buildJSXAttribute(attrName, callExpr);
      
      expect(t.isJSXAttribute(attr)).toBe(true);
      expect(attr.name).toBe(attrName);
      expect(t.isJSXExpressionContainer(attr.value)).toBe(true);
      
      const container = attr.value as t.JSXExpressionContainer;
      expect(container.expression).toBe(callExpr);
    });
  });

  describe('buildJSXExpressionContainer', () => {
    it('should build JSX expression container', () => {
      const expr = t.callExpression(t.identifier('t'), [t.stringLiteral('hello')]);
      const container = buildJSXExpressionContainer(expr);
      
      expect(t.isJSXExpressionContainer(container)).toBe(true);
      expect(container.expression).toBe(expr);
    });
  });

  describe('buildJSXText', () => {
    it('should build JSX text node', () => {
      const text = buildJSXText('Hello World');
      
      expect(t.isJSXText(text)).toBe(true);
      expect(text.value).toBe('Hello World');
    });
  });

  describe('buildPartialReplacement', () => {
    it('should return single expression for full match', () => {
      const matches = [{ 0: '___hello___', 1: 'hello', index: 0, input: '___hello___', groups: undefined, length: 2 } as unknown as RegExpMatchArray];
      const callExpressions = [t.callExpression(t.identifier('t'), [t.stringLiteral('hello')])];
      
      const result = buildPartialReplacement('___hello___', matches, callExpressions);
      
      expect(result).toBe(callExpressions[0]);
    });

    it('should build template literal for partial match', () => {
      const matches = [{ 0: '___hello___', 1: 'hello', index: 7, input: 'before ___hello___ after', groups: undefined, length: 2 } as unknown as RegExpMatchArray];
      const callExpressions = [t.callExpression(t.identifier('t'), [t.stringLiteral('hello')])];
      
      const result = buildPartialReplacement('before ___hello___ after', matches, callExpressions);
      
      expect(t.isTemplateLiteral(result)).toBe(true);
      const template = result as t.TemplateLiteral;
      expect(template.quasis).toHaveLength(2);
      expect(template.quasis[0].value.raw).toBe('before ');
      expect(template.quasis[1].value.raw).toBe(' after');
      expect(template.expressions).toHaveLength(1);
      expect(template.expressions[0]).toBe(callExpressions[0]);
    });

    it('should handle multiple matches', () => {
      const matches = [
        { 0: '___first___', 1: 'first', index: 0, input: '___first___ and ___second___', groups: undefined, length: 2 } as unknown as RegExpMatchArray,
        { 0: '___second___', 1: 'second', index: 16, input: '___first___ and ___second___', groups: undefined, length: 2 } as unknown as RegExpMatchArray,
      ];
      const callExpressions = [
        t.callExpression(t.identifier('t'), [t.stringLiteral('first')]),
        t.callExpression(t.identifier('t'), [t.stringLiteral('second')]),
      ];
      
      const result = buildPartialReplacement('___first___ and ___second___', matches, callExpressions);
      
      expect(t.isTemplateLiteral(result)).toBe(true);
      const template = result as t.TemplateLiteral;
      expect(template.quasis).toHaveLength(3);
      expect(template.quasis[0].value.raw).toBe('');
      expect(template.quasis[1].value.raw).toBe(' and ');
      expect(template.quasis[2].value.raw).toBe('');
      expect(template.expressions).toHaveLength(2);
    });

    it('should throw error for empty matches', () => {
      expect(() => {
        buildPartialReplacement('test', [], []);
      }).toThrow('No matches provided for partial replacement');
    });
  });

  describe('generateJSXElementsCode', () => {
    it('should handle empty array', () => {
      const result = generateJSXElementsCode([]);
      expect(result).toBe('');
    });

    it('should handle single JSX text element', () => {
      const elements = [t.jsxText('Hello World')];
      const result = generateJSXElementsCode(elements);
      expect(result).toBe('Hello World');
    });

    it('should handle single non-text element', () => {
      const elements = [t.jsxExpressionContainer(t.identifier('test'))];
      const result = generateJSXElementsCode(elements, { compact: true });
      expect(result).toBe('{test}');
    });

    it('should handle mixed JSX elements', () => {
      const elements = [
        t.jsxText('Hello '),
        t.jsxExpressionContainer(t.identifier('name')),
        t.jsxText('!'),
      ];
      const result = generateJSXElementsCode(elements, { compact: true });
      expect(result).toBe('Hello {name}!');
    });
  });

  describe('extractTemplateRawString', () => {
    it('should extract raw string from template literal', () => {
      const template = t.templateLiteral(
        [
          t.templateElement({ raw: 'Hello ', cooked: 'Hello ' }, false),
          t.templateElement({ raw: ' world', cooked: ' world' }, true),
        ],
        [t.identifier('name')]
      );
      
      const result = extractTemplateRawString(template);
      expect(result).toBe('Hello ${...} world');
    });

    it('should handle template without expressions', () => {
      const template = t.templateLiteral(
        [t.templateElement({ raw: 'Hello world', cooked: 'Hello world' }, true)],
        []
      );
      
      const result = extractTemplateRawString(template);
      expect(result).toBe('Hello world');
    });

    it('should handle multiple expressions', () => {
      const template = t.templateLiteral(
        [
          t.templateElement({ raw: '', cooked: '' }, false),
          t.templateElement({ raw: ' and ', cooked: ' and ' }, false),
          t.templateElement({ raw: '', cooked: '' }, true),
        ],
        [t.identifier('first'), t.identifier('second')]
      );
      
      const result = extractTemplateRawString(template);
      expect(result).toBe('${...} and ${...}');
    });
  });

  describe('buildTemplateTextFromNode', () => {
    it('should build template text same as extractTemplateRawString', () => {
      const template = t.templateLiteral(
        [
          t.templateElement({ raw: 'Hello ', cooked: 'Hello ' }, false),
          t.templateElement({ raw: ' world', cooked: ' world' }, true),
        ],
        [t.identifier('name')]
      );
      
      const result1 = buildTemplateTextFromNode(template);
      const result2 = extractTemplateRawString(template);
      expect(result1).toBe(result2);
      expect(result1).toBe('Hello ${...} world');
    });
  });

  describe('hasMeaningfulContent', () => {
    it('should detect meaningful content', () => {
      expect(hasMeaningfulContent('hello')).toBe(true);
      expect(hasMeaningfulContent('  hello  ')).toBe(true);
      expect(hasMeaningfulContent('h')).toBe(true);
      expect(hasMeaningfulContent('123')).toBe(true);
      expect(hasMeaningfulContent('!@#')).toBe(true);
    });

    it('should detect non-meaningful content', () => {
      expect(hasMeaningfulContent('')).toBe(false);
      expect(hasMeaningfulContent('   ')).toBe(false);
      expect(hasMeaningfulContent('\t\n\r')).toBe(false);
      expect(hasMeaningfulContent('  \t  \n  ')).toBe(false);
    });
  });
});