const $ = (s) => document.querySelector(s);

const els = {
  form: $("#lookForm"),
  formTitle: $("#formTitle"),
  formHint: $("#formHint"),
  editBanner: $("#editBanner"),
  editText: $("#editText"),
  cancelEdit: $("#cancelEdit"),
  imageUrl: $("#imageUrl"),
  productUrls: $("#productUrls"),
  category: $("#category"),
  title: $("#title"),
  altText: $("#altText"),
  publishBtn: $("#publishBtn"),
  status: $("#status"),
  emptyState: $("#emptyState"),
  preview: $("#preview"),
  previewImage: $("#previewImage"),
  previewTitle: $("#previewTitle"),
  previewCategory: $("#previewCategory"),
  previewCount: $("#previewCount"),
  previewData: $("#previewData"),
  previewPage: $("#previewPage"),
  previewProducts: $("#previewProducts"),
  warnBox: $("#warnBox"),
  previewWarnings: $("#previewWarnings"),
  filters: $("#filters"),
  library: $("#library"),
  pushBtn: $("#pushBtn"),
  pushStatus: $("#pushStatus"),
};

const CATS = [
  { key: "all", label: "All" },
  { key: "y2k", label: "Y2K" },
  { key: "korean", label: "Korean" },
  { key: "pieces", label: "Pieces" },
  { key: "lookbook", label: "Lookbook" },
];

let lastAnalysis = null;
let editingId = null;
let looks = [];
let filter = "all";
const selected = new Set();

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function formPayload() {
  return {
    id: editingId || undefined,
    imageUrl: els.imageUrl.value.trim(),
    productUrls: els.productUrls.value,
    category: els.category.value,
    title: els.title.value.trim(),
    altText: els.altText.value.trim(),
  };
}

function setStatus(el, message, tone = "") {
  el.textContent = message;
  el.className = `status ${tone}`.trim();
}

/* ---------- preview ---------- */

function renderAnalysis(a) {
  lastAnalysis = a;
  els.emptyState.hidden = true;
  els.preview.hidden = false;

  els.previewImage.src = a.imageUrl;
  els.previewImage.alt = a.altText || a.title || "Look";
  els.previewTitle.textContent = a.title || "Untitled look";
  els.previewCategory.textContent = `Category: ${a.categoryLabel}`;
  els.previewCount.textContent = `${a.products.length} product link${a.products.length === 1 ? "" : "s"}`;
  els.previewData.textContent = a.dataFile;
  els.previewPage.textContent = a.pageFile;

  els.previewProducts.replaceChildren(
    ...(a.products.length
      ? a.products.map((p) => {
          const row = document.createElement("div");
          row.className = "product";
          const img = document.createElement("img");
          img.className = "product__thumb";
          img.alt = "";
          img.referrerPolicy = "no-referrer";
          if (p.image) img.src = p.image;
          const body = document.createElement("div");
          const name = document.createElement("div");
          name.className = "product__name";
          name.textContent = p.title || p.url;
          const meta = document.createElement("div");
          meta.className = "product__meta";
          meta.textContent = [p.price, p.url].filter(Boolean).join("  -  ");
          body.append(name, meta);
          const tag = document.createElement("span");
          tag.className = `product__tag ${p.ok ? "product__tag--ok" : "product__tag--warn"}`;
          tag.textContent = p.ok ? "Details found" : "Link only";
          row.append(img, body, tag);
          return row;
        })
      : [Object.assign(document.createElement("p"), { textContent: "No products yet." })])
  );

  els.warnBox.hidden = !a.warnings.length;
  els.previewWarnings.replaceChildren(
    ...a.warnings.map((w) => Object.assign(document.createElement("li"), { textContent: w }))
  );
}

async function analyze() {
  setStatus(els.status, "Reading the image and fetching product details...");
  const { analysis } = await requestJson("/api/analyze", { method: "POST", body: JSON.stringify(formPayload()) });
  renderAnalysis(analysis);
  setStatus(els.status, "Preview ready.", "status--ok");
}

// Load the picture in the browser to learn its size (used to stop layout jumping on phones).
function measureImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve({});
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    const done = (value) => {
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => done({}), 6000);
    img.onload = () => done({ imageWidth: img.naturalWidth, imageHeight: img.naturalHeight });
    img.onerror = () => done({});
    img.src = url;
  });
}

async function publish() {
  els.publishBtn.disabled = true;
  setStatus(els.status, "Saving the look and rebuilding the page...");
  try {
    const { analysis, updated } = await requestJson("/api/publish", {
      method: "POST",
      body: JSON.stringify({ ...formPayload(), analysis: lastAnalysis, ...(await measureImage(lastAnalysis?.imageUrl || els.imageUrl.value.trim())) }),
    });
    renderAnalysis(analysis);
    setStatus(
      els.status,
      `${updated ? "Saved changes to" : "Published to"} ${analysis.pageFile}. Press Push live below to send it to GitHub.`,
      "status--ok"
    );
    resetForm(true);
    await loadLooks();
  } finally {
    els.publishBtn.disabled = false;
  }
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await analyze();
  } catch (error) {
    setStatus(els.status, error.message, "status--error");
  }
});

els.publishBtn.addEventListener("click", async () => {
  if (!els.form.reportValidity()) return;
  try {
    await publish();
  } catch (error) {
    setStatus(els.status, error.message, "status--error");
  }
});

/* ---------- edit mode ---------- */

function resetForm(keepStatus = false) {
  editingId = null;
  els.form.reset();
  els.editBanner.hidden = true;
  els.formTitle.textContent = "Inputs";
  els.publishBtn.textContent = "Publish to site";
  if (!keepStatus) setStatus(els.status, "");
  lastAnalysis = null;
  renderLibrary();
}

function startEdit(look) {
  editingId = look.id;
  els.imageUrl.value = look.imageUrl;
  els.productUrls.value = look.products.map((p) => p.url).join("\n");
  els.category.value = look.category;
  els.title.value = look.title || "";
  els.altText.value = look.altText || "";
  els.editBanner.hidden = false;
  els.editText.textContent = `Editing: ${look.title || "Untitled look"}`;
  els.formTitle.textContent = "Edit look";
  els.publishBtn.textContent = "Save changes";
  setStatus(els.status, "");
  lastAnalysis = null;
  renderLibrary();
  els.form.scrollIntoView({ behavior: "smooth", block: "start" });
}
els.cancelEdit.addEventListener("click", () => resetForm());

/* ---------- library ---------- */

async function loadLooks() {
  const data = await requestJson("/api/looks", { method: "GET", headers: {} });
  looks = data.looks;
  renderLibrary();
}

function renderLibrary() {
  const counts = { all: looks.length };
  looks.forEach((l) => (counts[l.category] = (counts[l.category] || 0) + 1));

  els.filters.replaceChildren(
    ...CATS.map((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.setAttribute("aria-pressed", String(filter === c.key));
      b.textContent = `${c.label} (${counts[c.key] || 0})`;
      b.addEventListener("click", () => {
        filter = c.key;
        renderLibrary();
      });
      return b;
    })
  );

  const list = looks.filter((l) => filter === "all" || l.category === filter);
  if (!list.length) {
    els.library.replaceChildren(
      Object.assign(document.createElement("p"), { className: "libraryEmpty", textContent: "Nothing here yet. Publish your first look above." })
    );
    return;
  }

  els.library.replaceChildren(
    ...list.map((look) => {
      const card = document.createElement("article");
      card.className =
        "look" + (look.id === editingId ? " look--editing" : "") + (selected.has(look.id) ? " look--selected" : "");

      const pick = document.createElement("label");
      pick.className = "look__pick";
      pick.title = "Select";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = selected.has(look.id);
      box.addEventListener("change", () => {
        if (box.checked) selected.add(look.id);
        else selected.delete(look.id);
        card.classList.toggle("look--selected", box.checked);
        renderBulk();
      });
      pick.append(box);
      card.append(pick);

      const img = document.createElement("img");
      img.src = look.imageUrl;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";

      const body = document.createElement("div");
      const cat = document.createElement("div");
      cat.className = "look__cat";
      cat.textContent = (CATS.find((c) => c.key === look.category) || {}).label || look.category;
      const title = document.createElement("div");
      title.className = "look__title";
      title.textContent = look.title || "Untitled look";
      const meta = document.createElement("div");
      meta.className = "look__meta";
      meta.textContent = `${look.products.length} product link${look.products.length === 1 ? "" : "s"}`;

      const actions = document.createElement("div");
      actions.className = "look__actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "btn btn--ghost btn--small";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => startEdit(look));
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn--danger btn--small";
      del.textContent = "Delete";
      del.addEventListener("click", () => removeLook(look));
      actions.append(edit, del);

      body.append(cat, title, meta, actions);
      card.append(img, body);
      return card;
    })
  );
  renderBulk();
}

/* ---------- select + bulk delete ---------- */

const selectAll = $("#selectAll");
const selectedCount = $("#selectedCount");
const deleteSelected = $("#deleteSelected");

function shownLooks() {
  return looks.filter((l) => filter === "all" || l.category === filter);
}

function renderBulk() {
  // forget selections for looks that no longer exist
  const ids = new Set(looks.map((l) => l.id));
  [...selected].forEach((id) => !ids.has(id) && selected.delete(id));

  const shown = shownLooks();
  const shownSelected = shown.filter((l) => selected.has(l.id)).length;
  selectAll.checked = shown.length > 0 && shownSelected === shown.length;
  selectAll.indeterminate = shownSelected > 0 && shownSelected < shown.length;
  selectAll.disabled = !shown.length;
  selectedCount.textContent = selected.size ? `${selected.size} selected` : "None selected";
  deleteSelected.disabled = !selected.size;
  deleteSelected.textContent = selected.size ? `Delete selected (${selected.size})` : "Delete selected";
}

selectAll.addEventListener("change", () => {
  shownLooks().forEach((l) => (selectAll.checked ? selected.add(l.id) : selected.delete(l.id)));
  renderLibrary();
});

deleteSelected.addEventListener("click", async () => {
  const ids = [...selected];
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} look${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
  deleteSelected.disabled = true;
  try {
    const r = await requestJson("/api/looks/delete", { method: "POST", body: JSON.stringify({ ids }) });
    if (ids.includes(editingId)) resetForm();
    selected.clear();
    await loadLooks();
    setStatus(els.pushStatus, `Deleted ${r.deleted}. Press Push live to update the website.`, "status--ok");
  } catch (error) {
    setStatus(els.pushStatus, error.message, "status--error");
  }
});

async function removeLook(look) {
  if (!confirm(`Delete "${look.title || "this look"}"? This cannot be undone.`)) return;
  try {
    await requestJson(`/api/looks/${look.id}`, { method: "DELETE", headers: {} });
    if (editingId === look.id) resetForm();
    await loadLooks();
    setStatus(els.pushStatus, "Deleted. Press Push live to update the website.", "status--ok");
  } catch (error) {
    setStatus(els.pushStatus, error.message, "status--error");
  }
}

/* ---------- push live ---------- */

els.pushBtn.addEventListener("click", async () => {
  els.pushBtn.disabled = true;
  setStatus(els.pushStatus, "Sending to GitHub...");
  try {
    const result = await requestJson("/api/push", { method: "POST", body: "{}" });
    setStatus(
      els.pushStatus,
      result.nothing && /up.to.date/i.test(result.output)
        ? "Already up to date. Nothing new to send."
        : "Sent to GitHub. Cloudflare will update your page in about a minute.",
      "status--ok"
    );
  } catch (error) {
    setStatus(els.pushStatus, error.message, "status--error");
  } finally {
    els.pushBtn.disabled = false;
  }
});

loadLooks().catch((error) => setStatus(els.status, error.message, "status--error"));
