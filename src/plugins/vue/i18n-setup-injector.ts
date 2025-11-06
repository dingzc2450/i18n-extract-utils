import * as t from "@babel/types";
import traverse from "@babel/traverse";

export function createUseI18nStatement(
  translationMethod: string,
  hookName: string
): t.VariableDeclaration {
  return t.variableDeclaration("const", [
    t.variableDeclarator(
      t.objectPattern([
        t.objectProperty(
          t.identifier(translationMethod),
          t.identifier(translationMethod),
          false,
          true
        ),
      ]),
      t.callExpression(t.identifier(hookName), [])
    ),
  ]);
}

export function addI18nSetupToScript(
  ast: t.File,
  translationMethod: string,
  hookName: string,
  hookImport: string,
  isSetupScript: boolean,
  needsImport: boolean
) {
  if (!needsImport) return;

  let hasImport = false;
  let hasUseI18n = false;

  const createStmt = createUseI18nStatement;

  traverse(ast, {
    ImportDeclaration(path) {
      if (
        path.node.source.value === hookImport &&
        path.node.specifiers.some(
          s =>
            t.isImportSpecifier(s) &&
            t.isIdentifier(s.imported) &&
            s.imported.name === hookName
        )
      ) {
        hasImport = true;
      }
    },
    VariableDeclaration(path) {
      path.node.declarations.forEach(decl => {
        if (
          t.isVariableDeclarator(decl) &&
          t.isObjectPattern(decl.id) &&
          decl.id.properties.some(
            p =>
              t.isObjectProperty(p) &&
              t.isIdentifier(p.key) &&
              p.key.name === translationMethod
          ) &&
          t.isCallExpression(decl.init) &&
          t.isIdentifier(decl.init.callee) &&
          decl.init.callee.name === hookName
        ) {
          hasUseI18n = true;
        }
      });
    },
  });

  if (!hasImport) {
    const importStmt = t.importDeclaration(
      [t.importSpecifier(t.identifier(hookName), t.identifier(hookName))],
      t.stringLiteral(hookImport)
    );
    ast.program.body.unshift(importStmt);
  }

  if (!hasUseI18n) {
    if (isSetupScript) {
      const useI18nStmt = createStmt(translationMethod, hookName);
      let insertIndex = 0;
      for (let i = 0; i < ast.program.body.length; i++) {
        if (t.isImportDeclaration(ast.program.body[i])) {
          insertIndex = i + 1;
        } else {
          break;
        }
      }
      ast.program.body.splice(insertIndex, 0, useI18nStmt);
    } else {
      let hasAddedUseI18n = false;

      traverse(ast, {
        ObjectMethod: {
          enter(path) {
            if (
              t.isIdentifier(path.node.key) &&
              path.node.key.name === "setup" &&
              !hasAddedUseI18n
            ) {
              if (t.isBlockStatement(path.node.body)) {
                const setupBody = path.node.body.body;
                let hasExistingUseI18n = false;

                for (const stmt of setupBody) {
                  if (
                    t.isVariableDeclaration(stmt) &&
                    stmt.declarations.some(
                      decl =>
                        t.isVariableDeclarator(decl) &&
                        t.isObjectPattern(decl.id) &&
                        decl.id.properties.some(
                          p =>
                            t.isObjectProperty(p) &&
                            t.isIdentifier(p.key) &&
                            p.key.name === translationMethod
                        )
                    )
                  ) {
                    hasExistingUseI18n = true;
                    break;
                  }
                }

                if (!hasExistingUseI18n) {
                  setupBody.unshift(createStmt(translationMethod, hookName));
                }

                hasAddedUseI18n = true;
                path.stop();
              }
            }
          },
        },
        ObjectProperty: {
          enter(path) {
            if (
              t.isIdentifier(path.node.key) &&
              path.node.key.name === "setup" &&
              t.isFunctionExpression(path.node.value) &&
              !hasAddedUseI18n
            ) {
              const funcNode = path.node.value;
              if (t.isBlockStatement(funcNode.body)) {
                const setupBody = funcNode.body.body;
                let hasExistingUseI18n = false;

                for (const stmt of setupBody) {
                  if (
                    t.isVariableDeclaration(stmt) &&
                    stmt.declarations.some(
                      decl =>
                        t.isVariableDeclarator(decl) &&
                        t.isObjectPattern(decl.id) &&
                        decl.id.properties.some(
                          p =>
                            t.isObjectProperty(p) &&
                            t.isIdentifier(p.key) &&
                            p.key.name === translationMethod
                        )
                    )
                  ) {
                    hasExistingUseI18n = true;
                    break;
                  }
                }

                if (!hasExistingUseI18n) {
                  setupBody.unshift(createStmt(translationMethod, hookName));
                }

                hasAddedUseI18n = true;
                path.stop();
              }
            }
          },
        },
        ExportDefaultDeclaration: {
          enter(path) {
            if (
              t.isObjectExpression(path.node.declaration) &&
              !hasAddedUseI18n
            ) {
              let hasSetupMethod = false;
              const objProps = path.node.declaration.properties;

              for (const prop of objProps) {
                if (
                  (t.isObjectMethod(prop) &&
                    t.isIdentifier(prop.key) &&
                    prop.key.name === "setup") ||
                  (t.isObjectProperty(prop) &&
                    t.isIdentifier(prop.key) &&
                    prop.key.name === "setup")
                ) {
                  hasSetupMethod = true;
                  break;
                }
              }

              if (!hasSetupMethod) {
                const setupMethod = t.objectMethod(
                  "method",
                  t.identifier("setup"),
                  [],
                  t.blockStatement([
                    createStmt(translationMethod, hookName),
                    t.returnStatement(t.objectExpression([])),
                  ])
                );

                path.node.declaration.properties.unshift(setupMethod);
                hasAddedUseI18n = true;
                path.stop();
              }
            }
          },
        },
      });

      if (!hasAddedUseI18n) {
        addUseI18nToReactComponents(ast, translationMethod, hookName);
      }
    }
  }
}

export function addUseI18nToReactComponents(
  ast: t.File,
  translationMethod: string,
  hookName: string
) {
  const createStmt = createUseI18nStatement;

  traverse(ast, {
    FunctionDeclaration: {
      enter(path) {
        const funcName = path.node.id?.name;
        if (
          funcName &&
          /^[A-Z]/.test(funcName) &&
          t.isBlockStatement(path.node.body)
        ) {
          let hasUseI18n = false;

          path.node.body.body.forEach(stmt => {
            if (
              t.isVariableDeclaration(stmt) &&
              stmt.declarations.some(
                decl =>
                  t.isVariableDeclarator(decl) &&
                  t.isObjectPattern(decl.id) &&
                  decl.id.properties.some(
                    p =>
                      t.isObjectProperty(p) &&
                      t.isIdentifier(p.key) &&
                      p.key.name === translationMethod
                  )
              )
            ) {
              hasUseI18n = true;
            }
          });

          if (!hasUseI18n) {
            path.node.body.body.unshift(
              createStmt(translationMethod, hookName)
            );
          }
        }
      },
    },
    ArrowFunctionExpression: {
      enter(path) {
        const parent = path.parent;
        if (
          t.isVariableDeclarator(parent) &&
          t.isIdentifier(parent.id) &&
          /^[A-Z]/.test(parent.id.name) &&
          t.isBlockStatement(path.node.body)
        ) {
          let hasUseI18n = false;

          path.node.body.body.forEach(stmt => {
            if (
              t.isVariableDeclaration(stmt) &&
              stmt.declarations.some(
                decl =>
                  t.isVariableDeclarator(decl) &&
                  t.isObjectPattern(decl.id) &&
                  decl.id.properties.some(
                    p =>
                      t.isObjectProperty(p) &&
                      t.isIdentifier(p.key) &&
                      p.key.name === translationMethod
                  )
              )
            ) {
              hasUseI18n = true;
            }
          });

          if (!hasUseI18n) {
            path.node.body.body.unshift(
              createStmt(translationMethod, hookName)
            );
          }
        }
      },
    },
  });
}
