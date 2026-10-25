import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeGeneratedServer } from "../scaffold.js";
import type { GenerateResult } from "../types.js";
import { withTempDir, assertValidTypeScript } from "./test-utils.js";

function openApiResult(): GenerateResult {
  return {
    serverName: "sample-mcp",
    mode: "openapi",
    baseUrl: "https://api.example.com",
    auth: { kind: "bearer" },
    clientFileCode: "export async function apiRequest() { return null; }\n",
    warnings: [],
    tools: [
      {
        toolName: "get_thing",
        fileBaseName: "get_thing",
        description: "gets a thing",
        zodShape: { id: "z.string()" },
        argsType: { id: "string" },
        imports: ['import { apiRequest } from "../client.js";'],
        handlerBody: 'return { content: [{ type: "text" as const, text: "ok" }] };',
      },
    ],
  };
}

function typescriptResult(): GenerateResult {
  return {
    serverName: "math-mcp",
    mode: "typescript",
    warnings: [],
    sourceFiles: [{ relativePath: "math.ts", code: "export function add(a: number, b: number) { return a + b; }\n" }],
    tools: [
      {
        toolName: "add",
        fileBaseName: "add",
        description: "adds two numbers",
        zodShape: { a: "z.number()", b: "z.number()" },
        argsType: { a: "number", b: "number" },
        imports: ['import { add } from "../source/math.js";'],
        handlerBody:
          'const result = await add(args.a, args.b);\n  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };',
      },
    ],
  };
}

test("writeGeneratedServer writes an openapi-mode project with all expected files", async () => {
  await withTempDir(async (dir) => {
    await writeGeneratedServer(openApiResult(), dir);

    const packageJson = JSON.parse(await readFile(join(dir, "package.json"), "utf-8"));
    assert.equal(packageJson.name, "sample-mcp");
    assert.ok(packageJson.dependencies["@modelcontextprotocol/sdk"]);
    assert.ok(packageJson.dependencies.zod);

    const indexCode = await readFile(join(dir, "src", "index.ts"), "utf-8");
    assert.match(indexCode, /registerTool\(get_thing\.name/);
    assertValidTypeScript(indexCode);

    const toolCode = await readFile(join(dir, "src", "tools", "get_thing.ts"), "utf-8");
    assertValidTypeScript(toolCode);

    const clientCode = await readFile(join(dir, "src", "client.ts"), "utf-8");
    assertValidTypeScript(clientCode);

    const readme = await readFile(join(dir, "README.md"), "utf-8");
    assert.match(readme, /get_thing/);
    assert.match(readme, /API_TOKEN/);
  });
});

test("writeGeneratedServer writes a typescript-mode project with the copied source file", async () => {
  await withTempDir(async (dir) => {
    await writeGeneratedServer(typescriptResult(), dir);

    const sourceCode = await readFile(join(dir, "src", "source", "math.ts"), "utf-8");
    assert.match(sourceCode, /export function add/);

    const toolCode = await readFile(join(dir, "src", "tools", "add.ts"), "utf-8");
    assertValidTypeScript(toolCode);
    assert.match(toolCode, /from "..\/source\/math\.js"/);
  });
});

test("writeGeneratedServer surfaces warnings in the README", async () => {
  await withTempDir(async (dir) => {
    const result = typescriptResult();
    result.warnings = ["something couldn't be figured out"];
    await writeGeneratedServer(result, dir);

    const readme = await readFile(join(dir, "README.md"), "utf-8");
    assert.match(readme, /something couldn't be figured out/);
  });
});
