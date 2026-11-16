const { randomBytes } = require("node:crypto");
const { realpath, stat } = require("node:fs/promises");
const { extname, isAbsolute, relative, resolve, sep } = require("node:path");

const links = new Map();
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
const configuredBaseUrl =
  process.env.BASE_URL ||
  (railwayDomain
    ? `${railwayDomain.startsWith("http") ? "" : "https://"}${railwayDomain}`
    : `http://localhost:${port}`);
const parsedBaseUrl = new URL(configuredBaseUrl);

if (parsedBaseUrl.protocol !== "http:" && parsedBaseUrl.protocol !== "https:") {
  throw new Error("BASE_URL must use http or https");
}

const baseUrl = parsedBaseUrl.origin;
const publicRoot = process.env.PUBLIC_DIR
  ? resolve(process.env.PUBLIC_DIR)
  : null;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function response(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, ...headers },
  });
}

function json(body, status = 200) {
  return response(JSON.stringify(body), status, {
    "Content-Type": "application/json; charset=utf-8",
  });
}

function createCode() {
  let code = "";
  while (code.length < 6) {
    for (const value of randomBytes(16)) {
      if (value < 248) {
        code += alphabet[value % alphabet.length];
        if (code.length === 6) break;
      }
    }
  }
  return code;
}

function shortUrl(code) {
  return `${baseUrl}/${code}`;
}

async function findPublicFile(pathname) {
  if (!publicRoot) return null;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const requestedPath =
    decodedPath === "/" ? "index.html" : `.${decodedPath}`;
  const candidate = resolve(publicRoot, requestedPath);

  let root;
  let filePath;
  try {
    [root, filePath] = await Promise.all([
      realpath(publicRoot),
      realpath(candidate),
    ]);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }

  const pathFromRoot = relative(root, filePath);
  if (
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    return null;
  }

  let details;
  try {
    details = await stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }

  return details.isFile() ? filePath : null;
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".eot": "application/vnd.ms-fontobject",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === "OPTIONS") {
      return response(null, 204);
    }

    if (request.method === "POST" && pathname === "/api/links") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Request body must be valid JSON" }, 400);
      }

      if (typeof body?.url !== "string") {
        return json({ error: "url must be an HTTP or HTTPS URL" }, 400);
      }

      let parsedUrl;
      try {
        parsedUrl = new URL(body.url);
      } catch {
        return json({ error: "url must be an HTTP or HTTPS URL" }, 400);
      }

      if (
        (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") ||
        !parsedUrl.hostname
      ) {
        return json({ error: "url must be an HTTP or HTTPS URL" }, 400);
      }

      let code;
      do {
        code = createCode();
      } while (links.has(code));

      const link = {
        code,
        url: body.url,
        shortUrl: shortUrl(code),
        hits: 0,
        createdAt: new Date().toISOString(),
      };
      links.set(code, link);
      return json(link, 201);
    }

    if (request.method === "GET" && pathname === "/api/links") {
      return json(Array.from(links.values()));
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const publicFile = await findPublicFile(pathname);
      if (publicFile) {
        return response(Bun.file(publicFile), 200, {
          "Content-Type":
            mimeTypes[extname(publicFile).toLowerCase()] ||
            "application/octet-stream",
        });
      }
    }

    const shortCodeMatch = pathname.match(/^\/([^/]+)$/);
    if (request.method === "GET" && shortCodeMatch) {
      const link = links.get(shortCodeMatch[1]);
      if (!link) return json({ error: "Link not found" }, 404);

      link.hits += 1;
      return response(null, 302, { Location: link.url });
    }

    return json({ error: "Not found" }, 404);
  },
});

console.log(`Snip backend listening on ${baseUrl}`);
