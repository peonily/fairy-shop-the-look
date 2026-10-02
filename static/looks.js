// Tabs, pages and popup for the Shop the Look page. The looks are embedded in the page itself.
// Links: #korean  ·  #korean/2 (page 2)  ·  #korean/2/<look id> (popup open)
(() => {
  const data = JSON.parse(document.getElementById("looks-data").textContent);
  const byId = new Map(data.looks.map((l) => [l.id, l]));
  const labels = Object.fromEntries(data.categories.map((c) => [c.key, c.label]));
  labels.all = "All";

  const tabsEl = document.querySelector(".tabs");
  const tabs = [...document.querySelectorAll(".tab")];
  const sections = [...document.querySelectorAll(".cat-section")];
  const modal = document.getElementById("modal");
  const sheet = document.getElementById("sheet");
  const phone = window.matchMedia("(max-width: 760px)");
  const narrow = window.matchMedia("(max-width: 480px)");

  let activeCat = "all";
  const pageOf = {}; // remembered page per tab
  let lastFocus = null;
  let pushedForModal = false; // popup opened by a tap (has its own history entry so the phone Back button closes it)

  function el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v);
    }
    kids.forEach((c) => c && n.append(c));
    return n;
  }
  function safeUrl(u) {
    try {
      const x = new URL(u);
      return x.protocol === "https:" || x.protocol === "http:" ? x.href : "#";
    } catch {
      return "#";
    }
  }
  function prettyName(url) {
    try {
      const m = new URL(url).pathname.match(/\/products\/([^/]+)/);
      return (m ? m[1] : "View product").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    } catch {
      return "View product";
    }
  }

  const sectionOf = (cat) => sections.find((s) => s.dataset.cat === cat);
  const totalPages = (cat) => Number(sectionOf(cat).dataset.pages) || 0;
  const defaultPage = (cat) => (data.newestPageLast ? Math.max(totalPages(cat), 1) : 1);

  /* ---------- pager (fewer buttons on small phones so it never wraps) ---------- */
  function pageList(current, total) {
    if (total <= (narrow.matches ? 4 : 7)) return Array.from({ length: total }, (_, i) => i + 1);
    const set = narrow.matches ? new Set([1, current, total]) : new Set([1, total, current - 1, current, current + 1]);
    if (!narrow.matches) {
      if (current <= 3) [2, 3, 4].forEach((n) => set.add(n));
      if (current >= total - 2) [total - 1, total - 2, total - 3].forEach((n) => set.add(n));
    }
    const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
    const out = [];
    nums.forEach((n, i) => {
      if (i && n - nums[i - 1] > 1) out.push("…");
      out.push(n);
    });
    return out;
  }

  function renderPager(cat, current) {
    const pager = sectionOf(cat).querySelector(".pager");
    if (!pager) return;
    const total = totalPages(cat);
    if (total <= 1) {
      pager.replaceChildren();
      return;
    }
    const go = (p) => () => {
      show(cat, p);
      tabsEl.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const btn = (text, page, opts = {}) => {
      const b = el("button", { class: "pg" + (opts.cur ? " cur" : ""), type: "button", "aria-label": opts.label || "Page " + page, text });
      if (opts.cur) b.setAttribute("aria-current", "page");
      if (opts.disabled) b.disabled = true;
      else b.addEventListener("click", go(page));
      return b;
    };

    const items = [btn("‹", current - 1, { disabled: current === 1, label: "Previous page" })];
    pageList(current, total).forEach((n) => {
      if (n === "…") items.push(el("span", { class: "pg gap", text: "…" }));
      else items.push(btn(String(n), n, { cur: n === current }));
    });
    items.push(btn("›", current + 1, { disabled: current === total, label: "Next page" }));

    const newestPage = data.newestPageLast ? total : 1;
    const info = el("div", { class: "pager__info", text: `Page ${current} of ${total}` + (current === newestPage ? " · newest" : "") });
    pager.replaceChildren(el("div", { class: "pager__row" }, ...items), info);
  }
  narrow.addEventListener("change", () => renderPager(activeCat, pageOf[activeCat] || defaultPage(activeCat)));

  /* ---------- show a tab + page ---------- */
  function show(cat, page, updateHash = true) {
    activeCat = cat;
    const total = totalPages(cat);
    let p = page || pageOf[cat] || defaultPage(cat);
    p = Math.min(Math.max(p, 1), Math.max(total, 1));
    pageOf[cat] = p;

    tabs.forEach((t) => {
      const on = t.dataset.cat === cat;
      t.setAttribute("aria-selected", String(on));
      // only if the row overflows (very narrow screens) and the chosen tab is cut off, scroll just enough to show it
      if (on && tabsEl.scrollWidth > tabsEl.clientWidth + 1) {
        const left = t.offsetLeft - 12;
        const right = t.offsetLeft + t.offsetWidth + 12;
        if (left < tabsEl.scrollLeft) tabsEl.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
        else if (right > tabsEl.scrollLeft + tabsEl.clientWidth) tabsEl.scrollTo({ left: right - tabsEl.clientWidth, behavior: "smooth" });
      }
    });
    sections.forEach((s) => {
      const on = s.dataset.cat === cat;
      s.hidden = !on;
      if (on) s.querySelectorAll(".page").forEach((pg) => (pg.hidden = Number(pg.dataset.page) !== p));
    });
    renderPager(cat, p);
    if (updateHash) history.replaceState(null, "", hashFor(cat, p));
  }

  function hashFor(cat, page, id) {
    const base = totalPages(cat) > 1 ? `#${cat}/${page}` : `#${cat}`;
    return id ? `${base}/${id}` : base;
  }

  tabs.forEach((t) =>
    t.addEventListener("click", () => {
      show(t.dataset.cat);
      window.scrollTo({ top: Math.min(window.scrollY, tabsEl.offsetTop), behavior: "smooth" });
    })
  );

  /* ---------- popup ---------- */
  function fillModal(look) {
    document.getElementById("m-img").src = safeUrl(look.imageUrl);
    document.getElementById("m-img").alt = look.altText || look.title || "Outfit";
    document.getElementById("m-cat").textContent = labels[look.category] || "";
    document.getElementById("m-title").textContent = look.title || "Shop this look";
    const n = look.products.length;
    document.getElementById("m-sub").textContent = n ? `${n} ${n === 1 ? "piece" : "pieces"} in this look` : "";

    const ul = document.getElementById("m-items");
    ul.replaceChildren();
    if (!n) ul.append(el("li", { class: "noitems", text: "Product links coming soon." }));
    look.products.forEach((p) => {
      const thumb = el("div", { class: "th" });
      if (p.image) thumb.append(el("img", { src: safeUrl(p.image), alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" }));
      ul.append(
        el(
          "li",
          {},
          el(
            "a",
            { class: "item", href: safeUrl(p.url), target: "_blank", rel: "noopener" },
            thumb,
            el("div", {}, el("div", { class: "nm", text: p.title || prettyName(p.url) }), p.price ? el("div", { class: "pr", text: p.price }) : null),
            el("span", { class: "go", text: "Shop" })
          )
        )
      );
    });
    modal.querySelector(".side").scrollTop = 0;
  }

  function openLook(id, fromHash) {
    const look = byId.get(id);
    if (!look) return;
    lastFocus = document.activeElement;
    fillModal(look);
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    document.getElementById("close").focus({ preventScroll: true });

    const hash = hashFor(activeCat, pageOf[activeCat] || 1, look.id);
    if (fromHash) {
      pushedForModal = false;
    } else {
      history.pushState({ look: look.id }, "", hash); // phone Back button now closes the popup
      pushedForModal = true;
    }
  }

  function hideModalUi() {
    modal.classList.remove("open");
    document.body.style.overflow = "";
    sheet.style.transform = "";
    sheet.style.transition = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function closeLook() {
    if (!modal.classList.contains("open")) return;
    if (pushedForModal) {
      pushedForModal = false;
      history.back(); // the hashchange below closes the popup and restores the page link
    } else {
      hideModalUi();
      history.replaceState(null, "", hashFor(activeCat, pageOf[activeCat] || 1));
    }
  }

  document.querySelectorAll(".card").forEach((c) => c.addEventListener("click", () => openLook(c.dataset.id)));
  document.getElementById("close").addEventListener("click", closeLook);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeLook();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLook();
  });

  /* swipe the picture (or the handle) down to close, like a phone bottom sheet */
  (() => {
    const pic = document.getElementById("pic");
    let startY = null;
    let dy = 0;
    pic.addEventListener(
      "touchstart",
      (e) => {
        if (!phone.matches) return;
        startY = e.touches[0].clientY;
        dy = 0;
        sheet.style.transition = "none";
      },
      { passive: true }
    );
    pic.addEventListener(
      "touchmove",
      (e) => {
        if (startY === null) return;
        dy = Math.max(0, e.touches[0].clientY - startY);
        sheet.style.transform = `translateY(${dy}px)`;
      },
      { passive: true }
    );
    const end = () => {
      if (startY === null) return;
      startY = null;
      sheet.style.transition = "transform .2s ease";
      if (dy > 110) closeLook();
      else sheet.style.transform = "";
    };
    pic.addEventListener("touchend", end);
    pic.addEventListener("touchcancel", end);
  })();

  /* ---------- start + back/forward ---------- */
  function applyHash() {
    const parts = location.hash.replace("#", "").split("/");
    const cat = labels[parts[0]] ? parts[0] : "all";
    const isPage = /^\d{1,3}$/.test(parts[1] || "");
    const page = isPage ? Number(parts[1]) : 0;
    const lookId = parts.length > 2 ? parts[2] : isPage ? "" : parts[1] || "";

    if (modal.classList.contains("open")) hideModalUi();
    show(cat, page, false);
    if (lookId) openLook(lookId, true);
  }

  window.addEventListener("hashchange", applyHash); // Back button, edited links (our own updates don't fire it)
  window.addEventListener("popstate", () => {
    // Back from an opened popup that landed on the same hash
    if (modal.classList.contains("open") && !(history.state && history.state.look)) {
      pushedForModal = false;
      hideModalUi();
    }
  });
  applyHash();
})();
