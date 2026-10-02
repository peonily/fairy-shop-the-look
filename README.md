# FAIRY PEONY · Shop the Look

A static page (Y2K · Korean · Pieces · Lookbook) with a local admin app, built the same way as Dreamy Decor.

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

Edit or delete older looks from the "Published looks" section.

## Files

- `data/looks.json` – your saved looks
- `public/index.html` – the page visitors see (rebuilt on every publish; `npm run looks:build` rebuilds it by hand)
- `public/static/` – the page's styling and popup script
- `tools/looks-admin/` – the admin app

## One-time hosting setup

1. Create a GitHub repository and connect this folder to it (`git init`, `git remote add origin <repo link>`, `git branch -M main`).
2. Cloudflare Pages → Connect to Git → pick the repo. Build command: none. **Build output directory: `public`**.
3. Add the Pages link (or a custom domain such as looks.fairypeony.com) to your Shopify menu.

The admin app and your `data/` folder are never published, only `public/`.

Currency symbol for fetched prices defaults to `$`. To change it, set `LOOKS_CURRENCY` (for example `LOOKS_CURRENCY=€`) before starting the app.
