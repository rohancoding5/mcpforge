import ts from "typescript";
import { typeToZod, typeToTsString } from "./schema.js";

export type ExtractedParam = {
  name: string;
  zodType: string;
  tsType: string;
  optional: boolean;
};

export type ExtractedFunction = {
  name: string;
  description: string;
  params: ExtractedParam[];
};

export type ExtractResult = {
  functions: ExtractedFunction[];
  warnings: string[];
};

function isExported(modifiers: ts.NodeArray<ts.ModifierLike> | undefined): boolean {
  return Boolean(modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

function paramSupported(param: ts.ParameterDeclaration): param is ts.ParameterDeclaration & { name: ts.Identifier } {
  return ts.isIdentifier(param.name);
}

function jsDocFor(nameNode: ts.Identifier, checker: ts.TypeChecker): string {
  const symbol = checker.getSymbolAtLocation(nameNode);
  if (!symbol) return "";
  const parts = symbol.getDocumentationComment(checker);
  const text = ts.displayPartsToString(parts).trim();
  return text.length > 0 ? text.split("\n")[0].trim() : "";
}

export function extractFunctions(filePath: string): ExtractResult {
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strictNullChecks: true,
    esModuleInterop: true,
    skipLibCheck: true,
    allowJs: false,
  };

  const program = ts.createProgram([filePath], compilerOptions);
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(filePath);

  if (!sourceFile) {
    throw new Error(`Couldn't read ${filePath} as a TypeScript file.`);
  }

  const functions: ExtractedFunction[] = [];
  const warnings: string[] = [];

  function collect(name: string, nameNode: ts.Identifier, node: ts.SignatureDeclarationBase) {
    const params: ExtractedParam[] = [];

    for (const param of node.parameters) {
      if (!paramSupported(param)) {
        warnings.push(
          `Skipped a parameter on "${name}" that isn't a plain name (destructured parameters aren't supported yet).`,
        );
        continue;
      }
      const paramType = checker.getTypeAtLocation(param);
      const includesUndefined =
        paramType.isUnion() && paramType.types.some((part) => Boolean(part.flags & ts.TypeFlags.Undefined));
      const optional = Boolean(param.questionToken) || Boolean(param.initializer) || includesUndefined;
      params.push({
        name: param.name.text,
        zodType: typeToZod(paramType, checker),
        tsType: typeToTsString(paramType, checker),
        optional,
      });
    }

    const description = jsDocFor(nameNode, checker);
    functions.push({
      name,
      description: description.length > 0 ? description : `calls the ${name} function`,
      params,
    });
  }

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && isExported(node.modifiers)) {
      collect(node.name.text, node.name, node);
      return;
    }

    if (ts.isVariableStatement(node) && isExported(node.modifiers)) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
          collect(decl.name.text, decl.name, decl.initializer);
        }
      }
    }
  });

  if (functions.length === 0) {
    warnings.push("No exported functions were found in this file.");
  }

  return { functions, warnings };
}
