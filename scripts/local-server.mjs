import { createReadStream, existsSync } from "node:fs";
import { stat, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const rootDir = process.cwd();
const distDir = resolve(rootDir, "dist");
const port = Number(process.env.STUDY_RUNWAY_PORT || 4173);
const host = "127.0.0.1";

if (!existsSync(join(distDir, "index.html"))) {
  console.error("dist/index.html not found. Run a build first.");
  process.exit(1);
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
} ;

function safeResolve(urlPath) {
  const sanitizedPath = normalize(urlPath.replace(/^\/+/, ""));
  const resolvedPath = resolve(distDir, sanitizedPath);
  return resolvedPath.startsWith(distDir) ? resolvedPath : distDir;
}

async function sendFile(response, filePath) {
  const fileStat = await stat(filePath);
  response.writeHead(200, {
    "Content-Length": fileStat.size,
    "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const requestedPath = safeResolve(pathname);

    if (existsSync(requestedPath) && (await stat(requestedPath)).isFile()) {
      await sendFile(response, requestedPath);
      return;
    }

    const fallback = join(distDir, "index.html");
    const fallbackHtml = await readFile(fallback, "utf8");
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    response.end(fallbackHtml);
  } catch (error) {
    response.writeHead(500, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end(`Study Runway local server error: ${String(error)}`);
  }
});

server.listen(port, host, () => {
  console.log(`Study Runway is available at http://${host}:${port}/dashboard`);
});
