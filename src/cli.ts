import { resolve } from "node:path";
import { parseArgs } from "./config.js";
import { detectMode } from "./detect.js";
import { loadOpenApiDocument } from "./openapi/parse.js";
import { generateFromOpenApi } from "./openapi/generate.js";
import { generateFromTypeScript } from "./typescript/generate.js";
import { writeGeneratedServer } from "./scaffold.js";
import type { GenerateResult } from "./types.js";

function printSummary(result: GenerateResult, outDir: string) {
  console.log("");
  console.log(`generated ${result.tools.length} tool${result.tools.length === 1 ? "" : "s"} in ${outDir}`);
  console.log("");
  for (const tool of result.tools) {
    console.log(`  ${tool.toolName}`);
  }
  if (result.warnings.length > 0) {
    console.log("");
    console.log("notes:");
    for (const warning of result.warnings) {
      console.log(`  ${warning}`);
    }
  }
  console.log("");
  console.log("next steps:");
  console.log(`  cd ${outDir}`);
  console.log("  npm install");
  console.log("  npm run build");
  console.log("");
}

async function main() {
  let config;
  try {
    config = await parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  if (!config) {
    process.exit(0);
  }

  try {
    const mode = detectMode(config.input);
    const specSourceUrl = /^https?:\/\//i.test(config.input) ? config.input : undefined;
    const result =
      mode === "openapi"
        ? generateFromOpenApi(await loadOpenApiDocument(config.input), config.serverName, specSourceUrl)
        : await generateFromTypeScript(resolve(config.input), config.serverName);

    if (result.tools.length === 0) {
      console.error("no tools could be generated from that input.");
      for (const warning of result.warnings) console.error(warning);
      process.exit(1);
    }

    await writeGeneratedServer(result, config.outDir);
    printSummary(result, config.outDir);
    process.exit(0);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}

main();
