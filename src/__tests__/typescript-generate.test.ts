import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateFromTypeScript } from "../typescript/generate.js";
import { withTempDir } from "./test-utils.js";

const FIXTURE = `
/**
 * adds two numbers
 */
export function add(a: number, b: number): number {
  return a + b;
}
`;

test("generateFromTypeScript produces one tool per exported function", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "math.ts");
    await writeFile(filePath, FIXTURE);

    const result = await generateFromTypeScript(filePath, "math-mcp");
    assert.equal(result.mode, "typescript");
    assert.equal(result.tools.length, 1);
    assert.equal(result.tools[0].toolName, "add");
    assert.equal(result.tools[0].description, "adds two numbers");
    assert.deepEqual(result.tools[0].zodShape, { a: "z.number()", b: "z.number()" });
  });
});

test("generateFromTypeScript imports the tool's handler from the copied source module", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "math.ts");
    await writeFile(filePath, FIXTURE);

    const result = await generateFromTypeScript(filePath, "math-mcp");
    assert.ok(result.tools[0].imports.some((line) => line.includes('from "../source/math.js"')));
    assert.match(result.tools[0].handlerBody, /await add\(args\.a, args\.b\)/);
  });
});

test("generateFromTypeScript keeps a string | null parameter nullable in both the zod schema and the arg type", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "status.ts");
    await writeFile(
      filePath,
      `
/**
 * sets the status
 */
export function setStatus(status: string | null): void {}
`,
    );

    const result = await generateFromTypeScript(filePath, "status-mcp");
    const tool = result.tools.find((t) => t.toolName === "set_status");
    assert.ok(tool);
    assert.equal(tool.zodShape.status, "z.string().nullable()");
    assert.equal(tool.argsType.status, "string | null");
  });
});

test("generateFromTypeScript copies the original source file verbatim", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "math.ts");
    await writeFile(filePath, FIXTURE);

    const result = await generateFromTypeScript(filePath, "math-mcp");
    assert.equal(result.sourceFiles?.length, 1);
    assert.equal(result.sourceFiles?.[0].relativePath, "math.ts");
    assert.equal(result.sourceFiles?.[0].code, FIXTURE);
  });
});
