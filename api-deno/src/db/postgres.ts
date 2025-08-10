import { postgres, ulid } from "../deps.ts";
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
  SearchResultItem, 
} from "../types.ts";

export const dbType = "postgres";

// Load environment variables from .env file
const DATABASE_URL = Deno.env.get("DATABASE_URL");
// const DATABASE_URL = Deno.env.get("DATABASE_URL") || "postgres://gradejs:gradejs@localhost:5432/gradejs-public";
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set. Required for postgres DB_TYPE.");
}


// Initialize postgres.js client
export const sql = postgres(DATABASE_URL);

// --- Database Service Functions ---

// Hostname Operations
export async function findOrCreateHostname(hostname: string): Promise<Hostname> {
  const [existing] = await sql<Hostname[]>`SELECT id, global_rank FROM hostnames WHERE id = ${hostname}`;
  if (existing) {
    return existing;
  }
  const [newHostname] = await sql<Hostname[]>`INSERT INTO hostnames (id) VALUES (${hostname}) RETURNING id, global_rank`;
  return newHostname;
}

// WebPage Operations
export async function findOrCreateWebPage(url: URL): Promise<WebPage> {
  const hostnameEntity = await findOrCreateHostname(url.hostname);
  const path = url.pathname;
  const id = ulid();

  const [existing] = await sql<WebPage[]>`
    SELECT id, hostname_id, path, created_at FROM webpages
    WHERE hostname_id = ${hostnameEntity.id} AND path = ${path}
  `;
  if (existing) {
    return existing;
  }
  const [newWebPage] = await sql<WebPage[]>`
    INSERT INTO webpages (id, hostname_id, path)
    VALUES (${id}, ${hostnameEntity.id}, ${path})
    RETURNING id, hostname_id, path, created_at
  `;
  return newWebPage;
}

// WebPageScan Operations
export async function createScan(url: URL): Promise<WebPageScan> {
  return await sql.begin(async (t) => {
    const webPage = await findOrCreateWebPage(url);
    const id = ulid();
    const scan: WebPageScan = {
      id,
      web_page_id: webPage.id,
      status: ScanStatus.Pending,
      created_at: new Date().toISOString(),
    };

    const [newScan] = await t<WebPageScan[]>`
      INSERT INTO webpage_scans (id, web_page_id, status, created_at)
      VALUES (${scan.id}, ${scan.web_page_id}, ${scan.status}, ${scan.created_at})
      RETURNING id, web_page_id, status, created_at
    `;

    // Enqueue the task for the worker
    await enqueueTask(TaskType.PerformScan, { url: url.href, scanId: newScan.id });

    return newScan;
  });
}

export async function getScanById(id: string): Promise<WebPageScan | null> {
  const [scan] = await sql<WebPageScan[]>`SELECT * FROM webpage_scans WHERE id = ${id}`;
  return scan || null;
}

export async function getLatestScanByWebPageId(webPageId: string): Promise<WebPageScan | null> {
  const [scan] = await sql<WebPageScan[]>`
    SELECT * FROM webpage_scans
    WHERE web_page_id = ${webPageId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return scan || null;
}

export async function getLatestScanByUrl(url: URL): Promise<WebPageScan | null> {
  const hostnameEntity = await findOrCreateHostname(url.hostname);
  const path = url.pathname;

  const [webPage] = await sql<WebPage[]>`
    SELECT id FROM webpages
    WHERE hostname_id = ${hostnameEntity.id} AND path = ${path}
  `;

  if (!webPage) return null;

  return getLatestScanByWebPageId(webPage.id);
}


export async function updateScanResult(scanId: string, status: ScanStatus, result?: ScanResult) {
  return await sql.begin(async (t) => {
    const [scan] = await t<WebPageScan[]>`
      SELECT * FROM webpage_scans WHERE id = ${scanId} FOR UPDATE
    `;
    if (!scan) throw new Error("Scan not found");

    const finishedAt = new Date().toISOString();
    const newScanResult = result ? sql.json(result) : null;

    await t`
      UPDATE webpage_scans
      SET status = ${status}, scan_result = ${newScanResult}, finished_at = ${finishedAt}
      WHERE id = ${scanId}
    `;

    // If successful, update package usage projection
    if (status === ScanStatus.Processed && result) {
        const webpage = (await t<WebPage[]>`SELECT * FROM webpages WHERE id = ${scan.web_page_id}`)[0];
        const hostname = (await t<Hostname[]>`SELECT * FROM hostnames WHERE id = ${webpage.hostname_id}`)[0];

        const packageUsageUpdates = result.identified_packages.map(pkg =>
            t`
                INSERT INTO package_usage_by_hostname_projection (hostname_id, source_scan_id, package_name, package_version_set)
                VALUES (${hostname.id}, ${scanId}, ${pkg.name}, ${sql.json(pkg.version_set)})
                ON CONFLICT (hostname_id, package_name) DO UPDATE SET
                    source_scan_id = EXCLUDED.source_scan_id,
                    package_version_set = EXCLUDED.package_version_set
            `
        );
        await Promise.all(packageUsageUpdates);

        // Refresh materialized view (if it exists)
        await t`REFRESH MATERIALIZED VIEW CONCURRENTLY package_popularity_view`;
    }
  });
}

// PackageMetadata Operations
export async function getPackageInfo(packageName: string): Promise<PackageMetadata | null> {
  const [pkg] = await sql<PackageMetadata[]>`SELECT * FROM package_metadata WHERE name = ${packageName}`;
  if (!pkg) return null;

  const vulnerabilities = await sql<PackageVulnerability[]>`
    SELECT osv_id, package_name, package_version_range, osv_data->>'summary' as summary, osv_data->'database_specific'->>'severity' as severity
    FROM package_vulnerabilities
    WHERE package_name = ${packageName}
  `;

  // Merge vulnerabilities into the package object, adapting to desired structure
  // This structure matches `ClientApi.ScanResultPackageResponse` from Node.js `clientApiRouter.ts`
  const formattedVulnerabilities = vulnerabilities.map(v => ({
      osvId: v.osv_id,
      packageName: v.package_name,
      packageVersionRange: v.package_version_range,
      summary: v.osv_data?.summary,
      severity: v.osv_data?.database_specific?.severity,
      detailsUrl: `https://github.com/advisories/${v.osv_id}`, // Mocked
  }));

  return { ...pkg, vulnerabilities: formattedVulnerabilities } as PackageMetadata;
}


// PackageMetadata: Upsert (replaces TypeORM `upsert` and original `syncPackage`)
export async function upsertPackageMetadata(data: Partial<PackageMetadata> & { name: string }) {
  await sql`
    INSERT INTO package_metadata (
      name, latest_version, monthly_downloads, description, full_description,
      maintainers, keywords, version_specific_values, homepage_url,
      repository_url, license, update_seq, updated_at
    ) VALUES (
      ${data.name}, ${data.latest_version}, ${data.monthly_downloads || null}, ${data.description || null}, ${data.full_description || null},
      ${sql.json(data.maintainers || [])}, ${sql.json(data.keywords || [])}, ${sql.json(data.version_specific_values || {})}, ${data.homepage_url || null},
      ${data.repository_url || null}, ${data.license || null}, ${data.update_seq || null}, ${data.updated_at || null}
    )
    ON CONFLICT (name) DO UPDATE SET
      latest_version = EXCLUDED.latest_version,
      monthly_downloads = EXCLUDED.monthly_downloads,
      description = EXCLUDED.description,
      full_description = EXCLUDED.full_description,
      maintainers = EXCLUDED.maintainers,
      keywords = EXCLUDED.keywords,
      version_specific_values = EXCLUDED.version_specific_values,
      homepage_url = EXCLUDED.homepage_url,
      repository_url = EXCLUDED.repository_url,
      license = EXCLUDED.license,
      update_seq = EXCLUDED.update_seq,
      updated_at = EXCLUDED.updated_at
  `;
}


// PackageVulnerability Operations
export async function upsertVulnerability(vuln: PackageVulnerability) {
  await sql`
    INSERT INTO package_vulnerabilities (osv_id, package_name, package_version_range, osv_data)
    VALUES (${vuln.osv_id}, ${vuln.package_name}, ${vuln.package_version_range}, ${sql.json(vuln.osv_data)})
    ON CONFLICT (osv_id, package_name) DO UPDATE SET
      package_version_range = EXCLUDED.package_version_range,
      osv_data = EXCLUDED.osv_data
  `;
}

// --- Simple Task Queue using PostgreSQL ---

export async function enqueueTask(type: TaskType, payload: any) {
  const id = ulid();
  await sql`
    INSERT INTO tasks (id, type, payload, status, created_at)
    VALUES (${id}, ${type}, ${sql.json(payload)}, 'pending', ${new Date().toISOString()})
  `;
}

export async function dequeueTask(): Promise<Task | null> {
  return await sql.begin(async (t) => {
    // Select a pending task and immediately mark it as 'processing' to prevent other workers from picking it up
    const [task] = await t<Task[]>`
      UPDATE tasks
      SET status = 'processing', processed_at = ${new Date().toISOString()}
      WHERE id = (
        SELECT id FROM tasks
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED -- This is crucial for concurrent workers
      )
      RETURNING *
    `;
    return task || null;
  });
}

export async function completeTask(id: string) {
  await sql`UPDATE tasks SET status = 'completed' WHERE id = ${id}`;
}

export async function failTask(id: string, error?: string) {
  await sql`UPDATE tasks SET status = 'failed', payload = JSONB_SET(payload, '{error}', ${sql.json(error || 'Unknown error')}) WHERE id = ${id}`;
}

export async function searchEntities(query: string): Promise<SearchResultItem[]> {
  const searchTerm = `%${query}%`;
  const limit = 5; // Limit results per entity type

  // Query for packages
  const packageQuery = sql<SearchResultItem[]>`
    SELECT
      'package' as type,
      name,
      description
    FROM package_metadata
    WHERE name ILIKE ${searchTerm}
    ORDER BY monthly_downloads DESC NULLS LAST
    LIMIT ${limit}
  `;

  // Query for scans (hostnames)
  // This query finds matching hostnames and joins to find the latest processed scan for each
  const scanQuery = sql<SearchResultItem[]>`
    SELECT DISTINCT ON (h.id)
        'scan' as type,
        h.id as hostname,
        w.path,
        jsonb_array_length(s.scan_result->'identified_packages') as "packageCount"
    FROM hostnames h
    LEFT JOIN webpages w ON h.id = w.hostname_id
    LEFT JOIN webpage_scans s ON w.id = s.web_page_id
    WHERE h.id ILIKE ${searchTerm} AND s.status = 'processed'
    ORDER BY h.id, s.created_at DESC
    LIMIT ${limit}
  `;

  const [packages, scans] = await Promise.all([packageQuery, scanQuery]);

  return [...packages, ...scans];
}