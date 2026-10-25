# mcpforge

Generates a working MCP server from an OpenAPI spec or a file of TypeScript functions, with typed tool arguments pulled straight from the source.

```bash
mcpforge https://myapi.com/openapi.json
```

```bash
mcpforge ./tools/weather.ts
```

Either one generates a full project: package.json, tsconfig, a README, and one file per tool, ready to install and build.

## Why this exists

MCP servers are usually written by hand, one tool at a time, each with its own Zod schema and its own handler. If you already have an OpenAPI spec or a file of plain functions, most of that is just a mechanical translation. This does the translation part so you can spend time on the parts that actually need a person.

## Install

This hasn't been published to npm yet, so for now clone it and run it directly:

```bash
git clone https://github.com/rohancoding5/mcpforge.git
cd mcpforge
npm install
npm run build
node dist/cli.js <input>
```

Once it's published, the plan is for `npx mcpforge <input>` to work the same way without cloning anything.

## Usage

```bash
mcpforge https://petstore3.swagger.io/api/v3/openapi.json
```

```bash
mcpforge ./openapi.yaml --out my-api-mcp
```

```bash
mcpforge ./tools/weather.ts --name weather-mcp
```

After generating, the server still needs its own install and build before it can run:

```bash
cd weather-mcp
npm install
npm run build
node dist/index.js
```

### Options

```
--out <dir>     output directory for the generated server (default: derived from the input)
--name <name>   name for the generated server (default: derived from the input)
--help          show usage
--version       print the installed version
```

## How it decides what to generate

A URL ending in `.json`, `.yaml`, or `.yml`, or a local file with one of those extensions, gets treated as an OpenAPI spec. Every operation becomes a tool. Path, query, and header parameters become typed arguments. A JSON request body gets flattened into the tool's arguments too, so calling the tool doesn't mean nesting everything under a `body` key. `$ref` pointers get resolved against the rest of the document, including nested objects and arrays.

If the spec declares an API key or bearer auth scheme, that gets wired into the generated client automatically, reading the actual key from an environment variable at runtime. OAuth2 isn't supported yet, since it needs a token exchange flow rather than just forwarding a static value.

A local `.ts` file gets scanned for exported functions using the TypeScript compiler, not just pattern matching on the text. Each exported function becomes a tool, using its actual parameter types to build the schema and its JSDoc comment (the first line of it) as the tool's description. The original file gets copied into the generated project and the tool just calls the function directly, no HTTP involved.

Destructured parameters (`function foo({ a, b }: Args)`) aren't supported yet. Give the function plain named parameters instead.

### Known limitations

JSON and form-urlencoded request bodies both get turned into tool arguments. Anything else (file uploads, raw binary bodies) doesn't. If an operation only has a body like that, the tool still gets created but won't send the body, and a warning gets printed telling you which operation to fix by hand.

## What gets generated

```
my-server/
  package.json
  tsconfig.json
  README.md
  src/
    index.ts
    tools/
      tool_one.ts
      tool_two.ts
    client.ts          (openapi mode only)
    source/
      original.ts       (typescript mode only, your file copied in)
```

Every tool file is plain TypeScript. Open any generated file and you can see exactly what it does.

## Development

```bash
git clone https://github.com/rohancoding5/mcpforge.git
cd mcpforge
npm install
npm test
```

`npm test` builds the project and runs the full suite with Node's built-in test runner: unit tests for schema conversion, operation extraction, and function extraction, plus a set that runs the generated client code against a local HTTP server to check the request it sends, not just that it compiles.

It was also tested against the Swagger Petstore demo during development, which caught a few bugs a fixture-only test suite wouldn't have: a relative server URL in the spec not getting resolved against the spec's own address, a URL-joining bug that silently dropped a base URL's path prefix, and array query parameters getting joined into one comma-separated string instead of sent as separate values. All of them are covered by tests now.

## License

MIT
