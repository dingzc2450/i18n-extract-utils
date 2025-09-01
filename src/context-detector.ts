import * as t from "@babel/types";
import type { NodePath } from "@babel/traverse";

/**
 * 代码上下文类型枚举
 */
export enum CodeContext {
  /** React 函数组件内部 */
  REACT_FUNCTION_COMPONENT = "react_function_component",
  /** React 类组件内部 */
  REACT_CLASS_COMPONENT = "react_class_component",
  /** React Hook 内部 */
  REACT_HOOK = "react_hook",
  /** 普通函数内部 */
  REGULAR_FUNCTION = "regular_function",
  /** 类方法内部 */
  CLASS_METHOD = "class_method",
  /** 模块级别/全局作用域 */
  MODULE_LEVEL = "module_level",
  /** 其他上下文 */
  OTHER = "other",
}

/**
 * 上下文检测结果
 */
export interface ContextInfo {
  /** 上下文类型 */
  type: CodeContext;
  /** 是否在 React 组件内部 */
  isReactComponent: boolean;
  /** 是否需要使用 Hook */
  needsHook: boolean;
  /** 组件或函数名称（如果有的话） */
  functionName?: string;
  /** 是否为自定义 Hook（use 开头的函数） */
  isCustomHook: boolean;
}

/**
 * 检测给定 AST 节点的代码上下文
 */
export function detectCodeContext(path: NodePath<t.Node>): ContextInfo {
  let currentPath = path;
  let functionName: string | undefined;

  // 向上遍历 AST 找到最近的函数或类
  while (currentPath) {
    const node = currentPath.node;

    // 检查函数声明
    if (t.isFunctionDeclaration(node)) {
      functionName = node.id?.name;
      const result = analyzeFunctionContext(node, functionName);
      return {
        type: result.type,
        isReactComponent: result.isReactComponent,
        needsHook: result.needsHook,
        functionName,
        isCustomHook: result.isCustomHook,
      };
    }

    // 检查函数表达式（包括箭头函数）
    if (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) {
      // 尝试从父节点获取函数名
      const parent = currentPath.parent;
      if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
        functionName = parent.id.name;
      } else if (t.isProperty(parent) && t.isIdentifier(parent.key)) {
        functionName = parent.key.name;
      }

      const result = analyzeFunctionContext(node, functionName);
      return {
        type: result.type,
        isReactComponent: result.isReactComponent,
        needsHook: result.needsHook,
        functionName,
        isCustomHook: result.isCustomHook,
      };
    }

    // 检查类方法
    if (t.isClassMethod(node) || t.isObjectMethod(node)) {
      if (t.isIdentifier(node.key)) {
        functionName = node.key.name;
      }

      // 检查是否在 React 类组件内
      const classNode = findParentClass(currentPath);
      if (classNode && isReactClassComponent(classNode)) {
        return {
          type: CodeContext.REACT_CLASS_COMPONENT,
          isReactComponent: true,
          needsHook: false, // 类组件不使用 Hook
          functionName,
          isCustomHook: false,
        };
      }

      return {
        type: CodeContext.CLASS_METHOD,
        isReactComponent: false,
        needsHook: false,
        functionName,
        isCustomHook: false,
      };
    }

    // 检查类声明
    if (t.isClassDeclaration(node)) {
      if (isReactClassComponent(node)) {
        return {
          type: CodeContext.REACT_CLASS_COMPONENT,
          isReactComponent: true,
          needsHook: false,
          functionName: node.id?.name,
          isCustomHook: false,
        };
      }
      break;
    }

    const parentPath = currentPath.parentPath;
    if (!parentPath) break;
    currentPath = parentPath;
  }

  // 如果没有找到函数或类，说明在模块级别
  return {
    type: CodeContext.MODULE_LEVEL,
    isReactComponent: false,
    needsHook: false,
    functionName: undefined,
    isCustomHook: false,
  };
}

/**
 * 分析函数的上下文信息
 */
function analyzeFunctionContext(
  node: t.Function,
  functionName?: string
): {
  type: CodeContext;
  isReactComponent: boolean;
  needsHook: boolean;
  isCustomHook: boolean;
} {
  const isCustomHook = functionName?.startsWith("use") ?? false;

  // 检查是否为 React 函数组件
  if (isReactFunctionComponent(node, functionName)) {
    return {
      type: CodeContext.REACT_FUNCTION_COMPONENT,
      isReactComponent: true,
      needsHook: true,
      isCustomHook,
    };
  }

  // 检查是否为自定义 Hook
  if (isCustomHook) {
    return {
      type: CodeContext.REACT_HOOK,
      isReactComponent: false,
      needsHook: true, // 自定义 Hook 可以使用其他 Hook
      isCustomHook: true,
    };
  }

  // 普通函数
  return {
    type: CodeContext.REGULAR_FUNCTION,
    isReactComponent: false,
    needsHook: false,
    isCustomHook: false,
  };
}

/**
 * 检查函数是否为 React 函数组件
 */
function isReactFunctionComponent(
  node: t.Function,
  functionName?: string
): boolean {
  // 检查函数名是否为大写开头（React 组件约定）
  if (!functionName || !/^[A-Z]/.test(functionName)) {
    return false;
  }

  // 检查函数体是否包含 JSX 返回
  return containsJSXReturn(node);
}

/**
 * 检查函数体是否包含 JSX 返回语句
 */
function containsJSXReturn(node: t.Function): boolean {
  if (!node.body || !t.isBlockStatement(node.body)) {
    // 对于箭头函数的表达式体
    if (t.isArrowFunctionExpression(node) && node.body) {
      return containsJSX(node.body);
    }
    return false;
  }

  // 检查块语句中的返回语句
  for (const statement of node.body.body) {
    if (t.isReturnStatement(statement) && statement.argument) {
      if (containsJSX(statement.argument)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 检查节点是否包含 JSX
 */
function containsJSX(node: t.Node): boolean {
  if (t.isJSXElement(node) || t.isJSXFragment(node)) {
    return true;
  }

  // 递归检查子节点
  for (const key in node) {
    const value = (node as any)[key];
    if (value && typeof value === "object") {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (
            item &&
            typeof item === "object" &&
            item.type &&
            containsJSX(item)
          ) {
            return true;
          }
        }
      } else if (value.type && containsJSX(value)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 检查类是否为 React 类组件
 */
function isReactClassComponent(node: t.ClassDeclaration): boolean {
  // 检查类名是否为大写开头
  if (!node.id || !/^[A-Z]/.test(node.id.name)) {
    return false;
  }

  // 检查是否继承自 React.Component 或 Component
  if (node.superClass) {
    if (t.isIdentifier(node.superClass)) {
      return node.superClass.name === "Component";
    }
    if (t.isMemberExpression(node.superClass)) {
      return (
        t.isIdentifier(node.superClass.object) &&
        node.superClass.object.name === "React" &&
        t.isIdentifier(node.superClass.property) &&
        node.superClass.property.name === "Component"
      );
    }
  }

  // 检查是否有 render 方法
  return node.body.body.some(
    member =>
      t.isClassMethod(member) &&
      t.isIdentifier(member.key) &&
      member.key.name === "render"
  );
}

/**
 * 查找父级类节点
 */
function findParentClass(path: NodePath<t.Node>): t.ClassDeclaration | null {
  let currentPath = path.parentPath;
  while (currentPath) {
    if (t.isClassDeclaration(currentPath.node)) {
      return currentPath.node;
    }
    const parentPath = currentPath.parentPath;
    if (!parentPath) break;
    currentPath = parentPath;
  }
  return null;
}
