import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { execFile } from "node:child_process";
import { createRecordingHandler } from "./recordings.mjs";
const root = resolve(import.meta.dirname, "../dist");
const recordings = createRecordingHandler(
  resolve(import.meta.dirname, "../../personal-recordings"),
);
try {
  await stat(resolve(root, "index.html"));
} catch {
  console.error("Build first: npm ci, npm run assets:prepare, npm run build");
  process.exit(1);
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".ttf": "font/ttf",
  ".task": "application/octet-stream",
};
const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, "http://localhost");
    if (await recordings(req, res, requestUrl.pathname)) return;
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }
    const name = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      ),
      path = resolve(root, "." + (name === "/" ? "/index.html" : name));
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const data = await readFile(path);
    res.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.on("error", (e) => {
  console.error("Could not start local server:", e.message);
  process.exit(1);
});
server.listen(4318, "127.0.0.1", () => {
  const url = "http://127.0.0.1:4318/";
  console.log(
    `Crux Motion: ${url}\nKeep this window open while playing. Ctrl+C stops the server.`,
  );
  if (process.platform === "win32" && !process.argv.includes("--no-open"))
    execFile("rundll32", ["url.dll,FileProtocolHandler", url]);
});
