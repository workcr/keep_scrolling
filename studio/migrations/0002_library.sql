-- Drafts started from the Library tab: pieces already in the site's
-- src/assets folder (deployed to keep-scrolling.com/assets/), so nothing is
-- uploaded. Holds the piece's key in studio/src/generated/library.json.
ALTER TABLE drafts ADD COLUMN library_key TEXT;
