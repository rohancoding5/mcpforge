import { test } from "node:test";
import assert from "node:assert/strict";
import { extractOperations } from "../openapi/operations.js";
import type { OpenApiDocument } from "../openapi/parse.js";

test("extractOperations finds a simple GET with a path param", () => {
  const doc: OpenApiDocument = {
    paths: {
      "/pets/{id}": {
        get: {
          operationId: "getPetById",
          summary: "get a pet",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        },
      },
    },
  };
  const ops = extractOperations(doc);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].method, "GET");
  assert.equal(ops[0].operationId, "getPetById");
  assert.equal(ops[0].parameters.length, 1);
  assert.equal(ops[0].parameters[0].location, "path");
  assert.equal(ops[0].parameters[0].required, true);
});

test("extractOperations merges path-level and operation-level parameters", () => {
  const doc: OpenApiDocument = {
    paths: {
      "/pets": {
        parameters: [{ name: "traceId", in: "header", schema: { type: "string" } }],
        get: {
          operationId: "listPets",
          parameters: [{ name: "status", in: "query", schema: { type: "string" } }],
        },
      },
    },
  };
  const ops = extractOperations(doc);
  const names = ops[0].parameters.map((p) => p.name).sort();
  assert.deepEqual(names, ["status", "traceId"]);
});

test("extractOperations picks up an application/json request body", () => {
  const doc: OpenApiDocument = {
    paths: {
      "/pets": {
        post: {
          operationId: "createPet",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", properties: { name: { type: "string" } } },
              },
            },
          },
        },
      },
    },
  };
  const ops = extractOperations(doc);
  assert.ok(ops[0].requestBodySchema);
  assert.equal(ops[0].requestBodyRequired, true);
});

test("extractOperations picks up an application/x-www-form-urlencoded request body", () => {
  const doc: OpenApiDocument = {
    paths: {
      "/pets": {
        post: {
          operationId: "createPetForm",
          requestBody: {
            required: true,
            content: {
              "application/x-www-form-urlencoded": {
                schema: { type: "object", properties: { name: { type: "string" } } },
              },
            },
          },
        },
      },
    },
  };
  const ops = extractOperations(doc);
  assert.ok(ops[0].requestBodySchema);
  assert.equal(ops[0].requestBodyEncoding, "form");
  assert.equal(ops[0].unsupportedBodyContentType, undefined);
});

test("extractOperations flags a request body content type it can't turn into arguments", () => {
  const doc: OpenApiDocument = {
    paths: {
      "/pets/{id}/image": {
        post: {
          operationId: "uploadPetImage",
          requestBody: {
            required: true,
            content: {
              "application/octet-stream": { schema: { type: "string" } },
            },
          },
        },
      },
    },
  };
  const ops = extractOperations(doc);
  assert.equal(ops[0].requestBodySchema, undefined);
  assert.equal(ops[0].unsupportedBodyContentType, "application/octet-stream");
});

test("extractOperations prefers application/json over a form body when both are declared", () => {
  const doc: OpenApiDocument = {
    paths: {
      "/pets": {
        post: {
          operationId: "createPetEither",
          requestBody: {
            content: {
              "application/json": { schema: { type: "object", properties: { name: { type: "string" } } } },
              "application/x-www-form-urlencoded": {
                schema: { type: "object", properties: { name: { type: "string" } } },
              },
            },
          },
        },
      },
    },
  };
  const ops = extractOperations(doc);
  assert.equal(ops[0].requestBodyEncoding, "json");
});

test("extractOperations falls back to method and path when operationId is missing", () => {
  const doc: OpenApiDocument = {
    paths: { "/status": { get: {} } },
  };
  const ops = extractOperations(doc);
  assert.equal(ops[0].operationId, "get_/status");
});

test("extractOperations resolves a $ref'd parameter", () => {
  const raw = {
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          parameters: [{ $ref: "#/components/parameters/StatusParam" }],
        },
      },
    },
    components: {
      parameters: {
        StatusParam: { name: "status", in: "query", schema: { type: "string" } },
      },
    },
  };
  const ops = extractOperations(raw as unknown as OpenApiDocument);
  assert.equal(ops[0].parameters[0].name, "status");
});

test("extractOperations ignores unsupported parameter locations like cookie", () => {
  const doc: OpenApiDocument = {
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          parameters: [{ name: "session", in: "cookie", schema: { type: "string" } }],
        },
      },
    },
  };
  const ops = extractOperations(doc);
  assert.equal(ops[0].parameters.length, 0);
});
