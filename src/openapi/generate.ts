import type { GeneratedTool, GenerateResult } from "../types.js";
import { argAccess, propertyKey, toolNameFrom, uniqueName } from "../naming.js";
import { schemaToTsType, schemaToZod, type JsonSchema } from "./jsonschema.js";
import { extractOperations, type Operation } from "./operations.js";
import { detectAuth } from "./auth.js";
import type { OpenApiDocument } from "./parse.js";

function bodyProperties(schema: JsonSchema | undefined): { name: string; schema: JsonSchema; required: boolean }[] {
  if (!schema || schema.type !== "object" || !schema.properties) return [];
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).map(([name, propSchema]) => ({
    name,
    schema: propSchema,
    required: required.has(name),
  }));
}

function operationToTool(op: Operation, doc: OpenApiDocument, taken: Set<string>): GeneratedTool {
  const toolName = uniqueName(toolNameFrom(op.operationId), taken);
  const zodShape: Record<string, string> = {};
  const argsType: Record<string, string> = {};

  const pathParams = op.parameters.filter((p) => p.location === "path");
  const queryParams = op.parameters.filter((p) => p.location === "query");
  const headerParams = op.parameters.filter((p) => p.location === "header");
  const bodyFields = bodyProperties(op.requestBodySchema);
  const bodyIsObject = bodyFields.length > 0;
  const bodyIsOther = Boolean(op.requestBodySchema) && !bodyIsObject;

  for (const param of [...pathParams, ...queryParams, ...headerParams]) {
    const zodType = schemaToZod(param.schema, doc);
    zodShape[param.name] = param.required ? zodType : `${zodType}.optional()`;
    const tsType = schemaToTsType(param.schema, doc);
    argsType[param.name] = param.required ? tsType : `${tsType} | undefined`;
  }

  if (bodyIsObject) {
    for (const field of bodyFields) {
      const zodType = schemaToZod(field.schema, doc);
      zodShape[field.name] = field.required ? zodType : `${zodType}.optional()`;
      const tsType = schemaToTsType(field.schema, doc);
      argsType[field.name] = field.required ? tsType : `${tsType} | undefined`;
    }
  } else if (bodyIsOther) {
    zodShape.body = op.requestBodyRequired
      ? schemaToZod(op.requestBodySchema, doc)
      : `${schemaToZod(op.requestBodySchema, doc)}.optional()`;
    argsType.body = op.requestBodyRequired
      ? schemaToTsType(op.requestBodySchema, doc)
      : `${schemaToTsType(op.requestBodySchema, doc)} | undefined`;
  }

  let pathExpression = op.path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    return `\${encodeURIComponent(String(${argAccess(name)}))}`;
  });
  pathExpression = pathExpression.replace(/`/g, "\\`");

  const lines: string[] = [];
  lines.push(`const resolvedPath = \`${pathExpression}\`;`);

  if (queryParams.length > 0) {
    const entries = queryParams.map((p) => `${propertyKey(p.name)}: ${argAccess(p.name)}`);
    lines.push(`const query = { ${entries.join(", ")} };`);
  }
  if (headerParams.length > 0) {
    const entries = headerParams.map((p) => `${propertyKey(p.name)}: ${argAccess(p.name)}`);
    lines.push(`const headers = { ${entries.join(", ")} };`);
  }
  if (bodyIsObject) {
    const entries = bodyFields.map((f) => `${propertyKey(f.name)}: ${argAccess(f.name)}`);
    lines.push(`const body = { ${entries.join(", ")} };`);
  } else if (bodyIsOther) {
    lines.push(`const body = ${argAccess("body")};`);
  }

  const requestOptions: string[] = [];
  if (queryParams.length > 0) requestOptions.push("query");
  if (headerParams.length > 0) requestOptions.push("headers");
  if (bodyIsObject || bodyIsOther) requestOptions.push("body");
  if ((bodyIsObject || bodyIsOther) && op.requestBodyEncoding === "form") {
    lines.push(`const encoding = "form" as const;`);
    requestOptions.push("encoding");
  }

  lines.push(
    `const data = await apiRequest(${JSON.stringify(op.method)}, resolvedPath${
      requestOptions.length > 0 ? `, { ${requestOptions.join(", ")} }` : ""
    });`,
  );
  lines.push(`return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };`);

  return {
    toolName,
    fileBaseName: toolName,
    description: op.summary,
    zodShape,
    argsType,
    imports: [`import { apiRequest } from "../client.js";`],
    handlerBody: lines.join("\n  "),
  };
}

const CLIENT_TEMPLATE = (auth: ReturnType<typeof detectAuth>, baseUrl: string) => `
const BASE_URL = process.env.API_BASE_URL ?? ${JSON.stringify(baseUrl)};

type RequestOptions = {
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  body?: unknown;
  encoding?: "json" | "form";
};

function encodeForm(body: unknown): string {
  const params = new URLSearchParams();
  if (body && typeof body === "object") {
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (value !== undefined && value !== null) params.append(key, String(value));
    }
  }
  return params.toString();
}

export async function apiRequest(method: string, path: string, options: RequestOptions = {}) {
  const url = new URL(BASE_URL.replace(/\\/$/, "") + path);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const isForm = options.encoding === "form";
  const headers: Record<string, string> = {
    "content-type": isForm ? "application/x-www-form-urlencoded" : "application/json",
  };
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      if (value !== undefined && value !== null) headers[key] = String(value);
    }
  }
${authInjectionCode(auth)}
  const body =
    options.body === undefined ? undefined : isForm ? encodeForm(options.body) : JSON.stringify(options.body);

  const response = await fetch(url, { method, headers, body });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(\`request to \${path} failed with status \${response.status}: \${text}\`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();
  return response.text();
}
`;

function authInjectionCode(auth: ReturnType<typeof detectAuth>): string {
  if (auth.kind === "bearer") {
    return `  const token = process.env.API_TOKEN;\n  if (token) headers.authorization = \`Bearer \${token}\`;\n`;
  }
  if (auth.kind === "apiKeyHeader") {
    return `  const apiKey = process.env.API_KEY;\n  if (apiKey) headers[${JSON.stringify(auth.headerName)}] = apiKey;\n`;
  }
  if (auth.kind === "apiKeyQuery") {
    return `  const apiKey = process.env.API_KEY;\n  if (apiKey) url.searchParams.set(${JSON.stringify(auth.queryName)}, apiKey);\n`;
  }
  return "";
}

function tryResolve(rawUrl: string, specSourceUrl: string): string | null {
  try {
    return new URL(rawUrl, specSourceUrl).toString();
  } catch {
    return null;
  }
}

function resolveBaseUrl(rawUrl: string | undefined, specSourceUrl: string | undefined, warnings: string[]): string {
  if (!rawUrl) return "https://api.example.com";
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;

  const resolved = specSourceUrl ? tryResolve(rawUrl, specSourceUrl) : null;
  if (resolved) return resolved;

  warnings.push(
    `The spec's server url ("${rawUrl}") is relative and couldn't be resolved to a full url. Set API_BASE_URL yourself before running the generated server.`,
  );
  return rawUrl;
}

export function generateFromOpenApi(doc: OpenApiDocument, serverName: string, specSourceUrl?: string): GenerateResult {
  const operations = extractOperations(doc);
  const auth = detectAuth(doc);
  const warnings: string[] = [];
  const baseUrl = resolveBaseUrl(doc.servers?.[0]?.url, specSourceUrl, warnings);
  const taken = new Set<string>();

  const tools = operations.map((op) => operationToTool(op, doc, taken));

  for (const op of operations) {
    if (op.unsupportedBodyContentType) {
      warnings.push(
        `"${op.operationId}" has a request body of type "${op.unsupportedBodyContentType}", which isn't supported yet. The generated tool won't send a body for it.`,
      );
    }
  }

  if (operations.length === 0) {
    warnings.push("No operations were found in this document.");
  }
  if (doc.security && doc.security.length > 0 && auth.kind === "none") {
    warnings.push(
      "This API declares a security requirement that isn't apiKey or http bearer (likely OAuth2), which isn't supported yet. Generated tools have no auth wired in.",
    );
  }

  return {
    serverName,
    mode: "openapi",
    tools,
    baseUrl,
    auth,
    clientFileCode: CLIENT_TEMPLATE(auth, baseUrl),
    warnings,
  };
}
