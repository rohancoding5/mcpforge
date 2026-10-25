import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server, type IncomingMessage } from "node:http";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";
import { generateFromOpenApi } from "../openapi/generate.js";
import type { OpenApiDocument } from "../openapi/parse.js";
import { withTempDir } from "./test-utils.js";

function startRecordingServer(): Promise<{ server: Server; url: string; requests: { url: string }[] }> {
  const requests: { url: string }[] = [];
  return new Promise((resolvePromise) => {
    const server = createServer((req: IncomingMessage, res) => {
      requests.push({ url: req.url ?? "" });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, receivedUrl: req.url }));
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolvePromise({ server, url: `http://127.0.0.1:${port}`, requests });
    });
  });
}

async function loadClientModule(dir: string, fileName: string, tsCode: string) {
  const jsCode = ts.transpileModule(tsCode, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const filePath = join(dir, fileName);
  await writeFile(filePath, jsCode);
  return import(filePath);
}

function docWithBaseUrl(url: string, auth?: OpenApiDocument["components"]): OpenApiDocument {
  return {
    paths: { "/pets/{id}": { get: { operationId: "getPet" } } },
    servers: [{ url }],
    components: auth,
  };
}

test("apiRequest preserves a base url's own path prefix instead of dropping it", async () => {
  const { server, url, requests } = await startRecordingServer();
  try {
    await withTempDir(async (dir) => {
      const result = generateFromOpenApi(docWithBaseUrl(`${url}/api/v3`), "test");
      process.env.API_BASE_URL = `${url}/api/v3`;
      const client = await loadClientModule(dir, "client1.mjs", result.clientFileCode ?? "");
      await client.apiRequest("GET", "/pets/findByStatus");
      delete process.env.API_BASE_URL;
    });
    assert.equal(requests[0].url, "/api/v3/pets/findByStatus");
  } finally {
    server.close();
  }
});

test("apiRequest works when the base url has a trailing slash", async () => {
  const { server, url, requests } = await startRecordingServer();
  try {
    await withTempDir(async (dir) => {
      const result = generateFromOpenApi(docWithBaseUrl(`${url}/api/`), "test");
      process.env.API_BASE_URL = `${url}/api/`;
      const client = await loadClientModule(dir, "client2.mjs", result.clientFileCode ?? "");
      await client.apiRequest("GET", "/pets/1");
      delete process.env.API_BASE_URL;
    });
    assert.equal(requests[0].url, "/api/pets/1");
  } finally {
    server.close();
  }
});

test("apiRequest attaches query parameters correctly", async () => {
  const { server, url, requests } = await startRecordingServer();
  try {
    await withTempDir(async (dir) => {
      const result = generateFromOpenApi(docWithBaseUrl(url), "test");
      process.env.API_BASE_URL = url;
      const client = await loadClientModule(dir, "client3.mjs", result.clientFileCode ?? "");
      await client.apiRequest("GET", "/pets", { query: { status: "available", limit: 5 } });
      delete process.env.API_BASE_URL;
    });
    const receivedUrl = new URL(requests[0].url, "http://localhost");
    assert.equal(receivedUrl.pathname, "/pets");
    assert.equal(receivedUrl.searchParams.get("status"), "available");
    assert.equal(receivedUrl.searchParams.get("limit"), "5");
  } finally {
    server.close();
  }
});

test("apiRequest sends an array query value as repeated keys, not a joined string", async () => {
  const { server, url, requests } = await startRecordingServer();
  try {
    await withTempDir(async (dir) => {
      const result = generateFromOpenApi(docWithBaseUrl(url), "test");
      process.env.API_BASE_URL = url;
      const client = await loadClientModule(dir, "client6.mjs", result.clientFileCode ?? "");
      await client.apiRequest("GET", "/pets", { query: { tags: ["a", "b", "c"] } });
      delete process.env.API_BASE_URL;
    });
    const receivedUrl = new URL(requests[0].url, "http://localhost");
    assert.deepEqual(receivedUrl.searchParams.getAll("tags"), ["a", "b", "c"]);
  } finally {
    server.close();
  }
});

test("apiRequest sends a form-encoded body when told to", async () => {
  const { server, url } = await startRecordingServer();
  const receivedBodies: string[] = [];
  const receivedContentTypes: string[] = [];
  server.removeAllListeners("request");
  server.on("request", (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      receivedBodies.push(Buffer.concat(chunks).toString("utf8"));
      receivedContentTypes.push(String(req.headers["content-type"] ?? ""));
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  try {
    await withTempDir(async (dir) => {
      const result = generateFromOpenApi(docWithBaseUrl(url), "test");
      process.env.API_BASE_URL = url;
      const client = await loadClientModule(dir, "client7.mjs", result.clientFileCode ?? "");
      await client.apiRequest("POST", "/pets", { body: { name: "fido", status: "available" }, encoding: "form" });
      delete process.env.API_BASE_URL;
    });
    assert.equal(receivedContentTypes[0], "application/x-www-form-urlencoded");
    const parsed = new URLSearchParams(receivedBodies[0]);
    assert.equal(parsed.get("name"), "fido");
    assert.equal(parsed.get("status"), "available");
  } finally {
    server.close();
  }
});

test("apiRequest injects a bearer token from API_TOKEN", async () => {
  const { server, url } = await startRecordingServer();
  const receivedHeaders: string[] = [];
  server.removeAllListeners("request");
  server.on("request", (req, res) => {
    receivedHeaders.push(String(req.headers.authorization ?? ""));
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  try {
    await withTempDir(async (dir) => {
      const doc = docWithBaseUrl(url, {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
      });
      doc.security = [{ bearerAuth: [] }];
      const result = generateFromOpenApi(doc, "test");
      process.env.API_BASE_URL = url;
      process.env.API_TOKEN = "secret-token";
      const client = await loadClientModule(dir, "client4.mjs", result.clientFileCode ?? "");
      await client.apiRequest("GET", "/pets");
      delete process.env.API_BASE_URL;
      delete process.env.API_TOKEN;
    });
    assert.equal(receivedHeaders[0], "Bearer secret-token");
  } finally {
    server.close();
  }
});

test("apiRequest throws a clear error on a non-ok response", async () => {
  const { server, url } = await startRecordingServer();
  server.removeAllListeners("request");
  server.on("request", (_req, res) => {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  try {
    await withTempDir(async (dir) => {
      const result = generateFromOpenApi(docWithBaseUrl(url), "test");
      process.env.API_BASE_URL = url;
      const client = await loadClientModule(dir, "client5.mjs", result.clientFileCode ?? "");
      await assert.rejects(() => client.apiRequest("GET", "/missing"), /404/);
      delete process.env.API_BASE_URL;
    });
  } finally {
    server.close();
  }
});
