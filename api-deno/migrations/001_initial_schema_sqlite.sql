-- hostnames table
CREATE TABLE IF NOT EXISTS hostnames (
    id TEXT PRIMARY KEY,
    global_rank INTEGER
);

-- webpages table
CREATE TABLE IF NOT EXISTS webpages (
    id TEXT PRIMARY KEY,
    hostname_id TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (hostname_id) REFERENCES hostnames(id),
    UNIQUE(hostname_id, path)
);

-- webpage_scans table
CREATE TABLE IF NOT EXISTS webpage_scans (
    id TEXT PRIMARY KEY,
    web_page_id TEXT NOT NULL,
    status TEXT NOT NULL,
    scan_result TEXT, -- Stored as JSON string
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    finished_at TEXT,
    FOREIGN KEY (web_page_id) REFERENCES webpages(id)
);
CREATE INDEX IF NOT EXISTS idx_webpage_scans_web_page_id_created_at ON webpage_scans (web_page_id, created_at DESC);

-- package_metadata table
CREATE TABLE IF NOT EXISTS package_metadata (
    name TEXT PRIMARY KEY,
    latest_version TEXT NOT NULL,
    monthly_downloads INTEGER,
    description TEXT,
    full_description TEXT,
    maintainers TEXT, -- JSON string
    keywords TEXT, -- JSON string
    version_specific_values TEXT, -- JSON string
    homepage_url TEXT,
    repository_url TEXT,
    license TEXT,
    update_seq INTEGER,
    updated_at TEXT
);

-- package_vulnerabilities table
CREATE TABLE IF NOT EXISTS package_vulnerabilities (
    osv_id TEXT NOT NULL,
    package_name TEXT NOT NULL,
    package_version_range TEXT NOT NULL,
    osv_data TEXT, -- JSON string
    PRIMARY KEY (osv_id, package_name)
);

-- Tasks table for worker queue
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload TEXT, -- JSON string
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    processed_at TEXT,
    retries INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tasks_status_created_at ON tasks (status, created_at ASC);