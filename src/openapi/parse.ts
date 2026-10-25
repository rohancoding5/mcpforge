import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

export type OpenApiDocument = {
  openapi?: string;
  swagger?: string;
  servers?: { url: string }[];
  paths?: Record<string, Record<string, unknown>>;
  security?: { [scheme: string]: string[] }[];
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
};

function looksLikeUrl(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

export async function loadOpenApiDocument(input: string): Promise<OpenApiDocument> {
  const raw = looksLikeUrl(input) ? await fetchSpec(input) : await readFile(input, "utf-8");
  const trimmed = raw.trim();

  const doc = trimmed.startsWith("{") ? (JSON.parse(raw) as OpenApiDocument) : (parseYaml(raw) as OpenApiDocument);

  if (!doc.openapi && !doc.swagger) {
    throw new Error("That file doesn't look like an OpenAPI or Swagger document (no openapi or swagger field).");
  }
  if (doc.swagger && !doc.openapi) {
    throw new Error("Swagger 2.0 documents aren't supported yet. Convert it to OpenAPI 3.x first.");
  }
  if (!doc.paths || Object.keys(doc.paths).length === 0) {
    throw new Error("This OpenAPI document has no paths to generate tools from.");
  }

  return doc;
}

async function fetchSpec(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Couldn't fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}
