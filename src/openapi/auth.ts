import type { AuthConfig } from "../types.js";
import type { OpenApiDocument } from "./parse.js";

type SecurityScheme = {
  type: string;
  scheme?: string;
  in?: string;
  name?: string;
};

export function detectAuth(doc: OpenApiDocument): AuthConfig {
  const schemes = doc.components?.securitySchemes ?? {};
  const requiredNames = new Set<string>();
  for (const requirement of doc.security ?? []) {
    for (const name of Object.keys(requirement)) requiredNames.add(name);
  }

  const candidates = requiredNames.size > 0 ? [...requiredNames] : Object.keys(schemes);

  for (const name of candidates) {
    const scheme = schemes[name] as SecurityScheme | undefined;
    if (!scheme) continue;

    if (scheme.type === "http" && scheme.scheme === "bearer") {
      return { kind: "bearer" };
    }
    if (scheme.type === "apiKey" && scheme.in === "header" && scheme.name) {
      return { kind: "apiKeyHeader", headerName: scheme.name };
    }
    if (scheme.type === "apiKey" && scheme.in === "query" && scheme.name) {
      return { kind: "apiKeyQuery", queryName: scheme.name };
    }
  }

  return { kind: "none" };
}
