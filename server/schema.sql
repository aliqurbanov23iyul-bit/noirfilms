-- Idempotent migration from the original NOIR film table.
CREATE TABLE IF NOT EXISTS shelves (
 id text PRIMARY KEY, name text NOT NULL, position integer NOT NULL DEFAULT 0
);
INSERT INTO shelves(id,name,position) VALUES('main','Əsas kolleksiya',0) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS films (
 id text PRIMARY KEY, title text NOT NULL, year integer NOT NULL CHECK(year>=1888),
 genre text NOT NULL, director text NOT NULL DEFAULT '', actors text NOT NULL DEFAULT '',
 plot text NOT NULL DEFAULT '', rating numeric(3,1) CHECK(rating BETWEEN 0 AND 10),
 poster_url text NOT NULL DEFAULT '', trailer_id text, position integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE films ALTER COLUMN id DROP DEFAULT;
ALTER TABLE films ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE films ADD COLUMN IF NOT EXISTS shelf_id text NOT NULL DEFAULT 'main' REFERENCES shelves(id);
ALTER TABLE films ADD COLUMN IF NOT EXISTS tmdb_id bigint;
ALTER TABLE films ADD COLUMN IF NOT EXISTS rating_source text NOT NULL DEFAULT 'Redaktor';
ALTER TABLE films ADD COLUMN IF NOT EXISTS top_rank integer;
ALTER TABLE films ADD COLUMN IF NOT EXISTS top_snapshot text;
ALTER TABLE films ADD COLUMN IF NOT EXISTS translation_status text NOT NULL DEFAULT 'editorial';
ALTER TABLE films ADD COLUMN IF NOT EXISTS source_updated_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS films_tmdb_unique ON films(tmdb_id);
CREATE INDEX IF NOT EXISTS films_shelf_position ON films(shelf_id,position);
CREATE TABLE IF NOT EXISTS noir_sessions (
 id text PRIMARY KEY, username text NOT NULL, csrf text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS noir_rate_limits (
 key text NOT NULL, bucket bigint NOT NULL, hits integer NOT NULL,
 expires_at timestamptz NOT NULL, PRIMARY KEY(key,bucket)
);
CREATE TABLE IF NOT EXISTS noir_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor text NOT NULL, action text NOT NULL, record_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS noir_imports (
 id text PRIMARY KEY, manifest jsonb NOT NULL, cursor integer NOT NULL DEFAULT 0,
 total integer NOT NULL CHECK(total=500), status text NOT NULL DEFAULT 'running',
 error text, leased_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
