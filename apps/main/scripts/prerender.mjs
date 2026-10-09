import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(__dirname, "..");
const distDir = path.join(siteRoot, "dist");
const fallbackIndex = path.join(distDir, "index.html");
const port = Number(process.env.PRERENDER_PORT || 5178);
const baseUrl = `http://127.0.0.1:${port}`;

const routes = [
  "/",
  "/services",
  "/services/boundary-surveys",
  "/services/property-line-stake-out",
  "/services/elevation-certificates",
  "/services/construction-staking",
  "/services/alta-nsps-surveys",
  "/services/topographic-surveys",
  "/contact",
  "/company",
  "/services/discounts",
  "/positions",
  "/privacy-policy",
  "/terms-of-service",
  "/eula",
];

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".pdf", "application/pdf"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
]);

if (!existsSync(fallbackIndex)) {
  throw new Error(`Cannot prerender because ${fallbackIndex} does not exist. Run vite build first.`);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", baseUrl);
    const filePath = resolveStaticPath(url.pathname);
    const ext = path.extname(filePath);

    response.statusCode = 200;
    response.setHeader("Content-Type", mimeTypes.get(ext) || "application/octet-stream");
    const stream = createReadStream(filePath);
    stream.on("error", () => {
      response.statusCode = 500;
      response.end("Internal prerender server error");
    });
    stream.pipe(response);
  } catch {
    response.statusCode = 500;
    response.end("Internal prerender server error");
  }
});

await listen(server, port);

let browser;
try {
  const systemChrome = process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '';
  browser = await chromium.launch(existsSync(chromium.executablePath()) ? {} : existsSync(systemChrome) ? { executablePath: systemChrome } : {});
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1200 },
  });

  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => {
      const root = document.getElementById("root");
      return Boolean(root?.children.length) && document.title.length > 0;
    });

    const html = await page.content();
    const outPath = routeToOutputPath(route);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, html, "utf8");
    console.log(`prerendered ${route} -> ${path.relative(siteRoot, outPath)}`);
  }
} finally {
  if (browser) await browser.close();
  await close(server);
}

function resolveStaticPath(pathname) {
  const decodedPath = decodeURIComponent(pathname);
  const safePath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const directPath = path.join(distDir, safePath);

  if (existsSync(directPath) && statSync(directPath).isFile()) return directPath;

  const indexPath = path.join(directPath, "index.html");
  if (existsSync(indexPath)) return indexPath;

  return fallbackIndex;
}

function routeToOutputPath(route) {
  if (route === "/") return fallbackIndex;

  const outDir = path.join(distDir, route.replace(/^\//, ""));
  return path.join(outDir, "index.html");
}

function listen(serverToStart, targetPort) {
  return new Promise((resolve, reject) => {
    serverToStart.once("error", reject);
    serverToStart.listen(targetPort, "127.0.0.1", () => {
      serverToStart.off("error", reject);
      resolve();
    });
  });
}

function close(serverToClose) {
  return new Promise((resolve, reject) => {
    serverToClose.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
