export type GeneratedTool = {
  toolName: string;
  fileBaseName: string;
  description: string;
  zodShape: Record<string, string>;
  argsType: Record<string, string>;
  imports: string[];
  handlerBody: string;
};

export type AuthConfig =
  | { kind: "none" }
  | { kind: "bearer" }
  | { kind: "apiKeyHeader"; headerName: string }
  | { kind: "apiKeyQuery"; queryName: string };

export type GenerateResult = {
  serverName: string;
  tools: GeneratedTool[];
  mode: "openapi" | "typescript";
  baseUrl?: string;
  auth?: AuthConfig;
  clientFileCode?: string;
  sourceFiles?: { relativePath: string; code: string }[];
  warnings: string[];
};
