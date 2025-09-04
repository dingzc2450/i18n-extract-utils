/**
 * 节点处理器模块的单元测试
 * 验证节点处理器的功能正确性
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import {
  NodeProcessorFactory,
  StringLiteralProcessor,
  JSXAttributeProcessor,
  JSXTextProcessor,
  TemplateLiteralProcessor,
} from '../../src/core/node-processors';

// Mock NodePath
function createMockPath<T extends t.Node>(node: T, parent?: t.Node): NodePath<T> {
  return {
    node,
    parent,
    listKey: 'body',
    hub: {
      file: {
        metadata: {
          pattern: '___(.+)___'
        }
      }
    }
  } as any;
}

describe('Node Processors', () => {
  describe('NodeProcessorFactory', () => {
    it('should get processor for supported node types', () => {
      expect(NodeProcessorFactory.getProcessor('StringLiteral')).toBeInstanceOf(StringLiteralProcessor);
      expect(NodeProcessorFactory.getProcessor('JSXAttribute')).toBeInstanceOf(JSXAttributeProcessor);
      expect(NodeProcessorFactory.getProcessor('JSXText')).toBeInstanceOf(JSXTextProcessor);
      expect(NodeProcessorFactory.getProcessor('TemplateLiteral')).toBeInstanceOf(TemplateLiteralProcessor);
    });

    it('should return undefined for unsupported node types', () => {
      expect(NodeProcessorFactory.getProcessor('UnknownType')).toBeUndefined();
    });

    it('should get processor for AST node', () => {
      const stringNode = t.stringLiteral('test');
      const processor = NodeProcessorFactory.getProcessorForNode(stringNode);
      expect(processor).toBeInstanceOf(StringLiteralProcessor);
    });

    it('should get supported node types', () => {
      const types = NodeProcessorFactory.getSupportedNodeTypes();
      expect(types).toContain('StringLiteral');
      expect(types).toContain('JSXAttribute');
      expect(types).toContain('JSXText');
      expect(types).toContain('TemplateLiteral');
    });

    it('should register new processor', () => {
      class TestProcessor {
        readonly nodeType = 'TestNode';
        extractValue = () => 'test';
        shouldSkip = () => false;
        buildReplacement = {
          single: (expr: any) => expr,
          multiple: (expr: any) => expr
        };
      }

      NodeProcessorFactory.registerProcessor('TestNode', new TestProcessor() as any);
      expect(NodeProcessorFactory.getProcessor('TestNode')).toBeInstanceOf(TestProcessor);
    });
  });

  describe('StringLiteralProcessor', () => {
    let processor: StringLiteralProcessor;

    beforeEach(() => {
      processor = new StringLiteralProcessor();
    });

    it('should extract value from string literal', () => {
      const node = t.stringLiteral('Hello World');
      expect(processor.extractValue(node)).toBe('Hello World');
    });

    it('should skip translation function arguments', () => {
      const callExpr = t.callExpression(t.identifier('t'), [t.stringLiteral('test')]);
      const stringNode = callExpr.arguments[0] as t.StringLiteral;
      const path = createMockPath(stringNode, callExpr);
      path.listKey = 'arguments';

      expect(processor.shouldSkip(path, 't')).toBe(true);
    });

    it('should skip JSX attribute strings', () => {
      const jsxAttr = t.jsxAttribute(t.jsxIdentifier('title'), t.stringLiteral('test'));
      const stringNode = jsxAttr.value as t.StringLiteral;
      const path = createMockPath(stringNode, jsxAttr);

      expect(processor.shouldSkip(path, 't')).toBe(true);
    });

    it('should skip import/export strings', () => {
      const importDecl = t.importDeclaration([], t.stringLiteral('./module'));
      const stringNode = importDecl.source;
      const path = createMockPath(stringNode, importDecl);

      expect(processor.shouldSkip(path, 't')).toBe(true);
    });

    it('should not skip regular strings', () => {
      const stringNode = t.stringLiteral('Hello World');
      const path = createMockPath(stringNode);

      expect(processor.shouldSkip(path, 't')).toBe(false);
    });

    it('should build replacement for full match', () => {
      const callExpr = t.callExpression(t.identifier('t'), [t.stringLiteral('hello')]);
      const stringNode = t.stringLiteral('___Hello___');
      const path = createMockPath(stringNode);

      const result = processor.buildReplacement.single(callExpr, true, '___Hello___', path);
      expect(result).toBe(callExpr);
    });

    it('should build template literal for partial match', () => {
      const callExpr = t.callExpression(t.identifier('t'), [t.stringLiteral('hello')]);
      const stringNode = t.stringLiteral('before ___Hello___ after');
      const path = createMockPath(stringNode);

      const result = processor.buildReplacement.single(callExpr, false, 'before ___Hello___ after', path);
      expect(t.isTemplateLiteral(result as t.Node) || t.isExpression(result as t.Node) || Array.isArray(result)).toBe(true);
    });

    it('should return template literal for multiple replacement', () => {
      const template = t.templateLiteral(
        [t.templateElement({ raw: 'test', cooked: 'test' }, true)],
        []
      );
      const stringNode = t.stringLiteral('test');
      const path = createMockPath(stringNode);

      const result = processor.buildReplacement.multiple(template);
      expect(result).toBe(template);
    });
  });

  describe('JSXAttributeProcessor', () => {
    let processor: JSXAttributeProcessor;

    beforeEach(() => {
      processor = new JSXAttributeProcessor();
    });

    it('should extract value from JSX attribute with string literal', () => {
      const attr = t.jsxAttribute(t.jsxIdentifier('title'), t.stringLiteral('Hello'));
      expect(processor.extractValue(attr)).toBe('Hello');
    });

    it('should return empty string for non-string JSX attribute', () => {
      const attr = t.jsxAttribute(t.jsxIdentifier('onClick'), t.jsxExpressionContainer(t.identifier('handler')));
      expect(processor.extractValue(attr)).toBe('');
    });

    it('should skip non-JSX attributes', () => {
      const node = t.stringLiteral('test') as any;
      const path = createMockPath(node);

      expect(processor.shouldSkip(path)).toBe(true);
    });

    it('should skip JSX attributes without string values', () => {
      const attr = t.jsxAttribute(t.jsxIdentifier('onClick'), t.jsxExpressionContainer(t.identifier('handler')));
      const path = createMockPath(attr);

      expect(processor.shouldSkip(path)).toBe(true);
    });

    it('should not skip valid JSX attributes with string values', () => {
      const attr = t.jsxAttribute(t.jsxIdentifier('title'), t.stringLiteral('Hello'));
      const path = createMockPath(attr);

      expect(processor.shouldSkip(path)).toBe(false);
    });

    it('should build JSX attribute replacement', () => {
      const callExpr = t.callExpression(t.identifier('t'), [t.stringLiteral('hello')]);
      const attr = t.jsxAttribute(t.jsxIdentifier('title'), t.stringLiteral('___Hello___'));
      const path = createMockPath(attr);

      const result = processor.buildReplacement.single(callExpr, true, '___Hello___', path);
      
      expect(t.isJSXAttribute(result as t.Node)).toBe(true);
      const jsxAttr = result as t.JSXAttribute;
      expect(jsxAttr.name).toBe(attr.name);
      expect(t.isJSXExpressionContainer(jsxAttr.value)).toBe(true);
    });

    it('should build JSX attribute replacement for template literal', () => {
      const template = t.templateLiteral(
        [t.templateElement({ raw: 'test', cooked: 'test' }, true)],
        []
      );
      const attr = t.jsxAttribute(t.jsxIdentifier('title'), t.stringLiteral('test'));
      const path = createMockPath(attr);

      const result = processor.buildReplacement.multiple(template, path);
      
      expect(t.isJSXAttribute(result as t.Node)).toBe(true);
      const jsxAttr = result as t.JSXAttribute;
      expect(t.isJSXExpressionContainer(jsxAttr.value)).toBe(true);
      const container = jsxAttr.value as t.JSXExpressionContainer;
      expect(container.expression).toBe(template);
    });
  });

  describe('JSXTextProcessor', () => {
    let processor: JSXTextProcessor;

    beforeEach(() => {
      processor = new JSXTextProcessor();
    });

    it('should extract value from JSX text', () => {
      const text = t.jsxText('Hello World');
      expect(processor.extractValue(text)).toBe('Hello World');
    });

    it('should skip empty JSX text', () => {
      const text = t.jsxText('   ');
      const path = createMockPath(text);

      expect(processor.shouldSkip(path)).toBe(true);
    });

    it('should not skip meaningful JSX text', () => {
      const text = t.jsxText('Hello World');
      const path = createMockPath(text);

      expect(processor.shouldSkip(path)).toBe(false);
    });

    it('should build JSX expression container replacement', () => {
      const callExpr = t.callExpression(t.identifier('t'), [t.stringLiteral('hello')]);
      const text = t.jsxText('___Hello___');
      const path = createMockPath(text);
      
      // 创建模拟的共享上下文
      const mockContext = {
        patternRegex: /___(.+)___/g
      } as any;

      const result = processor.buildReplacement.single(callExpr, true, '___Hello___', path, mockContext);
      
      expect(t.isJSXExpressionContainer(result as t.Node) || Array.isArray(result)).toBe(true);
    });

    it('should build multiple JSX elements for multiple matches', () => {
      const template = t.templateLiteral(
        [t.templateElement({ raw: 'test', cooked: 'test' }, true)],
        []
      );
      const text = t.jsxText('___first___ and ___second___');
      const path = createMockPath(text);
      
      // 创建模拟的共享上下文
      const mockContext = {
        patternRegex: /___(.+?)___/g
      } as any;

      const result = processor.buildReplacement.multiple(template, path, mockContext);
      
      // 结果应该是单个元素或元素数组
      expect(t.isNode(result as t.Node) || Array.isArray(result)).toBe(true);
    });
  });

  describe('TemplateLiteralProcessor', () => {
    let processor: TemplateLiteralProcessor;

    beforeEach(() => {
      processor = new TemplateLiteralProcessor();
    });

    it('should extract value from template literal', () => {
      const template = t.templateLiteral(
        [
          t.templateElement({ raw: 'Hello ', cooked: 'Hello ' }, false),
          t.templateElement({ raw: ' world', cooked: ' world' }, true),
        ],
        [t.identifier('name')]
      );
      
      expect(processor.extractValue(template)).toBe('Hello  world');
    });

    it('should skip tagged template literals', () => {
      const template = t.templateLiteral(
        [t.templateElement({ raw: 'test', cooked: 'test' }, true)],
        []
      );
      const tagged = t.taggedTemplateExpression(t.identifier('css'), template);
      const path = createMockPath(template, tagged);

      expect(processor.shouldSkip(path)).toBe(true);
    });

    it('should not skip regular template literals', () => {
      const template = t.templateLiteral(
        [t.templateElement({ raw: 'test', cooked: 'test' }, true)],
        []
      );
      const path = createMockPath(template);

      expect(processor.shouldSkip(path)).toBe(false);
    });

    it('should build replacement for full match', () => {
      const callExpr = t.callExpression(t.identifier('t'), [t.stringLiteral('hello')]);
      const template = t.templateLiteral(
        [t.templateElement({ raw: 'test', cooked: 'test' }, true)],
        []
      );
      const path = createMockPath(template);

      const result = processor.buildReplacement.single(callExpr, true, 'test', path);
      expect(result).toBe(callExpr);
    });

    it('should return template literal for multiple replacement', () => {
      const template = t.templateLiteral(
        [t.templateElement({ raw: 'test', cooked: 'test' }, true)],
        []
      );
      const originalTemplate = t.templateLiteral(
        [t.templateElement({ raw: 'original', cooked: 'original' }, true)],
        []
      );
      const path = createMockPath(originalTemplate);

      const result = processor.buildReplacement.multiple(template, path);
      expect(result).toBe(template);
    });
  });
});