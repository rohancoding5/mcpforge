import { test } from "node:test";
import assert from "node:assert/strict";
import { schemaToZod, schemaToTsType, resolveRef, type JsonSchema } from "../openapi/jsonschema.js";

const doc = {
  components: {
    schemas: {
      Pet: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          age: { type: "integer" },
        },
      },
    },
  },
};

test("schemaToZod maps primitive types", () => {
  assert.equal(schemaToZod({ type: "string" }, doc), "z.string()");
  assert.equal(schemaToZod({ type: "integer" }, doc), "z.number().int()");
  assert.equal(schemaToZod({ type: "number" }, doc), "z.number()");
  assert.equal(schemaToZod({ type: "boolean" }, doc), "z.boolean()");
});

test("schemaToZod maps arrays", () => {
  assert.equal(schemaToZod({ type: "array", items: { type: "string" } }, doc), "z.array(z.string())");
});

test("schemaToZod maps an object with required and optional properties", () => {
  const schema: JsonSchema = {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string" }, note: { type: "string" } },
  };
  assert.equal(schemaToZod(schema, doc), "z.object({ id: z.string(), note: z.string().optional() })");
});

test("schemaToZod resolves a $ref", () => {
  assert.equal(
    schemaToZod({ $ref: "#/components/schemas/Pet" }, doc),
    "z.object({ name: z.string(), age: z.number().int().optional() })",
  );
});

test("schemaToZod guards against a self-referencing $ref cycle", () => {
  const cyclicDoc = {
    components: {
      schemas: {
        Node: {
          type: "object",
          properties: { child: { $ref: "#/components/schemas/Node" } },
        },
      },
    },
  };
  const output = schemaToZod({ $ref: "#/components/schemas/Node" }, cyclicDoc);
  assert.match(output, /z\.object/);
  assert.match(output, /z\.unknown\(\)/);
});

test("schemaToZod maps a string enum", () => {
  assert.equal(schemaToZod({ type: "string", enum: ["a", "b"] }, doc), 'z.enum(["a", "b"])');
});

test("schemaToZod marks nullable schemas", () => {
  assert.equal(schemaToZod({ type: "string", nullable: true }, doc), "z.string().nullable()");
});

test("schemaToZod marks a nullable enum, not just a nullable plain type", () => {
  assert.equal(
    schemaToZod({ type: "string", enum: ["a", "b"], nullable: true }, doc),
    'z.enum(["a", "b"]).nullable()',
  );
});

test("schemaToZod marks a nullable oneOf/anyOf", () => {
  assert.equal(
    schemaToZod({ oneOf: [{ type: "string" }], nullable: true }, doc),
    "z.string().nullable()",
  );
  assert.equal(
    schemaToZod({ anyOf: [{ type: "string" }, { type: "number" }], nullable: true }, doc),
    "z.union([z.string(), z.number()]).nullable()",
  );
});

test("schemaToZod marks a nullable allOf", () => {
  const schema: JsonSchema = {
    allOf: [{ type: "object", properties: { a: { type: "string" } } }],
    nullable: true,
  };
  assert.equal(schemaToZod(schema, doc), "z.object({ a: z.string().optional() }).nullable()");
});

test("schemaToZod falls back to z.unknown() with no type info", () => {
  assert.equal(schemaToZod({}, doc), "z.unknown()");
  assert.equal(schemaToZod(undefined, doc), "z.unknown()");
});

test("schemaToTsType mirrors schemaToZod's structure as real TypeScript", () => {
  assert.equal(schemaToTsType({ type: "string" }, doc), "string");
  assert.equal(schemaToTsType({ type: "array", items: { type: "number" } }, doc), "number[]");
  assert.equal(
    schemaToTsType({ $ref: "#/components/schemas/Pet" }, doc),
    "{ name: string; age?: number }",
  );
});

test("schemaToTsType marks a nullable enum, not just a nullable plain type", () => {
  assert.equal(schemaToTsType({ type: "string", enum: ["a", "b"], nullable: true }, doc), '"a" | "b" | null');
});

test("resolveRef returns undefined for a pointer outside the document", () => {
  assert.equal(resolveRef(doc, "#/components/schemas/DoesNotExist"), undefined);
});
