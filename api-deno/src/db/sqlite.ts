import { ulid, Database } from "../deps.ts";
import {
  Hostname,
  WebPage,
  WebPageScan,
  ScanStatus,
  ScanResult,
  PackageMetadata,
  PackageVulnerability,
  Task,
  TaskType,
} from "../types.ts";

const db = new Database(Deno.env.get("SQLITE_PATH") || "gradejs.db", {
    int64: true, // Use BigInt for integers
});
db.exec("PRAGMA journal_mode = WAL;"); // Recommended for better concurrency

// --- Database Service Functions for SQLite ---

export function findOrCreateHostname(hostname: string): Hostname {
  using stmt = db.prepare("SELECT id, global_rank FROM hostnames WHERE id = ?");
  let existing = stmt.get<Hostname>(hostname);
  if (!existing) {
    using insertStmt = db.prepare("INSERT INTO hostnames (id) VALUES (?) RETURNING id, global_rank");
    existing = insertStmt.get<Hostname>(hostname)!;
  }
  return existing;
}

export function findOrCreateWebPage(url: URL): WebPage {
  const hostnameEntity = findOrCreateHostname(url.hostname);
  const path = url.pathname;
  using stmt = db.prepare("SELECT id, hostname_id, path, created_at FROM webpages WHERE hostname_id = ? AND path = ?");
  let existing = stmt.get<WebPage>(hostnameEntity.id, path);

  if (!existing) {
    const id = ulid();
    using insertStmt = db.prepare("INSERT INTO webpages (id, hostname_id, path) VALUES (?, ?, ?) RETURNING id, hostname_id, path, created_at");
    existing = insertStmt.get<WebPage>(id, hostnameEntity.id, path)!;
  }
  return existing;
}

export function createScan(url: URL): WebPageScan {
    const runTransaction = db.transaction(() => {
        const webPage = findOrCreateWebPage(url);
        const id = ulid();
        const scan: WebPageScan = {
            id,
            web_page_id: webPage.id,
            status: ScanStatus.Pending,
            created_at: new Date().toISOString(),
        };

        using insertStmt = db.prepare("INSERT INTO webpage_scans (id, web_page_id, status) VALUES (?, ?, ?) RETURNING *");
        const newScan = insertStmt.get<WebPageScan>(scan.id, scan.web_page_id, scan.status)!;

        enqueueTask(TaskType.PerformScan, { url: url.href, scanId: newScan.id });

        return newScan;
    });

    return runTransaction();
}

export function getScanById(id: string): WebPageScan | null {
  using stmt = db.prepare("SELECT * FROM webpage_scans WHERE id = ?");
  const scan = stmt.get<WebPageScan>(id);
  if (scan && typeof scan.scan_result === 'string') {
    scan.scan_result = JSON.parse(scan.scan_result);
  }
  return scan || null;
}

export function getLatestScanByUrl(url: URL): WebPageScan | null {
  using stmt = db.prepare(`
    SELECT s.* FROM webpage_scans s
    JOIN webpages w ON s.web_page_id = w.id
    WHERE w.hostname_id = ? AND w.path = ?
    ORDER BY s.created_at DESC LIMIT 1
  `);
  const scan = stmt.get<WebPageScan>(url.hostname, url.pathname);
  if (scan && typeof scan.scan_result === 'string') {
      scan.scan_result = JSON.parse(scan.scan_result);
  }
  return scan || null;
}

export function updateScanResult(scanId: string, status: ScanStatus, result?: ScanResult) {
  const runTransaction = db.transaction(() => {
    const finishedAt = new Date().toISOString();
    const scanResultJson = result ? JSON.stringify(result) : null;
    using stmt = db.prepare("UPDATE webpage_scans SET status = ?, scan_result = ?, finished_at = ? WHERE id = ?");
    stmt.run(status, scanResultJson, finishedAt, scanId);

    // Further logic for projections can be added here if needed
  });
  runTransaction();
}


export function getPackageInfo(packageName: string): (PackageMetadata & { vulnerabilities: any[] }) | null {
  using pkgStmt = db.prepare("SELECT * FROM package_metadata WHERE name = ?");
  const pkg = pkgStmt.get<PackageMetadata>(packageName);

  if (!pkg) return null;

  using vulnStmt = db.prepare("SELECT osv_id, package_version_range, osv_data FROM package_vulnerabilities WHERE package_name = ?");
  const vulns = vulnStmt.all<PackageVulnerability>(packageName);

  const vulnerabilities = vulns.map(v => {
      const data = typeof v.osv_data === 'string' ? JSON.parse(v.osv_data) : v.osv_data;
      return {
        osvId: v.osv_id,
        packageName: packageName,
        packageVersionRange: v.package_version_range,
        summary: data.summary,
        severity: data.database_specific?.severity,
        detailsUrl: `https://github.com/advisories/${v.osv_id}`,
      };
  });

  return { ...pkg, vulnerabilities };
}

export function upsertPackageMetadata(data: Partial<PackageMetadata> & { name: string }) {
  const runTransaction = db.transaction(() => {
    using stmt = db.prepare(`
      INSERT INTO package_metadata (
        name, latest_version, monthly_downloads, description, full_description, maintainers,
        keywords, version_specific_values, homepage_url, repository_url, license, update_seq, updated_at
      ) VALUES (
        :name, :latest_version, :monthly_downloads, :description, :full_description, :maintainers,
        :keywords, :version_specific_values, :homepage_url, :repository_url, :license, :update_seq, :updated_at
      ) ON CONFLICT(name) DO UPDATE SET
        latest_version = excluded.latest_version,
        monthly_downloads = excluded.monthly_downloads,
        description = excluded.description,
        full_description = excluded.full_description,
        maintainers = excluded.maintainers,
        keywords = excluded.keywords,
        version_specific_values = excluded.version_specific_values,
        homepage_url = excluded.homepage_url,
        repository_url = excluded.repository_url,
        license = excluded.license,
        update_seq = excluded.update_seq,
        updated_at = excluded.updated_at
    `);
    stmt.run({
        ":name": data.name,
        ":latest_version": data.latest_version || '',
        ":monthly_downloads": data.monthly_downloads,
        ":description": data.description,
        ":full_description": data.full_description,
        ":maintainers": JSON.stringify(data.maintainers || []),
        ":keywords": JSON.stringify(data.keywords || []),
        ":version_specific_values": JSON.stringify(data.version_specific_values || {}),
        ":homepage_url": data.homepage_url,
        ":repository_url": data.repository_url,
        ":license": data.license,
        ":update_seq": data.update_seq,
        ":updated_at": data.updated_at
    });
  });
  runTransaction();
}

export function upsertVulnerability(vuln: PackageVulnerability) {
    using stmt = db.prepare(`
        INSERT INTO package_vulnerabilities (osv_id, package_name, package_version_range, osv_data)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (osv_id, package_name) DO UPDATE SET
            package_version_range = excluded.package_version_range,
            osv_data = excluded.osv_data
    `);
    stmt.run(vuln.osv_id, vuln.package_name, vuln.package_version_range, JSON.stringify(vuln.osv_data));
}

// --- Simple Task Queue using SQLite ---

export function enqueueTask(type: TaskType, payload: any) {
  const id = ulid();
  using stmt = db.prepare("INSERT INTO tasks (id, type, payload) VALUES (?, ?, ?)");
  stmt.run(id, type, JSON.stringify(payload));
}

export function dequeueTask(): Task | null {
  const runTransaction = db.transaction((): Task | null => {
      using selectStmt = db.prepare("SELECT * FROM tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1");
      const task = selectStmt.get<Task>();

      if (task) {
          using updateStmt = db.prepare("UPDATE tasks SET status = 'processing', processed_at = ? WHERE id = ?");
          updateStmt.run(new Date().toISOString(), task.id);
          // Parse payload before returning
          if (typeof task.payload === 'string') {
              task.payload = JSON.parse(task.payload);
          }
          return task;
      }
      return null;
  });

  return runTransaction();
}

export function completeTask(id: string) {
  using stmt = db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?");
  stmt.run(id);
}

export function failTask(id: string, error?: string) {
  using stmt = db.prepare("UPDATE tasks SET status = 'failed', payload = json_patch(payload, json_object('error', ?)) WHERE id = ?");
  stmt.run(error || 'Unknown error', id);
}