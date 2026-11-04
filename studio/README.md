# Studio

Private editing Studio for keep-scrolling.com: upload images and videos, get AI
drafts, review, and publish to the Google Sheet. Plan: `../docs/STUDIO-PLAN.md`.

Runs as a Cloudflare Worker (`wrangler.toml`) with:
- **R2** `keep-scrolling-media`: uploaded files (under `studio/<draft id>/`)
- **D1** `keep-scrolling-studio`: drafts until they are published (`migrations/`)
- **Google Sheets API**: writes `Sheet1` / `projects` on Publish
- **GitHub Actions**: redeploys the website after Publish
- **Cloudflare Access**: only the owner can sign in (checked again in the Worker)

```bash
npm install
npm test                 # unit + API tests (no network)
npm run check            # build the Worker without deploying
```

Local run: put `DEV_BYPASS_AUTH=true` in `.dev.vars` (never in production; it
only works on localhost), then `npx wrangler d1 migrations apply keep-scrolling-studio --local`
and `npm run dev`.
