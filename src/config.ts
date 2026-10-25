import { readFile } from "node:fs/promises";

export type Config = {
  input: string;
  outDir: string;
  serverName: string;
};

export function printHelp() {
  console.log(`
mcpforge <input> [options]

turns an openapi spec or a file of typescript functions into a real, working mcp server.

input can be:
  a url ending in .json, .yaml, or .yml   (an openapi spec)
  a local .json, .yaml, or .yml file      (an openapi spec)
  a local .ts file                        (exported functions become tools)

options:
  --out <dir>     output directory for the generated server (default: derived from the input)
  --name <name>   name for the generated server (default: derived from the input)
  --help          show this message
  --version       print the installed version

examples:
  mcpforge https://myapi.com/openapi.json
  mcpforge ./openapi.yaml --out my-api-mcp
  mcpforge ./tools/weather.ts --name weather-mcp
`);
}

export async function readPackageVersion(): Promise<string> {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf-8"));
  return pkg.version;
}

function defaultNameFrom(input: string): string {
  let base: string;

  if (/^https?:\/\//i.test(input)) {
    base = new URL(input).hostname.replace(/^www\./i, "");
  } else {
    const withoutExt = input.replace(/\.(json|ya?ml|ts)$/i, "");
    base = withoutExt.split("/").filter(Boolean).pop() ?? withoutExt;
  }

  const cleaned = base
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return cleaned.length > 0 ? `${cleaned}-mcp` : "generated-mcp";
}

export async function parseArgs(argv: string[]): Promise<Config | null> {
  let input: string | null = null;
  let outDir: string | null = null;
  let serverName: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      return null;
    }
    if (arg === "--version" || arg === "-v") {
      console.log(await readPackageVersion());
      return null;
    }
    if (arg === "--out") {
      const value = argv[++i];
      if (!value) throw new Error("--out needs a directory path");
      outDir = value;
      continue;
    }
    if (arg === "--name") {
      const value = argv[++i];
      if (!value) throw new Error("--name needs a value");
      serverName = value;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (input) {
      throw new Error("Only one input can be turned into a server at a time.");
    }
    input = arg;
  }

  if (!input) {
    printHelp();
    return null;
  }

  const name = serverName ?? defaultNameFrom(input);
  return { input, outDir: outDir ?? name, serverName: name };
}
