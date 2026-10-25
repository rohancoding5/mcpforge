import type { JsonSchema } from "./jsonschema.js";
import { resolveRef } from "./jsonschema.js";
import type { OpenApiDocument } from "./parse.js";

const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "options", "head"] as const;

export type OperationParam = {
  name: string;
  location: "path" | "query" | "header";
  required: boolean;
  schema: JsonSchema;
};

export type Operation = {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  parameters: OperationParam[];
  requestBodySchema?: JsonSchema;
  requestBodyRequired: boolean;
  requestBodyEncoding?: "json" | "form";
  unsupportedBodyContentType?: string;
};

type RawParam = {
  $ref?: string;
  name?: string;
  in?: string;
  required?: boolean;
  schema?: JsonSchema;
};

function resolveParam(doc: OpenApiDocument, param: RawParam): RawParam {
  if (param.$ref) {
    const resolved = resolveRef(doc, param.$ref) as RawParam | undefined;
    return resolved ?? param;
  }
  return param;
}

export function extractOperations(doc: OpenApiDocument): Operation[] {
  const operations: Operation[] = [];

  for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
    const sharedParams = ((pathItem.parameters as RawParam[]) ?? []).map((p) => resolveParam(doc, p));

    for (const method of HTTP_METHODS) {
      const rawOp = pathItem[method] as Record<string, unknown> | undefined;
      if (!rawOp) continue;

      const ownParams = ((rawOp.parameters as RawParam[]) ?? []).map((p) => resolveParam(doc, p));
      const merged = new Map<string, RawParam>();
      for (const param of [...sharedParams, ...ownParams]) {
        if (param.name) merged.set(`${param.in}:${param.name}`, param);
      }

      const parameters: OperationParam[] = [...merged.values()]
        .filter((p): p is Required<Pick<RawParam, "name" | "in">> & RawParam => Boolean(p.name && p.in))
        .filter((p) => p.in === "path" || p.in === "query" || p.in === "header")
        .map((p) => ({
          name: p.name as string,
          location: p.in as "path" | "query" | "header",
          required: Boolean(p.required) || p.in === "path",
          schema: p.schema ?? {},
        }));

      const requestBody = rawOp.requestBody as
        | { required?: boolean; content?: Record<string, { schema?: JsonSchema }> }
        | undefined;
      const jsonBody = requestBody?.content?.["application/json"];
      const formBody = requestBody?.content?.["application/x-www-form-urlencoded"];
      const usableBody = jsonBody ?? formBody;
      const otherContentType = requestBody?.content ? Object.keys(requestBody.content)[0] : undefined;

      const operationId =
        typeof rawOp.operationId === "string" && rawOp.operationId.trim().length > 0
          ? rawOp.operationId
          : `${method}_${path}`;

      operations.push({
        operationId,
        method: method.toUpperCase(),
        path,
        summary:
          (typeof rawOp.summary === "string" && rawOp.summary) ||
          (typeof rawOp.description === "string" && rawOp.description) ||
          `${method.toUpperCase()} ${path}`,
        parameters,
        requestBodySchema: usableBody?.schema,
        requestBodyRequired: Boolean(requestBody?.required),
        requestBodyEncoding: usableBody ? (jsonBody ? "json" : "form") : undefined,
        unsupportedBodyContentType: !usableBody ? otherContentType : undefined,
      });
    }
  }

  return operations;
}
