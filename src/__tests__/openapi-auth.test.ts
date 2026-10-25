import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAuth } from "../openapi/auth.js";
import type { OpenApiDocument } from "../openapi/parse.js";

test("detectAuth finds a bearer scheme", () => {
  const doc: OpenApiDocument = {
    security: [{ bearerAuth: [] }],
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
  };
  assert.deepEqual(detectAuth(doc), { kind: "bearer" });
});

test("detectAuth finds an apiKey header scheme", () => {
  const doc: OpenApiDocument = {
    security: [{ apiKeyAuth: [] }],
    components: {
      securitySchemes: { apiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" } },
    },
  };
  assert.deepEqual(detectAuth(doc), { kind: "apiKeyHeader", headerName: "X-API-Key" });
});

test("detectAuth finds an apiKey query scheme", () => {
  const doc: OpenApiDocument = {
    security: [{ apiKeyAuth: [] }],
    components: {
      securitySchemes: { apiKeyAuth: { type: "apiKey", in: "query", name: "api_key" } },
    },
  };
  assert.deepEqual(detectAuth(doc), { kind: "apiKeyQuery", queryName: "api_key" });
});

test("detectAuth returns none when there's no security section", () => {
  const doc: OpenApiDocument = {};
  assert.deepEqual(detectAuth(doc), { kind: "none" });
});

test("detectAuth returns none for an unsupported scheme like oauth2", () => {
  const doc: OpenApiDocument = {
    security: [{ oauth: [] }],
    components: { securitySchemes: { oauth: { type: "oauth2" } } },
  };
  assert.deepEqual(detectAuth(doc), { kind: "none" });
});

test("detectAuth falls back to scanning all declared schemes when security is absent", () => {
  const doc: OpenApiDocument = {
    components: { securitySchemes: { apiKeyAuth: { type: "apiKey", in: "header", name: "X-Key" } } },
  };
  assert.deepEqual(detectAuth(doc), { kind: "apiKeyHeader", headerName: "X-Key" });
});
