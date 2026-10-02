// Fairy Peony "Shop the Look" admin. Runs ONLY on your computer (localhost).
//   npm run looks:app     ->  http://localhost:4320
// Saves data/looks.json and rebuilds public/index.html. "Push live" sends it to GitHub.

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { renderSite, CATEGORIES } = require("./render");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const DATA_FILE = path.join(ROOT_DIR, "data", "looks.json");
const SITE_DIR = path.join(ROOT_DIR, "public");
const ADMIN_DIR = path.join(__dirname, "public");

const PORT = Number(process.env.PORT || 4320);
const CURRENCY = process.env.LOOKS_CURRENCY || "$"; // change to your store's currency symbol if needed
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

/* ---------------- storage ---------------- */

function readLooks() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(data.looks) ? data.looks : [];
  } catch {
    return [];
  }
}

function saveLooks(looks) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify({ looks }, null, 2) + "\n", "utf8");
  buildSite(looks);
}

function buildSite(looks = readLooks()) {
  // Reload the page template every time, so updates to render.js apply without restarting the admin.
  const renderPath = require.resolve("./render");
  delete require.cache[renderPath];
  const { renderSite: render } = require(renderPath);
  fs.mkdirSync(SITE_DIR, { recursive: true });
  fs.writeFileSync(path.join(SITE_DIR, "index.html"), render(looks), "utf8");
}

/* ---------------- helpers ---------------- */

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function clean(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function isHttp(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function isShopUrl(value) {
  try {
    const u = new URL(value);
    const h = u.hostname.toLowerCase();
    return (
      (u.protocol === "https:" || u.protocol === "http:") &&
      (h === "fairypeony.com" || h.endsWith(".fairypeony.com") || h.endsWith(".myshopify.com"))
    );
  } catch {
    return false;
  }
}

function splitLinks(input) {
  const raw = Array.isArray(input) ? input.join("\n") : String(input || "");
  const seen = new Set();
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s || seen.has(s)) return false;
      seen.add(s);
      return true;
    });
}

function normalizePinImage(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "i.pinimg.com") {
      u.pathname = u.pathname.replace(/^\/(\d+x\d*|originals)\//, "/736x/");
      return u.toString();
    }
  } catch {}
  return url;
}

function prettyFromHandle(handle) {
  return decodeURIComponent(handle)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchText(url, ms = 12000) {
  const res = await fetch(url, {
    headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(ms),
  });
  return { ok: res.ok, text: await res.text() };
}

/* ---------------- Pinterest image ---------------- */

async function resolveImage(raw) {
  if (!isHttp(raw)) throw new Error("The image link must start with https://");
  const u = new URL(raw);
  const host = u.hostname.toLowerCase();
  const warnings = [];

  if (host === "i.pinimg.com") return { imageUrl: normalizePinImage(raw), warnings };

  if (host === "pin.it" || host === "pinterest.com" || host.endsWith(".pinterest.com")) {
    try {
      const { text } = await fetchText(raw);
      const og =
        text.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (og) return { imageUrl: normalizePinImage(og[1].replace(/&amp;/g, "&")), warnings };
    } catch {}
    throw new Error(
      'Could not read that Pinterest page. On Pinterest right-click the image and choose "Copy image address" (starts with https://i.pinimg.com/), then paste it here.'
    );
  }

  return { imageUrl: raw, warnings };
}

/* ---------------- Shopify product ---------------- */

async function resolveProduct(raw) {
  if (!isShopUrl(raw)) {
    return { url: raw, title: "", image: "", price: "", ok: false, error: "Not a fairypeony.com link" };
  }
  const u = new URL(raw);
  const m = u.pathname.match(/\/products\/([^/?#]+)/);
  if (!m) return { url: raw, title: "", image: "", price: "", ok: false, error: "Not a product link" };

  const clean_url = `https://${u.hostname}/products/${m[1]}`;
  try {
    const { ok, text } = await fetchText(`${clean_url}.js`, 10000);
    if (ok) {
      const p = JSON.parse(text);
      let image = String(p.featured_image || (p.images && p.images[0]) || "");
      if (image.startsWith("//")) image = "https:" + image;
      return {
        url: clean_url,
        title: clean(p.title, 200),
        image,
        price: typeof p.price === "number" ? `${CURRENCY}${(p.price / 100).toFixed(2)}` : "",
        ok: true,
      };
    }
  } catch {}
  return { url: clean_url, title: prettyFromHandle(m[1]), image: "", price: "", ok: false, error: "Saved the link only" };
}

/* ---------------- analyze / publish ---------------- */

function categoryLabel(key) {
  return (CATEGORIES.find((c) => c.key === key) || {}).label || key;
}

async function analyze(input) {
  const category = clean(input.category, 20).toLowerCase();
  if (!CATEGORIES.some((c) => c.key === category)) throw new Error("Choose a category.");

  const sourceImage = clean(input.imageUrl, 900);
  if (!sourceImage) throw new Error("Paste the Pinterest image link.");
  const { imageUrl, warnings } = await resolveImage(sourceImage);

  const urls = splitLinks(input.productUrls).slice(0, 30);
  const bad = urls.filter((u) => !isShopUrl(u));
  if (bad.length) throw new Error(`These links are not from fairypeony.com: ${bad.join(", ")}`);

  const products = await Promise.all(urls.map(resolveProduct));
  products.forEach((p) => {
    if (!p.ok) warnings.push(`${p.url}: ${p.error || "details not found"}`);
  });
  if (!urls.length) warnings.push("No product links added yet.");

  return {
    sourceImage,
    sourceLinks: urls,
    imageUrl,
    category,
    categoryLabel: categoryLabel(category),
    title: clean(input.title, 120),
    altText: clean(input.altText, 200),
    products,
    warnings,
    dataFile: "data/looks.json",
    pageFile: "public/index.html",
  };
}

function canReuse(input, analysis) {
  if (!analysis || !analysis.sourceImage) return false;
  const urls = splitLinks(input.productUrls);
  return (
    analysis.sourceImage === clean(input.imageUrl, 900) &&
    JSON.stringify(analysis.sourceLinks) === JSON.stringify(urls) &&
    analysis.category === clean(input.category, 20).toLowerCase() &&
    analysis.title === clean(input.title, 120) &&
    analysis.altText === clean(input.altText, 200)
  );
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function publish(body) {
  const analysis = canReuse(body, body.analysis) ? body.analysis : await analyze(body);
  const looks = readLooks();
  const now = Date.now();
  const data = {
    imageUrl: analysis.imageUrl,
    category: analysis.category,
    title: analysis.title,
    altText: analysis.altText,
    products: analysis.products.map(({ url, title, image, price }) => ({ url, title, image, price })),
  };
  // Picture size (measured by the admin page). Lets phones reserve space so the page doesn't jump while loading.
  const w = Math.round(Number(body.imageWidth));
  const h = Math.round(Number(body.imageHeight));
  if (w > 0 && h > 0 && w < 20000 && h < 20000) {
    data.width = w;
    data.height = h;
  }

  let look = body.id ? looks.find((l) => l.id === body.id) : null;
  if (look) {
    const imageChanged = look.imageUrl !== data.imageUrl;
    Object.assign(look, data, { updatedAt: now });
    if (imageChanged && !data.width) {
      delete look.width; // old size no longer applies to the new picture
      delete look.height;
    }
  } else {
    look = { id: newId(), ...data, createdAt: now };
    looks.push(look);
  }
  saveLooks(looks);
  return { look, analysis, updated: Boolean(body.id) };
}

/* ---------------- git push ---------------- */

function git(args) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd: ROOT_DIR, timeout: 120000, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: `${stdout || ""}${stderr || ""}`.trim(), missing: err && err.code === "ENOENT" });
    });
  });
}

async function pushLive() {
  const inside = await git(["rev-parse", "--is-inside-work-tree"]);
  if (inside.missing) throw new Error("Git is not installed on this computer.");
  if (inside.code !== 0) {
    throw new Error(
      "This folder is not connected to GitHub yet. One time only: open a terminal here and run  git init, git remote add origin <your repo link>, git branch -M main."
    );
  }
  await git(["add", "data", "public"]);
  const commit = await git(["commit", "-m", "Update Shop the Look"]);
  const nothing = /nothing (added )?to commit|no changes added/i.test(commit.out);
  if (commit.code !== 0 && !nothing) throw new Error(commit.out || "Commit failed.");

  let push = await git(["push"]);
  if (push.code !== 0 && /no upstream|set-upstream/i.test(push.out)) {
    push = await git(["push", "-u", "origin", "HEAD"]);
  }
  if (push.code !== 0) throw new Error(push.out || "Push failed.");
  return { output: push.out || "Pushed.", nothing };
}

/* ---------------- static files ---------------- */

function sendFile(res, baseDir, relative) {
  const filePath = path.resolve(baseDir, relative);
  if (filePath !== baseDir && !filePath.startsWith(baseDir + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
    res.end(buf);
  });
}

/* ---------------- server ---------------- */

const server = http.createServer(async (req, res) => {
  try {
    // Only answer requests addressed to localhost (blocks DNS-rebinding tricks)
    const hostHeader = String(req.headers.host || "").split(":")[0];
    if (hostHeader !== "localhost" && hostHeader !== "127.0.0.1") {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const p = url.pathname;

    if (req.method === "GET" && p === "/api/looks") return json(res, 200, { looks: readLooks().sort((a, b) => b.createdAt - a.createdAt), categories: CATEGORIES });

    if (req.method === "POST" && p === "/api/analyze") return json(res, 200, { analysis: await analyze(await readBody(req)) });

    if (req.method === "POST" && p === "/api/publish") return json(res, 200, { ok: true, ...(await publish(await readBody(req))) });

    if (req.method === "POST" && p === "/api/push") return json(res, 200, { ok: true, ...(await pushLive()) });

    if (req.method === "POST" && p === "/api/looks/delete") {
      const { ids } = await readBody(req);
      if (!Array.isArray(ids) || !ids.length) return json(res, 400, { error: "Nothing selected." });
      const remove = new Set(ids.map(String));
      const looks = readLooks();
      const next = looks.filter((l) => !remove.has(l.id));
      saveLooks(next);
      return json(res, 200, { ok: true, deleted: looks.length - next.length });
    }

    const del = p.match(/^\/api\/looks\/([\w-]+)$/);
    if (req.method === "DELETE" && del) {
      const looks = readLooks();
      const next = looks.filter((l) => l.id !== del[1]);
      if (next.length === looks.length) return json(res, 404, { error: "Look not found." });
      saveLooks(next);
      return json(res, 200, { ok: true });
    }

    // Preview of the real public page
    if (req.method === "GET" && (p === "/site" || p.startsWith("/site/"))) {
      if (p === "/site") {
        res.writeHead(302, { location: "/site/" });
        return res.end();
      }
      if (!fs.existsSync(path.join(SITE_DIR, "index.html"))) buildSite();
      return sendFile(res, SITE_DIR, decodeURIComponent(p.replace(/^\/site\/?/, "")) || "index.html");
    }

    if (req.method === "GET") return sendFile(res, ADMIN_DIR, p === "/" ? "index.html" : decodeURIComponent(p.slice(1)));

    json(res, 404, { error: "Not found." });
  } catch (error) {
    json(res, 500, { error: error.message || "Unexpected error" });
  }
});

if (require.main === module) {
  buildSite(); // always refresh the page from data/looks.json when the admin starts
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Fairy Peony Shop the Look admin running at http://localhost:${PORT}`);
  });
}

module.exports = { server, analyze, buildSite };
