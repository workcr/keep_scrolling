# Step-by-step guide

Do these in order. Each step says how to know it worked.

---

## Step 1: Make sure the Google Sheet is yours

All the site's content (media list and project descriptions) comes from one
Google Sheet. If the developer owns it, you need your own copy.

1. Sign in to Google as **rmnds1@gmail.com**.
2. Open the sheet:
   https://docs.google.com/spreadsheets/d/1XQQqzopAlJpwbAhBulpXUH28aUlIqdj_yXO8YWn1S0E/edit
3. Click the green **Share** button (top right).
   - If you see your name with **(you)** and **Owner**: it's yours. Go to 4.
   - If it won't open, or you can only view, or someone else is Owner:
     **File → Make a copy**, then send Claude the link to the copy.
     (The site will be switched to it.)
4. Still in the Share window:
   - Under **People with access**, remove anyone you don't recognise or no
     longer work with (click their role → **Remove access**).
   - Under **General access**, it must say **Anyone with the link** →
     **Viewer**. (Viewer, never Editor. The website needs to read it, and
     nobody else should be able to change it.)
   - Click **Done**.

**Tabs:** the names along the bottom of the screen. The site reads two of them:

- **Sheet1**: the list of images and videos (columns `id`, `src`, `alt`…).
  Keep it as the first tab and don't delete it. "Copy of Sheet1", "Links" and
  "To-Do List" are not used by the site.
- **projects**: project descriptions. You create it in Step 2.

---

## Step 2: Add project descriptions (the `projects` tab)

No file needed. You paste the text instead.

1. At the bottom left of the sheet, click **+** to add a new tab.
2. Double-click the new tab's name and rename it to exactly `projects`
   (lowercase, no spaces). Press Enter.
3. Click cell **A1** of the new tab.
4. Copy the block of text Claude gave you in the chat (16 lines plus a header,
   with a `|` between the project name and the description) and paste it
   (**⌘V** on Mac).
5. With column A still selected, open **Data → Split text to columns**. A small
   **Separator** box appears near the bottom: choose **Custom** and type `|`.
   The descriptions move into column B.
6. Check: A1 says `project`, B1 says `description`, and column A has 16
   project names in lowercase.
7. In column B, replace every `[...]` with real text: 2–3 sentences about the
   work, your role, and the result. Don't change column A or row 1.

Alt text: **nothing to do.** The site now uses the new alt text automatically
wherever the sheet still says "This image needs a description."

---

## Step 3: Preview the new site on staging

1. Open the pull request: https://github.com/workcr/keep_scrolling/pull/1
2. Scroll down, click **Merge pull request** → **Confirm merge**.
   This only updates the preview at `/staging/`. The live site is not touched.
3. Click the **Actions** tab at the top of the repository. Wait until the newest
   **Deploy to Hostinger** run shows a green ✓ (a few minutes; the first one
   is slower because it uploads the new images).
4. Open https://keep-scrolling.com/staging/ and check:
   - [ ] Home scrolls and animates. (The typeface changes: that's your Octagrid
         font finally loading.)
   - [ ] Gallery, Filters and About load.
   - [ ] About → **Email** opens your mail app addressed to you; **Instagram**
         and **LinkedIn** open the right profiles.
   - [ ] https://keep-scrolling.com/staging/project/surf-overdose shows its
         description under **Project info** (only after Step 2).
   - [ ] Try the same on your phone.

Note: staging still shows the *old* image files, because it borrows images from
the live site. The smaller images go live in Step 4.

Tell Claude what you saw, including anything that looks wrong.

---

## Step 4: Go live

When staging looks right, Claude opens a second pull request (staging → main).
Merge it the same way. The live site updates a few minutes later. Check the
Actions tab for the green ✓.

**After you edit the Google Sheet later:** visitors see the change right
away, but search engines read pages generated at deploy time. To refresh them:
**Actions → Deploy to Hostinger → Run workflow → Branch: main → Run workflow**.

---

## Step 5: Domain settings in Hostinger (after Step 4)

1. Log in at https://hpanel.hostinger.com → **Websites** → **keep-scrolling.com**
   → **Manage** (or **Dashboard**).
2. Go to **Security → SSL**. The certificate should be **Active**. Turn on
   **Force HTTPS**.
3. Test: open http://keep-scrolling.com (no "s"). It should switch to
   https://keep-scrolling.com.
4. Test: open https://www.keep-scrolling.com. It should end on
   https://keep-scrolling.com. If it shows an error instead, go to
   **Domains → keep-scrolling.com → DNS / Nameservers** and check there is a
   `CNAME` record with name `www` pointing to `keep-scrolling.com`; add it if
   missing.

(Hostinger renames menus occasionally; if a name differs, use the search bar
in hPanel.)

---

## Step 6: Tell Google about the site

1. Go to https://search.google.com/search-console and sign in as
   rmnds1@gmail.com.
2. **Add property** → choose **Domain** → type `keep-scrolling.com` →
   **Continue**.
3. Google shows a **TXT record** (starts with `google-site-verification=`).
   Click **Copy**.
4. In hPanel: **Domains → keep-scrolling.com → DNS / Nameservers → DNS
   records**. Add a record: Type **TXT**, Name **@**, Value: paste → **Add
   record**.
5. Back in Search Console, click **Verify**. If it fails, wait an hour and try
   again (DNS changes take time).
6. Left menu → **Sitemaps** → type `sitemap.xml` → **Submit**.
7. Top search bar (URL inspection) → paste `https://keep-scrolling.com/` →
   **Request indexing**.

## Step 7: Tell Bing (this feeds ChatGPT search and Copilot)

1. Go to https://www.bing.com/webmasters and sign in.
2. Choose **Import from Google Search Console** and approve. It copies your
   site and sitemap.

Expect search results to update over days to weeks, not hours.

---

## Step 8: Lock out the previous developer

Sheety is no longer used by the site, so nothing in that account can affect it.
These are the other places the developer may still have access:

- **GitHub:** done. You're the only person with access to the repository.
- **Hostinger FTP password:** deploys use an FTP password stored in GitHub
  that the developer may know. In hPanel → **Files → FTP Accounts**, change
  the password. Then in GitHub → repository **Settings → Environments →
  production** (and **staging**) → under **Environment secrets**, whichever
  password secret is listed (e.g. `HOSTINGER_PROD_PASSWORD`, or
  `HOSTINGER_PASSWORD` under **Settings → Secrets and variables → Actions**)
  → **Update** with the new password. Then run a deploy (Step 4) to confirm
  it still works.
- **Cloudflare R2 (your videos):** log in at https://dash.cloudflare.com with
  your own account → **R2**. If you can't see the bucket, it's on the
  developer's account, and your videos could disappear at any time. Tell
  Claude and they can be moved.
- **Google:** https://myaccount.google.com → **Security → Your connections to
  third-party apps & services**. Remove **Sheety** if listed.
