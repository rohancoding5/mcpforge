export type InputMode = "openapi" | "typescript";

export function detectMode(input: string): InputMode {
  if (/^https?:\/\//i.test(input)) return "openapi";

  const lower = input.toLowerCase();
  if (lower.endsWith(".json") || lower.endsWith(".yaml") || lower.endsWith(".yml")) return "openapi";
  if (lower.endsWith(".ts")) return "typescript";

  throw new Error(
    `Couldn't figure out what "${input}" is. Pass an OpenAPI URL, a .json/.yaml/.yml file, or a .ts file.`,
  );
}
