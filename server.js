const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp"
};

function serve(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, {"Content-Type": "text/plain; charset=utf-8"});
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
    });
    res.end(data);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/health") {
    res.writeHead(200, {"Content-Type": "application/json; charset=utf-8"});
    res.end(JSON.stringify({ok: true, service: "portal-viaticos-durandco"}));
    return;
  }

  let requestPath = decodeURIComponent(url.pathname);
  if (requestPath === "/") requestPath = "/index.html";

  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, {"Content-Type": "text/plain; charset=utf-8"});
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) return serve(filePath, res);
    serve(path.join(ROOT, "index.html"), res);
  });
}).listen(PORT, "0.0.0.0", () => {
  console.log(`Portal de Viáticos activo en puerto ${PORT}`);
});
