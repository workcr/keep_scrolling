-- Drafts live here until you click Publish; the Google Sheet only ever
-- receives finished, reviewed rows.

CREATE TABLE IF NOT EXISTS drafts (
  id           TEXT PRIMARY KEY,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft',   -- draft | published
  kind         TEXT NOT NULL,                   -- image | video
  file_name    TEXT NOT NULL,
  bytes        INTEGER,
  width        INTEGER,
  height       INTEGER,
  duration     REAL,
  src          TEXT,                            -- public URL of the main file
  variants     TEXT,                            -- JSON {"320": url, ...} (images)
  poster       TEXT,                            -- public URL (videos)
  frames       TEXT,                            -- JSON [url, ...] (videos, for the AI)
  project      TEXT,
  client       TEXT,
  category     TEXT,
  discipline   TEXT,
  alt          TEXT,
  ai           TEXT,                            -- JSON: the AI's raw suggestion, kept for reference
  sheet_id     TEXT,                            -- scroll-item-N once published
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS drafts_status ON drafts (status, created_at);

-- Descriptions for projects, written in the Studio, copied to the
-- "projects" tab on Publish.
CREATE TABLE IF NOT EXISTS project_drafts (
  name         TEXT PRIMARY KEY,                -- lower-case project name
  project      TEXT NOT NULL,                   -- as typed
  description  TEXT NOT NULL DEFAULT '',
  answers      TEXT,                            -- JSON: your answers to the AI's questions
  updated_at   TEXT NOT NULL
);
