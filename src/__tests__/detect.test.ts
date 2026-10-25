import { test } from "node:test";
import assert from "node:assert/strict";
import { detectMode } from "../detect.js";

test("detectMode treats http(s) urls as openapi", () => {
  assert.equal(detectMode("https://example.com/openapi.json"), "openapi");
  assert.equal(detectMode("http://example.com/spec.yaml"), "openapi");
});

test("detectMode treats local json/yaml/yml files as openapi", () => {
  assert.equal(detectMode("./spec.json"), "openapi");
  assert.equal(detectMode("./spec.yaml"), "openapi");
  assert.equal(detectMode("./spec.yml"), "openapi");
});

test("detectMode treats a .ts file as typescript", () => {
  assert.equal(detectMode("./tools/weather.ts"), "typescript");
});

test("detectMode rejects an unrecognized input", () => {
  assert.throws(() => detectMode("./tools/weather.py"));
  assert.throws(() => detectMode("not-a-file-at-all"));
});
