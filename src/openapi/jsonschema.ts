import { propertyKey } from "../naming.js";

export type JsonSchema = {
  $ref?: string;
  type?: string | string[];
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  nullable?: boolean;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  description?: string;
};

export function resolveRef(doc: unknown, ref: string): JsonSchema | undefined {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref
    .slice(2)
    .split("/")
    .map((part) => decodeURIComponent(part.replace(/~1/g, "/").replace(/~0/g, "~")));

  let current: unknown = doc;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current as JsonSchema | undefined;
}

function schemaType(schema: JsonSchema): string | undefined {
  return Array.isArray(schema.type) ? schema.type[0] : schema.type;
}

export function schemaToZod(schema: JsonSchema | undefined, doc: unknown, seen: Set<string> = new Set()): string {
  if (!schema) return "z.unknown()";

  if (schema.$ref) {
    if (seen.has(schema.$ref)) return "z.unknown()";
    const resolved = resolveRef(doc, schema.$ref);
    if (!resolved) return "z.unknown()";
    return schemaToZod(resolved, doc, new Set(seen).add(schema.$ref));
  }

  const base = schemaToZodBase(schema, doc, seen);
  return schema.nullable ? `${base}.nullable()` : base;
}

function schemaToZodBase(schema: JsonSchema, doc: unknown, seen: Set<string>): string {
  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf ?? schema.anyOf ?? []).map((s) => schemaToZod(s, doc, seen));
    if (variants.length === 0) return "z.unknown()";
    if (variants.length === 1) return variants[0];
    return `z.union([${variants.join(", ")}])`;
  }

  if (schema.allOf && schema.allOf.length > 0) {
    return schemaToZod(schema.allOf[schema.allOf.length - 1], doc, seen);
  }

  if (schema.enum && schema.enum.length > 0) {
    const allStrings = schema.enum.every((value) => typeof value === "string");
    if (allStrings) {
      return `z.enum([${schema.enum.map((value) => JSON.stringify(value)).join(", ")}])`;
    }
    const literals = schema.enum.map((value) => `z.literal(${JSON.stringify(value)})`);
    return literals.length === 1 ? literals[0] : `z.union([${literals.join(", ")}])`;
  }

  const type = schemaType(schema);

  switch (type) {
    case "string":
      return "z.string()";
    case "integer":
      return "z.number().int()";
    case "number":
      return "z.number()";
    case "boolean":
      return "z.boolean()";
    case "array":
      return `z.array(${schemaToZod(schema.items, doc, seen)})`;
    case "object":
      return objectSchemaToZod(schema, doc, seen);
    default:
      return schema.properties ? objectSchemaToZod(schema, doc, seen) : "z.unknown()";
  }
}

function objectSchemaToZod(schema: JsonSchema, doc: unknown, seen: Set<string>): string {
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    return "z.record(z.string(), z.unknown())";
  }
  const required = new Set(schema.required ?? []);
  const entries = Object.entries(schema.properties).map(([key, propSchema]) => {
    const zodType = schemaToZod(propSchema, doc, seen);
    const withOptional = required.has(key) ? zodType : `${zodType}.optional()`;
    return `${propertyKey(key)}: ${withOptional}`;
  });
  return `z.object({ ${entries.join(", ")} })`;
}

export function schemaToTsType(schema: JsonSchema | undefined, doc: unknown, seen: Set<string> = new Set()): string {
  if (!schema) return "unknown";

  if (schema.$ref) {
    if (seen.has(schema.$ref)) return "unknown";
    const resolved = resolveRef(doc, schema.$ref);
    if (!resolved) return "unknown";
    return schemaToTsType(resolved, doc, new Set(seen).add(schema.$ref));
  }

  const base = schemaToTsTypeBase(schema, doc, seen);
  return schema.nullable ? `${base} | null` : base;
}

function schemaToTsTypeBase(schema: JsonSchema, doc: unknown, seen: Set<string>): string {
  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf ?? schema.anyOf ?? []).map((s) => schemaToTsType(s, doc, seen));
    return variants.length > 0 ? variants.join(" | ") : "unknown";
  }

  if (schema.allOf && schema.allOf.length > 0) {
    return schemaToTsType(schema.allOf[schema.allOf.length - 1], doc, seen);
  }

  if (schema.enum && schema.enum.length > 0) {
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  }

  const type = schemaType(schema);

  switch (type) {
    case "string":
      return "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return `${schemaToTsType(schema.items, doc, seen)}[]`;
    case "object":
      return objectSchemaToTsType(schema, doc, seen);
    default:
      return schema.properties ? objectSchemaToTsType(schema, doc, seen) : "unknown";
  }
}

function objectSchemaToTsType(schema: JsonSchema, doc: unknown, seen: Set<string>): string {
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    return "Record<string, unknown>";
  }
  const required = new Set(schema.required ?? []);
  const entries = Object.entries(schema.properties).map(([key, propSchema]) => {
    const tsType = schemaToTsType(propSchema, doc, seen);
    const optionalMark = required.has(key) ? "" : "?";
    return `${propertyKey(key)}${optionalMark}: ${tsType}`;
  });
  return `{ ${entries.join("; ")} }`;
}
