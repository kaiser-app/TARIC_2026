import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import classify from "./netlify/functions/classify.mjs";
import health from "./netlify/functions/health.mjs";
import measures from "./netlify/functions/measures.mjs";
import nomenclatureTree from "./netlify/functions/nomenclature-tree.mjs";
import tariffAgent from "./netlify/functions/tariff-agent.mjs";
import taricSearch from "./netlify/functions/taric-search.mjs";

const root = fileURLToPath(new URL("./dist/", import.meta.url));
const port = Number(process.env.PORT || 3000);
const functions = new Map([["/api/classify", classify], ["/api/health", health], ["/api/measures", measures], ["/api/nomenclature-tree", nomenclatureTree], ["/api/tariff-agent", tariffAgent], ["/api/taric-search", taricSearch]]);
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon" };

async function bodyOf(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); return Buffer.concat(chunks); }
async function runFunction(handler, request, response) {
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : await bodyOf(request);
  const webRequest = new Request(`http://${request.headers.host || "localhost"}${request.url}`, { method: request.method, headers: request.headers, body });
  const result = await handler(webRequest);
  response.writeHead(result.status, Object.fromEntries(result.headers));
  response.end(Buffer.from(await result.arrayBuffer()));
}
async function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const safe = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  let path = join(root, safe);
  try { if (!(await stat(path)).isFile()) throw new Error("not a file"); } catch { path = join(root, "index.html"); }
  const content = await readFile(path);
  response.writeHead(200, { "content-type": mime[extname(path)] || "application/octet-stream", "cache-control": path.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable" });
  response.end(content);
}
createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const handler = functions.get(pathname);
    if (handler) return await runFunction(handler, request, response);
    if (pathname.startsWith("/api/")) { response.writeHead(404, { "content-type": "application/json; charset=utf-8" }); return response.end(JSON.stringify({ error: "Ismeretlen API-végpont." })); }
    await serveStatic(request, response);
  } catch (error) { console.error(error); response.writeHead(500, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ error: "Belső szerverhiba." })); }
}).listen(port, "0.0.0.0", () => console.log(`TARIC server listening on ${port}`));
