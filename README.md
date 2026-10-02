# FAIRY PEONY · Shop the Look

A static page (All · Y2K · Korean · Pieces · Lookbook) with a local admin app, built the same way as Dreamy Decor. The website sits at the top level of this folder (`index.html` + `static/`), so Cloudflare Pages needs no special settings.

## Run the admin (on your computer only)

Double-click **`START-ADMIN.bat`**, or run:

```bash
npm run looks:app
```

Open http://localhost:4320 and:

1. Paste the Pinterest image link (right-click the image on Pinterest, Copy image address).
2. Paste the product links from fairypeony.com, one per line. Name, photo and price are fetched automatically.
3. Pick the category and press **Publish to site**.
4. Press **Push live** to send it to GitHub. Cloudflare Pages updates the page by itself.

Edit or delete older looks (one by one or several at once) from "Published looks".

## Files

- `index.html` – the page visitors see (rebuilt on every publish and every time the admin starts)
- `static/` – the page's styling and popup script
- `data/looks.json` – your saved looks
- `tools/looks-admin/` – the admin app (runs only on your computer)

## Cloudflare Pages settings

Connect the GitHub repo, then use:

- Framework preset: **None**
- Build command: **(leave empty)**
- Build output directory: **`/`** (leave empty / the repo root)

If the live link shows "page not found (404)", the output directory is pointing at the wrong folder. It must be the folder that contains `index.html`.

## One-time GitHub link

Open a terminal in this folder and run:

```bash
git init
git remote add origin <your repo link>
git branch -M main
```

After that, the **Push live** button does the rest.

Currency symbol for fetched prices defaults to `$`. To change it, set `LOOKS_CURRENCY` (for example `LOOKS_CURRENCY=€`) before starting the app.
