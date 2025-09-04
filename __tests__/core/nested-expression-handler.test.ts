/**
 * 嵌套表达式处理器的单元测试
 * 验证嵌套表达式处理逻辑的正确性
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import {
  processNestedExpressionsInTemplate,
  processNestedStringLiteral,
  processNestedTemplateLiteral,
  processConditionalExpression,
  processConditionalStringLiteral,
  NestedNodeCollector,
  OptimizedNestedExpressionHandler,
} from '../../src/core/nested-expression-handler';
import type { SharedProcessingContext } from '../../src/core/shared-context';

// Mock SharedProcessingContext
function createMockContext(): SharedProcessingContext {
  return {
    patternRegex: /___(.+)___/g,
    options: {
      pattern: '___(.+)___',
      appendExtractedComment: false,
    } as any,
    filePath: '/test/file.js',
    existingValueToKey: new Map(),
    generatedKeysMap: new Map(),
    extractedStrings: [],
    usedExistingKeysList: [],
    getContextInfo: () => ({ framework: 'react' } as any),
    getImportInfoForContext: () => ({ callName: 't' } as any),
    smartCallFactory: (callName, key) => t.callExpression(t.identifier(callName), [t.stringLiteral(String(key))]),
    recordPendingReplacement: () => {},
    buildTemplateLiteral: (parts, expressions) => t.templateLiteral(
      parts.map((part, i) => t.templateElement({ raw: part, cooked: part }, i === parts.length - 1)),
      expressions
    ),
  };
}

// Mock NodePath
function createMockPath<T extends t.Node>(node: T): NodePath<T> {
  return {
    node,
    replaceWith: (newNode: t.Node) => {
      // Mock implementation - in real scenario this would replace the node
      return [newNode] as any;
    },
    parent: undefined as any,
  } as any;
}

describe('Nested Expression Handler', () => {
  let mockContext: SharedProcessingContext;

  beforeEach(() => {
    mockContext = createMockContext();
  });

  describe('processNestedExpressionsInTemplate', () => {
    it('should process expressions without nested strings', () => {
      const expressions = [
        t.identifier('user'),
        t.memberExpression(t.identifier('data'), t.identifier('count')),
      ];

      const path = createMockPath(t.templateLiteral(
        [t.templateElement({ raw: 'test', cooked: 'test' }, true)],
        []
      ));
      const result = processNestedExpressionsInTemplate(expressions, mockContext, 't', path);

      expect(result).toHaveLength(2);
      expect(result[0]).toStrictEqual(expressions[0]);
      expect(result[1]).toStrictEqual(expressions[1]);
    });

    it('should process expressions with nested string literals', () => {
      const nestedString = t.stringLiteral('___hello___');
      const expressions = [nestedString, t.identifier('user')];

      const path = createMockPath(t.templateLiteral(
        [t.templateElement({ raw: 'test', cooked: 'test' }, true)],
        []
      ));
      const result = processNestedExpressionsInTemplate(expressions, mockContext, 't', path);

      expect(result).toHaveLength(2);
      // 第一个表达式应该被处理（包含匹配的字符串）
      // 第二个表达式应该保持不变
      expect(result[1]).toStrictEqual(expressions[1]);
    });

    it('should filter out non-expression types', () => {
      const expressions = [
        t.identifier('user'),
        t.tsStringKeyword() as any, // TypeScript类型，应该被过滤掉
      ];

      const path = createMockPath(t.templateLiteral(
        [t.templateElement({ raw: 'test', cooked: 'test' }, true)],
        []
      ));
      const result = processNestedExpressionsInTemplate(expressions, mockContext, 't', path);

      expect(result).toHaveLength(1);
      expect(result[0]).toStrictEqual(expressions[0]);
    });
  });

  describe('processNestedStringLiteral', () => {
    it('should replace matching string literal', () => {
      const stringNode = t.stringLiteral('___hello___');
      const path = createMockPath(stringNode);
      let replaced = false;
      
      path.replaceWith = (newNode: t.Node) => {
        expect(t.isCallExpression(newNode)).toBe(true);
        replaced = true;
        return [newNode] as any;
      };

      processNestedStringLiteral(path, mockContext, 't');
      expect(replaced).toBe(true);
    });

    it('should not replace non-matching string literal', () => {
      const stringNode = t.stringLiteral('regular string');
      const path = createMockPath(stringNode);
      let replaced = false;
      
      path.replaceWith = () => {
        replaced = true;
        return [] as any;
      };

      processNestedStringLiteral(path, mockContext, 't');
      expect(replaced).toBe(false);
    });
  });

  describe('processNestedTemplateLiteral', () => {
    it('should process template literal with expressions', () => {
      const template = t.templateLiteral(
        [
          t.templateElement({ raw: '___hello ', cooked: '___hello ' }, false),
          t.templateElement({ raw: '___', cooked: '___' }, true),
        ],
        [t.identifier('world')]
      );
      
      const path = createMockPath(template);
      let replaced = false;
      
      path.replaceWith = (newNode: t.Node) => {
        expect(t.isExpression(newNode)).toBe(true);
        replaced = true;
        return [newNode] as any;
      };

      processNestedTemplateLiteral(path, mockContext, 't');
      expect(replaced).toBe(true);
    });

    it('should skip tagged template literals', () => {
      const template = t.templateLiteral(
        [t.templateElement({ raw: '', cooked: '' }, true)],
        []
      );
      const tagged = t.taggedTemplateExpression(t.identifier('css'), template);
      const path = createMockPath(template);
      path.parent = tagged;
      
      let replaced = false;
      path.replaceWith = () => {
        replaced = true;
        return [] as any;
      };

      processNestedTemplateLiteral(path, mockContext, 't');
      expect(replaced).toBe(false);
    });

    it('should not process template literal without expressions', () => {
      const template = t.templateLiteral(
        [t.templateElement({ raw: 'no expressions', cooked: 'no expressions' }, true)],
        []
      );
      
      const path = createMockPath(template);
      let replaced = false;
      
      path.replaceWith = () => {
        replaced = true;
        return [] as any;
      };

      processNestedTemplateLiteral(path, mockContext, 't');
      expect(replaced).toBe(false);
    });
  });

  describe('processConditionalExpression', () => {
    it('should process conditional expression with string literals', () => {
      const conditional = t.conditionalExpression(
        t.identifier('condition'),
        t.stringLiteral('___true___'),
        t.stringLiteral('___false___')
      );

      const result = processConditionalExpression(conditional, mockContext, 't');

      expect(t.isConditionalExpression(result)).toBe(true);
      expect(result.test).toBe(conditional.test);
      // consequent和alternate应该被处理
      expect(t.isCallExpression(result.consequent)).toBe(true);
      expect(t.isCallExpression(result.alternate)).toBe(true);
    });

    it('should not process conditional expression without matching strings', () => {
      const conditional = t.conditionalExpression(
        t.identifier('condition'),
        t.stringLiteral('true'),
        t.stringLiteral('false')
      );

      const result = processConditionalExpression(conditional, mockContext, 't');

      expect(t.isConditionalExpression(result)).toBe(true);
      expect(result.consequent).toBe(conditional.consequent);
      expect(result.alternate).toBe(conditional.alternate);
    });
  });

  describe('processConditionalStringLiteral', () => {
    it('should replace matching string literal', () => {
      const stringLiteral = t.stringLiteral('___hello___');
      const result = processConditionalStringLiteral(stringLiteral, mockContext, 't');

      expect(t.isCallExpression(result)).toBe(true);
      const call = result as t.CallExpression;
      expect(t.isIdentifier(call.callee) && call.callee.name).toBe('t');
    });

    it('should return original string literal if no match', () => {
      const stringLiteral = t.stringLiteral('regular string');
      const result = processConditionalStringLiteral(stringLiteral, mockContext, 't');

      expect(result).toBe(stringLiteral);
    });
  });

  describe('NestedNodeCollector', () => {
    let collector: NestedNodeCollector;

    beforeEach(() => {
      collector = new NestedNodeCollector();
    });

    it('should collect nested nodes from expression', () => {
      const expr = t.stringLiteral('___test___');
      const nestedNodes = collector.collectNestedNodes(expr, '/test/file.js');

      expect(nestedNodes).toHaveLength(1);
      expect(nestedNodes[0].nodeType).toBe('StringLiteral');
      expect(nestedNodes[0].value).toBe('___test___');
    });

    it('should not collect non-matching nodes', () => {
      const expr = t.stringLiteral('regular string');
      const nestedNodes = collector.collectNestedNodes(expr, '/test/file.js');

      // 收集器会收集所有节点，但在处理时才会过滤
      expect(nestedNodes).toHaveLength(1);
      expect(nestedNodes[0].value).toBe('regular string');
    });

    it('should process collected nodes', () => {
      const nestedNodes = [
        {
          node: t.stringLiteral('___hello___'),
          nodeType: 'StringLiteral',
          value: '___hello___',
          location: { filePath: '/test/file.js', line: 1, column: 0 },
          parentPath: null as any,
        },
      ];

      const context = {
        ...mockContext,
        pattern: mockContext.patternRegex,
        importCallName: 't',
        filePath: '/test/file.js',
      };

      const result = collector.processCollectedNodes(nestedNodes, context);

      expect(result.hasNestedMatches).toBe(true);
      expect(result.extractedKeys).toHaveLength(1);
      expect(result.processedExpressions).toHaveLength(1);
    });
  });

  describe('OptimizedNestedExpressionHandler', () => {
    let handler: OptimizedNestedExpressionHandler;

    beforeEach(() => {
      handler = new OptimizedNestedExpressionHandler();
    });

    it('should process template expressions with optimization', () => {
      const expressions = [
        t.stringLiteral('___hello___'),
        t.identifier('user'),
      ];

      const result = handler.processTemplateExpressions(expressions, mockContext, 't');

      expect(result.processedExpressions).toHaveLength(2);
      expect(result.hasNestedMatches).toBe(true);
      expect(result.extractedKeys.length).toBeGreaterThan(0);
    });

    it('should handle expressions without nested content', () => {
      const expressions = [
        t.identifier('user'),
        t.memberExpression(t.identifier('data'), t.identifier('count')),
      ];

      const result = handler.processTemplateExpressions(expressions, mockContext, 't');

      expect(result.processedExpressions).toHaveLength(2);
      expect(result.hasNestedMatches).toBe(false);
      expect(result.extractedKeys).toHaveLength(0);
    });
  });
});