-- BIS Sathi AI: project-isolated D1 schema.
-- Apply only to the BIS Sathi AI database; never point NEMIX or Navkar at this database.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS standards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  is_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  edition TEXT,
  published_year INTEGER,
  review_year INTEGER,
  status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('current', 'revised', 'withdrawn', 'draft', 'unknown')),
  official_url TEXT,
  source_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS official_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  standard_id INTEGER REFERENCES standards(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  publisher TEXT NOT NULL DEFAULT 'Bureau of Indian Standards',
  source_type TEXT NOT NULL DEFAULT 'webpage'
    CHECK (source_type IN ('webpage', 'standard', 'qco', 'product_manual', 'gazette', 'pdf', 'other')),
  published_at TEXT,
  checked_at TEXT,
  content_hash TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS source_excerpts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES official_sources(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL DEFAULT 'en',
  excerpt TEXT NOT NULL,
  locator TEXT,
  verified_at TEXT,
  UNIQUE(source_id, language_code, locator)
);

CREATE TABLE IF NOT EXISTS translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('standard', 'source', 'ui', 'glossary')),
  entity_key TEXT NOT NULL,
  language_code TEXT NOT NULL,
  translated_title TEXT,
  translated_text TEXT,
  review_status TEXT NOT NULL DEFAULT 'machine_draft'
    CHECK (review_status IN ('machine_draft', 'needs_review', 'human_reviewed', 'approved')),
  reviewer_note TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_type, entity_key, language_code)
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_ref TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  category TEXT,
  comment TEXT,
  language_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_ref TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  change_summary TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Store only opaque, short-lived session references. Do not store raw IPs,
-- authentication tokens, full chat transcripts, or API keys in this table.
CREATE TABLE IF NOT EXISTS session_refs (
  session_ref TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_standards_status ON standards(status);
CREATE INDEX IF NOT EXISTS idx_sources_standard_id ON official_sources(standard_id);
CREATE INDEX IF NOT EXISTS idx_sources_active_type ON official_sources(is_active, source_type);
CREATE INDEX IF NOT EXISTS idx_excerpts_source_language ON source_excerpts(source_id, language_code);
CREATE INDEX IF NOT EXISTS idx_translations_language_status ON translations(language_code, review_status);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_key, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON session_refs(expires_at);
