import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../config.js";

test("parseArgs derives a server name and out dir from a ts file path", async () => {
  const config = await parseArgs(["./tools/weather.ts"]);
  assert.ok(config);
  assert.equal(config.serverName, "weather-mcp");
  assert.equal(config.outDir, "weather-mcp");
});

test("parseArgs derives a server name from a url's hostname", async () => {
  const config = await parseArgs(["https://petstore3.swagger.io/api/v3/openapi.json"]);
  assert.equal(config?.serverName, "petstore3-swagger-io-mcp");
});

test("parseArgs respects explicit --out and --name overrides", async () => {
  const config = await parseArgs(["./spec.json", "--out", "custom-dir", "--name", "custom-name"]);
  assert.equal(config?.outDir, "custom-dir");
  assert.equal(config?.serverName, "custom-name");
});

test("parseArgs rejects more than one input", async () => {
  await assert.rejects(() => parseArgs(["a.json", "b.json"]));
});

test("parseArgs rejects an unknown flag", async () => {
  await assert.rejects(() => parseArgs(["a.json", "--nope"]));
});

test("parseArgs returns null and prints help with no input", async (t) => {
  const calls: string[] = [];
  t.mock.method(console, "log", (msg: string) => calls.push(msg));
  const config = await parseArgs([]);
  assert.equal(config, null);
  assert.ok(calls.some((c) => c.includes("mcpforge")));
});
