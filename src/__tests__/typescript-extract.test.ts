import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractFunctions } from "../typescript/extract.js";
import { withTempDir } from "./test-utils.js";

const FIXTURE = `
/**
 * adds two numbers
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * greets someone, optionally loudly
 */
export const greet = (name: string, loud?: boolean): string => {
  return loud ? \`HELLO \${name}\` : \`hello \${name}\`;
};

function notExported(x: number): number {
  return x;
}

export function withDestructuring({ a, b }: { a: number; b: number }): number {
  return a + b;
}
`;

test("extractFunctions finds an exported function declaration with jsdoc and params", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "fixture.ts");
    await writeFile(filePath, FIXTURE);

    const { functions } = extractFunctions(filePath);
    const add = functions.find((f) => f.name === "add");
    assert.ok(add);
    assert.equal(add.description, "adds two numbers");
    assert.deepEqual(
      add.params.map((p) => [p.name, p.zodType, p.optional]),
      [
        ["a", "z.number()", false],
        ["b", "z.number()", false],
      ],
    );
  });
});

test("extractFunctions finds an exported arrow function assigned to a const", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "fixture.ts");
    await writeFile(filePath, FIXTURE);

    const { functions } = extractFunctions(filePath);
    const greet = functions.find((f) => f.name === "greet");
    assert.ok(greet);
    assert.equal(greet.description, "greets someone, optionally loudly");
    const loud = greet.params.find((p) => p.name === "loud");
    assert.equal(loud?.optional, true);
  });
});

test("extractFunctions skips a non-exported function", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "fixture.ts");
    await writeFile(filePath, FIXTURE);

    const { functions } = extractFunctions(filePath);
    assert.equal(
      functions.some((f) => f.name === "notExported"),
      false,
    );
  });
});

test("extractFunctions warns and skips a destructured parameter", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "fixture.ts");
    await writeFile(filePath, FIXTURE);

    const { functions, warnings } = extractFunctions(filePath);
    const withDestructuring = functions.find((f) => f.name === "withDestructuring");
    assert.ok(withDestructuring);
    assert.equal(withDestructuring.params.length, 0);
    assert.ok(warnings.some((w) => w.includes("withDestructuring")));
  });
});

test("extractFunctions preserves a T | null parameter as nullable, not collapsed to T", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "fixture.ts");
    await writeFile(
      filePath,
      `
export function setStatus(status: string | null): void {}
`,
    );

    const { functions } = extractFunctions(filePath);
    const setStatus = functions.find((f) => f.name === "setStatus");
    assert.ok(setStatus);
    const status = setStatus.params.find((p) => p.name === "status");
    assert.equal(status?.zodType, "z.string().nullable()");
    assert.equal(status?.tsType, "string | null");
    assert.equal(status?.optional, false);
  });
});

test("extractFunctions treats an explicit T | undefined parameter as optional", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "fixture.ts");
    await writeFile(
      filePath,
      `
export function setTag(tag: string | undefined): void {}
`,
    );

    const { functions } = extractFunctions(filePath);
    const setTag = functions.find((f) => f.name === "setTag");
    assert.ok(setTag);
    const tag = setTag.params.find((p) => p.name === "tag");
    assert.equal(tag?.zodType, "z.string()");
    assert.equal(tag?.optional, true);
  });
});

test("extractFunctions warns when a file has no exported functions", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "empty.ts");
    await writeFile(filePath, "const x = 1;\n");

    const { functions, warnings } = extractFunctions(filePath);
    assert.equal(functions.length, 0);
    assert.ok(warnings.some((w) => w.includes("No exported functions")));
  });
});
