-- Owner-private technical preview. D1 is the source of truth for metadata only.
-- No payment or public subscription is enabled in v0.2.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, mode TEXT NOT NULL,
 timeline_json TEXT NOT NULL DEFAULT '[]', revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id,updated_at);
CREATE TABLE IF NOT EXISTS assets (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, project_id TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE,
 filename TEXT NOT NULL, bytes INTEGER NOT NULL, media_type TEXT NOT NULL,
 duration_seconds REAL, codec TEXT, status TEXT NOT NULL DEFAULT 'ready', created_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS idx_assets_proj ON assets(project_id,owner_id);
CREATE TABLE IF NOT EXISTS uploads (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, project_id TEXT NOT NULL, asset_id TEXT NOT NULL UNIQUE,
 object_key TEXT NOT NULL UNIQUE, r2_upload_id TEXT NOT NULL, filename TEXT NOT NULL, fingerprint TEXT NOT NULL,
 bytes INTEGER NOT NULL, part_size INTEGER NOT NULL, total_parts INTEGER NOT NULL,
 status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS idx_uploads_project ON uploads(project_id,owner_id,status);
CREATE TABLE IF NOT EXISTS upload_parts (
 upload_id TEXT NOT NULL, number INTEGER NOT NULL, etag TEXT NOT NULL, bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
 PRIMARY KEY(upload_id,number), FOREIGN KEY(upload_id) REFERENCES uploads(id)
);
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 kind TEXT NOT NULL, quality TEXT NOT NULL, status TEXT NOT NULL,
 progress REAL NOT NULL DEFAULT 0, result_key TEXT, error_code TEXT, manifest_json TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS idx_jobs_proj ON jobs(project_id,owner_id,created_at);
CREATE TABLE IF NOT EXISTS usage_ledger (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, project_id TEXT, job_id TEXT,
 metric TEXT NOT NULL, units INTEGER NOT NULL, recorded_at TEXT NOT NULL
);
-- Future-only subscription-ready schema. No Stripe keys, invoices, or billing hooks.
CREATE TABLE IF NOT EXISTS entitlements (
 owner_id TEXT PRIMARY KEY, tier TEXT NOT NULL DEFAULT 'owner_preview',
 max_project_bytes INTEGER NOT NULL, max_source_bytes INTEGER NOT NULL,
 max_concurrent_jobs INTEGER NOT NULL DEFAULT 0, billing_enabled INTEGER NOT NULL DEFAULT 0
);
