import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { GeneratedTool, GenerateResult } from "../types.js";
import { argAccess, toolNameFrom, uniqueName } from "../naming.js";
import { extractFunctions } from "./extract.js";

function withOptionalSuffix(tsType: string): string {
  return /\bundefined\b/.test(tsType) ? tsType : `${tsType} | undefined`;
}

function functionToTool(
  fn: ReturnType<typeof extractFunctions>["functions"][number],
  sourceModuleName: string,
  taken: Set<string>,
): GeneratedTool {
  const toolName = uniqueName(toolNameFrom(fn.name), taken);
  const zodShape: Record<string, string> = {};
  const argsType: Record<string, string> = {};

  for (const param of fn.params) {
    zodShape[param.name] = param.optional ? `${param.zodType}.optional()` : param.zodType;
    argsType[param.name] = param.optional ? withOptionalSuffix(param.tsType) : param.tsType;
  }

  const callArgs = fn.params.map((p) => argAccess(p.name)).join(", ");

  const handlerBody = [
    `const result = await ${fn.name}(${callArgs});`,
    `return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };`,
  ].join("\n  ");

  return {
    toolName,
    fileBaseName: toolName,
    description: fn.description,
    zodShape,
    argsType,
    imports: [`import { ${fn.name} } from "../source/${sourceModuleName}.js";`],
    handlerBody,
  };
}

export async function generateFromTypeScript(filePath: string, serverName: string): Promise<GenerateResult> {
  const { functions, warnings } = extractFunctions(filePath);
  const taken = new Set<string>();
  const sourceModuleName = basename(filePath, extname(filePath));

  const tools = functions.map((fn) => functionToTool(fn, sourceModuleName, taken));
  const sourceCode = await readFile(filePath, "utf-8");

  return {
    serverName,
    mode: "typescript",
    tools,
    warnings,
    sourceFiles: [{ relativePath: `${sourceModuleName}.ts`, code: sourceCode }],
  };
}
