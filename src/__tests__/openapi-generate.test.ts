import { test } from "node:test";
import assert from "node:assert/strict";
import { generateFromOpenApi } from "../openapi/generate.js";
import type { OpenApiDocument } from "../openapi/parse.js";

function basicDoc(overrides: Partial<OpenApiDocument> = {}): OpenApiDocument {
  return {
    paths: {
      "/pets/{id}": {
        get: {
          operationId: "getPetById",
          summary: "get a pet by id",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        },
      },
    },
    ...overrides,
  };
}

test("generateFromOpenApi produces one tool per operation with the right name and description", () => {
  const result = generateFromOpenApi(basicDoc(), "my-server");
  assert.equal(result.tools.length, 1);
  assert.equal(result.tools[0].toolName, "get_pet_by_id");
  assert.equal(result.tools[0].description, "get a pet by id");
  assert.deepEqual(result.tools[0].zodShape, { id: "z.string()" });
});

test("generateFromOpenApi keeps an absolute server url as is", () => {
  const doc = basicDoc({ servers: [{ url: "https://api.example.com/v2" }] });
  const result = generateFromOpenApi(doc, "my-server");
  assert.equal(result.baseUrl, "https://api.example.com/v2");
});

test("generateFromOpenApi resolves a relative server url against the spec's own url", () => {
  const doc = basicDoc({ servers: [{ url: "/api/v3" }] });
  const result = generateFromOpenApi(doc, "my-server", "https://petstore3.swagger.io/api/v3/openapi.json");
  assert.equal(result.baseUrl, "https://petstore3.swagger.io/api/v3");
});

test("generateFromOpenApi warns instead of guessing when a relative url can't be resolved", () => {
  const doc = basicDoc({ servers: [{ url: "/api/v3" }] });
  const result = generateFromOpenApi(doc, "my-server");
  assert.equal(result.baseUrl, "/api/v3");
  assert.ok(result.warnings.some((w) => w.includes("relative")));
});

test("generateFromOpenApi defaults the base url when the spec has no servers section", () => {
  const result = generateFromOpenApi(basicDoc(), "my-server");
  assert.equal(result.baseUrl, "https://api.example.com");
});

test("generateFromOpenApi flattens a request body's object properties into top-level args", () => {
  const doc = basicDoc({
    paths: {
      "/pets": {
        post: {
          operationId: "createPet",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: { name: { type: "string" }, age: { type: "integer" } },
                },
              },
            },
          },
        },
      },
    },
  });
  const result = generateFromOpenApi(doc, "my-server");
  assert.deepEqual(result.tools[0].zodShape, {
    name: "z.string()",
    age: "z.number().int().optional()",
  });
});

test("generateFromOpenApi disambiguates two operations that would otherwise collide", () => {
  const doc = basicDoc({
    paths: {
      "/a": { get: { summary: "first" } },
      "/b": { get: { summary: "second" } },
    },
  });
  const result = generateFromOpenApi(doc, "my-server");
  const names = result.tools.map((t) => t.toolName);
  assert.equal(new Set(names).size, names.length);
});

test("generateFromOpenApi warns about an unsupported oauth2 security scheme", () => {
  const doc = basicDoc({
    security: [{ oauth: [] }],
    components: { securitySchemes: { oauth: { type: "oauth2" } } },
  });
  const result = generateFromOpenApi(doc, "my-server");
  assert.ok(result.warnings.some((w) => w.toLowerCase().includes("oauth")));
});

test("generateFromOpenApi warns when an operation's request body can't be turned into arguments", () => {
  const doc = basicDoc({
    paths: {
      "/pets/image": {
        post: {
          operationId: "uploadPetImage",
          requestBody: {
            required: true,
            content: { "application/octet-stream": { schema: { type: "string" } } },
          },
        },
      },
    },
  });
  const result = generateFromOpenApi(doc, "my-server");
  assert.deepEqual(result.tools[0].zodShape, {});
  assert.ok(result.warnings.some((w) => w.includes("uploadPetImage") && w.includes("application/octet-stream")));
});

test("generateFromOpenApi flattens a form-urlencoded body into arguments and marks form encoding", () => {
  const doc = basicDoc({
    paths: {
      "/pets": {
        post: {
          operationId: "updatePetForm",
          requestBody: {
            content: {
              "application/x-www-form-urlencoded": {
                schema: { type: "object", properties: { name: { type: "string" } } },
              },
            },
          },
        },
      },
    },
  });
  const result = generateFromOpenApi(doc, "my-server");
  assert.deepEqual(result.tools[0].zodShape, { name: "z.string().optional()" });
  assert.match(result.tools[0].handlerBody, /encoding = "form"/);
});
