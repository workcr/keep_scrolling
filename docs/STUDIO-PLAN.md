# Studio: stage 1 plan

A private editing page for keep-scrolling.com. You drop in images and videos;
the AI drafts the text; you review and edit; one click publishes to the site.

Status: **updated with your answers**: free Cloudflare address, new work on
the home page, Comet/Chrome. Nothing is built until you approve it.

---

## 1. What you'll be able to do

1. **Log in** at your Studio address with your Google account (rmnds1@gmail.com).
   Nobody else can open it.
2. **Drop files** (images and MP4 videos) onto the page.
3. **Watch them process.** For each file the Studio:
   - measures the size and shape, so the black-bars and cropping problems we fixed
     by hand can't happen again
   - makes the web versions of each image (the five sizes and the quality setting we
     use now)
   - for videos, grabs six still frames so the AI can "see" them, plus a cover image
   - uploads everything to your R2 bucket.
4. **Get AI drafts.** Claude looks at each file, compares it with your existing
   projects, and proposes:
   - **which project** it belongs to, or a new project
   - **alt text** (what the image shows, as I did for your 47 files)
   - **client, category and discipline**, picked from the values you already use.
5. **Answer a few questions** for a new project ("What was your role? Who
   should be credited? What year?"). Claude then writes the project
   description **in your Surf Overdose style, using only your answers**. It never
   makes up a role, a credit or a result.
6. **Review and edit** everything as editable cards. You can change any text
   and reassign a project. There are no layout switches: every piece appears on
   the home page and in the gallery, and the Studio handles placement (section 3).
7. **Publish.** The Studio writes the rows to your Google Sheet (`Sheet1` and
   `projects`) and redeploys the site so search engines get the update.
   Visitors see it within a minute.
8. **Edit existing content** in the same card view: alt text, project, client,
   category, discipline, and project descriptions for everything already on the
   site.

Until you click Publish, drafts are saved in the Studio, not in your sheet, so
the live site never shows half-finished work.

**Not in stage 1:** reordering the home page, deleting items, renaming projects
(do these in the sheet for now), moving the older images out of the code
repository into R2, and a chat-style agent. Those are stages 2 and 3.

---

## 2. Why there are no switches

The home page and the gallery are two views of the same work, so every piece
goes on both. The only per-item layout setting today is the gallery's
two-column "wide" pieces (8 of 51). That is a rhythm choice, so the Studio
makes it for you: roughly one in five new pieces, preferring landscape
images and videos. It writes a `layout` value that the gallery already reads, so
you can still override any piece in the sheet.

---

## 3. Sequencing: never one campaign at a time

The site should feel like an endless body of work, so pieces from the same
project must not appear together. Today's order was arranged by hand and works:
in 51 pieces, only one pair from the same project sits side by side. The risk
is the future. Added at the end of the list, a new 6-piece project would play
as one block.

How the Studio prevents that:

1. **A new `order` column in `Sheet1`.** Existing pieces get numbers that keep
   today's sequence exactly. The site sorts by this column, so you can still
   rearrange by editing numbers.
2. **New pieces are slotted in, not appended.** On Publish, the Studio spreads a
   project's pieces across the whole sequence, as far apart as possible and
   never closer than 6 positions to another piece of the same project. The home
   page and gallery loop, so it also checks across the end-to-start join.
3. **New work is seen early.** One piece from each new project goes into the
   first 10 positions, so returning visitors notice it. The rest are spread
   through the sequence.
4. **Preview before publishing.** The Studio shows the resulting sequence as a
   strip of thumbnails and flags any same-project pieces that sit too close,
   including after hand edits to the sheet.

---

## 4. How it fits together

```
 You (Chrome on your Mac)
   │  drop files, review, publish
   ▼
 Studio page  ── protected by Cloudflare Access (only rmnds1@gmail.com)
   │
   ▼
 Studio server (Cloudflare Worker, in your Cloudflare account)
   ├── R2 bucket keep-scrolling-media ..... stores the files
   ├── D1 database ........................ stores drafts until you publish
   ├── Claude API (Opus 5.5) .............. alt text, project match, descriptions
   ├── Google Sheets API .................. writes Sheet1 / projects on Publish
   └── GitHub Actions ..................... redeploys the site on Publish
```

- **The Google Sheet stays the database.** You can keep editing it by hand. The
  Studio adds rows in exactly the format the site already reads, and never
  renames or reorders your columns.
- **No change to your domain or DNS.** The Studio runs at a free Cloudflare
  address like `keep-scrolling-studio.<your-account>.workers.dev`. A nicer address
  such as `studio.keep-scrolling.com` (and `media.keep-scrolling.com` for your
  videos) requires moving your domain's DNS to Cloudflare. That's worth doing,
  but it's a separate decision.
- **Secrets never pass through chat.** You paste each key directly into
  Cloudflare or GitHub settings; I'll show you exactly where.

---

## 5. Running costs

| Service | Cost at your volume |
|---|---|
| Cloudflare Worker, D1, Access | Free tier |
| R2 storage | Cents per month |
| Claude API (Opus 5.5) | About $1–2 per 100 files; you set a hard monthly cap (suggested: $5) |
| Google Sheets API | Free |

---

## 6. One-time setup (your part, about 1 hour total, I'll guide every click)

1. **Anthropic**: create an account at console.anthropic.com, add billing, set a
   **monthly spend limit of $5**, create an API key named `studio`.
2. **Google Cloud**: create a project, enable the Sheets API, create a
   "service account" (a robot Google user), and **share the `cr-works` sheet with
   its email as Editor**. This is the fiddliest step, so I'll write it up with
   screenshots-level detail.
3. **Cloudflare**:
   - create an API token so GitHub can deploy the Studio for you
   - turn on **Access** for the Studio address and allow only rmnds1@gmail.com.
4. **GitHub**: create a token that can only run this repository's deploy, for the
   Publish button.

Each key goes into Cloudflare or GitHub settings. I'll tell you exactly where.

---

## 7. Rules the Studio enforces

- **Images:** JPG, PNG, WebP. Large originals are resized to 2560px on the long
  side at quality 85, the same settings that took your images from 467 MB to 33 MB.
- **Videos:** MP4 (H.264). Over 25 MB shows a warning; over 100 MB is refused,
  with export instructions. Big `.mov` files can't be converted in the browser.
  The one export setting to use will be in the Studio's help panel.
- **Browser:** Comet or Chrome (both are built on Chromium). Safari can't produce
  WebP files in the browser.
- **The AI only drafts.** Nothing reaches the live site until you click Publish.

---

## 8. How I'll build and hand it over

1. **The Studio server**: upload, R2 storage, drafts, writing to the Sheet, Publish.
   Tested here with a copy of your sheet's structure.
2. **The Studio page**: drop zone, processing, the card editor.
3. **The AI step**: prompts tuned on your real content. Your existing alt texts
   and the Surf Overdose description are the style references.
4. **A small site change**: the site sorts by the new `order` column and reads
   "wide" from the sheet instead of the hard-coded list it uses today.
5. **Setup with you**: the steps in section 4.
6. **A test run on staging**: you publish one real project end to end while I
   watch the logs; then we switch it on for the live site.

Each part goes through the same pull-request → staging → live process we've
been using.

---

## 9. Decisions (answered)

1. **Studio address:** start on the free `…workers.dev` address; DNS later.
2. **New uploads:** appear on the home page (and everywhere else) by default.
3. **Browser:** Comet (Chromium), Chrome as a fallback.
