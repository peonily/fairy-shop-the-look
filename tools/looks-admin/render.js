// Turns data/looks.json into the static public page (index.html at the project root).
// No dependencies. Used by the admin app and by `npm run looks:build`.

const CATEGORIES = [
  { key: "y2k", label: "Y2K" },
  { key: "korean", label: "Korean" },
  { key: "pieces", label: "Pieces" },
  { key: "lookbook", label: "Lookbook" },
];

// "All" tab shows every look from every category.
const ALL_TAB = { key: "all", label: "All" };
const TABS = [ALL_TAB, ...CATEGORIES];

// How many looks per page.
const PAGE_SIZE = 15;

// true  -> pages fill in order: page 1 = first 15 uploaded, page 2 = next 15 ...
//          a new upload always lands on the newest (last) page, and visitors open on that page.
// false -> page 1 always shows the newest looks and older ones move to later pages.
const NEWEST_PAGE_LAST = true;

const SHOP_URL = "https://fairypeony.com/";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// Adds ?v=<fingerprint> to the CSS/JS links so phones and browsers always fetch the newest files after an update.
function assetVersion(file) {
  try {
    const buf = fs.readFileSync(path.join(__dirname, "..", "..", "static", file));
    return crypto.createHash("md5").update(buf).digest("hex").slice(0, 10);
  } catch {
    return String(Date.now());
  }
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Pinterest serves the same picture in several sizes. Phones get the smaller one (faster, less data).
function pinSizes(url) {
  try {
    const u = new URL(url);
    const re = /^\/(\d+x\d*|originals)\//;
    if (u.hostname !== "i.pinimg.com" || !re.test(u.pathname)) return null;
    const at = (size) => {
      const c = new URL(url);
      c.pathname = c.pathname.replace(re, `/${size}/`);
      return c.toString();
    };
    return { small: at("474x"), large: at("736x") };
  } catch {
    return null;
  }
}

function imgTag(look, alt, eager) {
  const sizes = pinSizes(look.imageUrl);
  const dims = look.width && look.height ? ` width="${look.width}" height="${look.height}"` : "";
  const src = sizes ? sizes.small : look.imageUrl;
  const srcset = sizes ? ` srcset="${esc(sizes.small)} 474w, ${esc(sizes.large)} 736w" sizes="(max-width: 640px) 50vw, (max-width: 980px) 33vw, 300px"` : "";
  const load = eager ? ' fetchpriority="high"' : ' loading="lazy"';
  return `<img src="${esc(src)}"${srcset}${dims} alt="${esc(alt)}"${load} decoding="async" referrerpolicy="no-referrer">`;
}

function publicLook(look) {
  return {
    id: look.id,
    imageUrl: look.imageUrl,
    width: Number(look.width) || 0,
    height: Number(look.height) || 0,
    category: look.category,
    title: look.title || "",
    altText: look.altText || "",
    products: (look.products || []).map((p) => ({
      url: p.url,
      title: p.title || "",
      image: p.image || "",
      price: p.price || "",
    })),
  };
}

// Split a list (oldest -> newest) into pages of PAGE_SIZE. Each page is shown newest first.
function paginate(oldestFirst) {
  const pages = [];
  if (NEWEST_PAGE_LAST) {
    for (let i = 0; i < oldestFirst.length; i += PAGE_SIZE) {
      pages.push(oldestFirst.slice(i, i + PAGE_SIZE).reverse());
    }
  } else {
    const newestFirst = [...oldestFirst].reverse();
    for (let i = 0; i < newestFirst.length; i += PAGE_SIZE) {
      pages.push(newestFirst.slice(i, i + PAGE_SIZE));
    }
  }
  return pages;
}

function renderCard(look, index, eager) {
  const count = look.products.length;
  const alt = look.altText || look.title || "Fairy Peony outfit";
  return `          <button class="card" type="button" data-id="${esc(look.id)}" style="animation-delay:${Math.min(index, 8) * 40}ms" aria-label="${esc(
    (look.title || "Outfit") + " - shop " + count + (count === 1 ? " piece" : " pieces")
  )}">
            ${imgTag(look, alt, eager)}
            ${look.title ? `<span class="ttl">${esc(look.title)}</span>` : ""}
            <span class="chip"><span>&#10022;</span><span><b>${count}</b> ${count === 1 ? "piece" : "pieces"}</span></span>
          </button>`;
}

function renderSection(tab, list, isDefault) {
  const pages = paginate(list);
  const firstShown = NEWEST_PAGE_LAST ? pages.length - 1 : 0; // the page visitors land on
  const body = pages.length
    ? pages
        .map(
          (items, i) => `      <div class="page" data-page="${i + 1}" hidden>
        <div class="grid">
${items.map((look, n) => renderCard(look, n, isDefault && i === firstShown && n < 4)).join("\n")}
        </div>
      </div>`
        )
        .join("\n") + `\n      <nav class="pager" aria-label="${esc(tab.label)} pages"></nav>`
    : `      <div class="empty"><div class="big">Coming soon &#10047;</div><p>New looks are being styled for this category.</p></div>`;

  return `    <section class="cat-section" data-cat="${tab.key}" data-pages="${pages.length}"${isDefault ? "" : " hidden"} aria-label="${esc(tab.label)}">
${body}
    </section>`;
}

function renderSite(allLooks) {
  // oldest -> newest (stable)
  const chronological = [...allLooks]
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)))
    .map(publicLook);

  const listFor = (key) => (key === "all" ? chronological : chronological.filter((l) => l.category === key));
  const counts = Object.fromEntries(TABS.map((t) => [t.key, listFor(t.key).length]));

  const tabs = TABS.map(
    (t) =>
      `      <button class="tab" role="tab" type="button" data-cat="${t.key}" aria-selected="${t.key === "all"}">${esc(t.label)}${
        counts[t.key] ? `<span class="count">${counts[t.key]}</span>` : ""
      }</button>`
  ).join("\n");

  const sections = TABS.map((t) => renderSection(t, listFor(t.key), t.key === "all")).join("\n");

  const newest = chronological[chronological.length - 1];
  const data = JSON.stringify({
    categories: CATEGORIES,
    pageSize: PAGE_SIZE,
    newestPageLast: NEWEST_PAGE_LAST,
    looks: chronological,
  }).replace(/</g, "\\u003c");
  const ogImage = newest ? `\n  <meta property="og:image" content="${esc(newest.imageUrl)}">` : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Shop the Look | FAIRY PEONY</title>
  <meta name="description" content="Y2K, Korean, single pieces and full lookbooks. Shop every outfit from FAIRY PEONY.">
  <meta property="og:title" content="Shop the Look | FAIRY PEONY">
  <meta property="og:description" content="Tap any outfit to shop every piece in it.">${ogImage}
  <meta name="theme-color" content="#fff7fa">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="static/looks.css?v=${assetVersion("looks.css")}">
  <noscript><style>.cat-section[hidden],.page[hidden]{display:block}</style></noscript>
</head>
<body>
  <div class="wrap">
    <div class="top"><a class="back" href="${SHOP_URL}">&larr; Back to shop</a></div>

    <header class="hero">
      <a class="brand" href="${SHOP_URL}">FAIRY PEONY</a>
      <h1>Shop the Look</h1>
      <p><span class="sparkle">&#10022;</span>Tap any outfit to shop every piece in it<span class="sparkle">&#10022;</span></p>
    </header>

    <nav class="tabs" role="tablist" aria-label="Categories">
${tabs}
    </nav>

    <main>
${sections}
    </main>

    <div class="foot">&copy; FAIRY PEONY &middot; <a href="${SHOP_URL}">fairypeony.com</a></div>
  </div>

  <div class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
    <div class="sheet" id="sheet">
      <div class="grip" aria-hidden="true"></div>
      <button class="close" id="close" type="button" aria-label="Close">&times;</button>
      <div class="pic" id="pic"><img id="m-img" alt="" decoding="async" referrerpolicy="no-referrer"></div>
      <div class="side">
        <div class="cat" id="m-cat"></div>
        <h2 id="m-title"></h2>
        <p class="sub" id="m-sub"></p>
        <ul class="items" id="m-items"></ul>
      </div>
    </div>
  </div>

  <script type="application/json" id="looks-data">${data}</script>
  <script src="static/looks.js?v=${assetVersion("looks.js")}"></script>
</body>
</html>
`;
}

module.exports = { renderSite, CATEGORIES, TABS, PAGE_SIZE, esc };
