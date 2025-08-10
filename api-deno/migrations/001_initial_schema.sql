-- hostnames table
CREATE TABLE IF NOT EXISTS hostnames (
    id TEXT PRIMARY KEY, -- hostname, e.g., 'deno.land'
    global_rank INTEGER
);

-- webpages table
CREATE TABLE IF NOT EXISTS webpages (
    id TEXT PRIMARY KEY, -- ULID for unique identification
    hostname_id TEXT NOT NULL REFERENCES hostnames(id),
    path TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(hostname_id, path)
);

-- webpage_scans table
CREATE TABLE IF NOT EXISTS webpage_scans (
    id TEXT PRIMARY KEY, -- ULID for unique identification
    web_page_id TEXT NOT NULL REFERENCES webpages(id),
    status TEXT NOT NULL, -- e.g., 'pending', 'processed', 'failed'
    scan_result JSONB, -- Stores identified_packages, modules, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_webpage_scans_web_page_id_created_at ON webpage_scans (web_page_id, created_at DESC);

-- package_metadata table
CREATE TABLE IF NOT EXISTS package_metadata (
    name TEXT PRIMARY KEY,
    latest_version TEXT NOT NULL,
    monthly_downloads INTEGER,
    description TEXT,
    full_description TEXT,
    maintainers JSONB, -- Array of objects
    keywords JSONB, -- Array of strings
    version_specific_values JSONB, -- Object of version data
    homepage_url TEXT,
    repository_url TEXT,
    license TEXT,
    update_seq INTEGER,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- package_vulnerabilities table
CREATE TABLE IF NOT EXISTS package_vulnerabilities (
    osv_id TEXT NOT NULL,
    package_name TEXT NOT NULL,
    package_version_range TEXT NOT NULL,
    osv_data JSONB NOT NULL, -- Raw OSV data
    PRIMARY KEY (osv_id, package_name)
);

-- package_usage_by_hostname_projection table
-- Simplified version of the original TypeORM entity
CREATE TABLE IF NOT EXISTS package_usage_by_hostname_projection (
    id TEXT PRIMARY KEY, -- ULID
    hostname_id TEXT NOT NULL REFERENCES hostnames(id),
    source_scan_id TEXT NOT NULL REFERENCES webpage_scans(id),
    package_name TEXT NOT NULL,
    package_version_set JSONB NOT NULL,
    UNIQUE(hostname_id, package_name) -- Ensure only one entry per package per hostname
);
CREATE INDEX IF NOT EXISTS idx_package_usage_package_name ON package_usage_by_hostname_projection (package_name);

-- Materialized View for Package Popularity
-- This view aggregates package usage for quick querying.
CREATE MATERIALIZED VIEW IF NOT EXISTS package_popularity_view AS
  SELECT
    p.package_name AS package_name,
    COUNT(DISTINCT p.hostname_id) AS usage_by_hostname_count,
    (SELECT jsonb_agg(r)
      FROM (
        SELECT pv.value AS package_version, COUNT(pv.value) AS count
        FROM package_usage_by_hostname_projection AS sub_usage,
             jsonb_array_elements_text(sub_usage.package_version_set) AS pv
        WHERE sub_usage.package_name = p.package_name
        GROUP BY pv.value
      ) AS r
    ) AS version_popularity
  FROM
    package_usage_by_hostname_projection AS p
  GROUP BY p.package_name;

CREATE UNIQUE INDEX IF NOT EXISTS package_popularity_view_package_name_idx ON package_popularity_view (package_name);
CREATE INDEX IF NOT EXISTS package_popularity_view_usage_by_hostname_count_idx ON package_popularity_view (usage_by_hostname_count DESC);


-- Simple tasks table for worker queue
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, -- ULID for unique task ID
    type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_tasks_status_created_at ON tasks (status, created_at ASC);

-- Dummy tables for showcasing/projections from original for completeness, if you decide to implement them later
CREATE TABLE IF NOT EXISTS showcased_web_pages (
    id SERIAL PRIMARY KEY,
    display_order SMALLINT NOT NULL DEFAULT 0,
    web_page_id TEXT NOT NULL REFERENCES webpages(id)
);

CREATE TABLE IF NOT EXISTS showcased_packages (
    id SERIAL PRIMARY KEY,
    display_order SMALLINT NOT NULL DEFAULT 0,
    package_name TEXT NOT NULL REFERENCES package_metadata(name),
    UNIQUE(package_name)
);

CREATE TABLE IF NOT EXISTS scans_with_vulnerabilities_projection (
    id SERIAL PRIMARY KEY,
    source_scan_id TEXT NOT NULL REFERENCES webpage_scans(id),
    vulnerabilities JSONB NOT NULL, -- Array of CompactVulnerabilityDescription
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scans_with_vulnerabilities_projection_created_at ON scans_with_vulnerabilities_projection (created_at DESC);

-- Add pg_trgm for full-text search capabilities (from original migrations)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS hostname_hostname_trgm ON hostnames USING gin (id gin_trgm_ops);
CREATE INDEX IF NOT EXISTS package_metadata_name_trgm ON package_metadata USING gin (name gin_trgm_ops);