export interface Hostname {
  id: string; // hostname e.g., "deno.land"
  globalRank?: number;
}

export interface WebPage {
  id: string; // url e.g., "https://deno.land/manual"
  hostnameId: string;
  path: string;
}

export enum ScanStatus {
  Pending = "pending",
  Processed = "processed",
  Failed = "failed",
}

export interface WebPageScan {
  id: string; // ulid
  webPageId: string; // The URL of the page
  status: ScanStatus;
  scanResult?: ScanResult;
  createdAt: string; // ISO 8601
  finishedAt?: string; // ISO 8601
}

export interface ScanResult {
  identifiedPackages: IdentifiedPackage[];
  // Other fields like identifiedModuleMap can be added here
}

export interface IdentifiedPackage {
  name: string;
  versionSet: string[];
}

export interface PackageMetadata {
  name: string;
  latestVersion: string;
  description?: string;
  homepageUrl?: string;
  repositoryUrl?: string;
  // ... other metadata fields
}

export interface PackageVulnerability {
  osvId: string;
  packageName: string;
  packageVersionRange: string;
  summary?: string;
  severity?: string;
}

// --- Deno KV Initialization ---

export const kv = await Deno.openKv();

// --- Database Service Functions ---

// Scans
export async function createScan(url: URL): Promise<WebPageScan> {
  const scanId = crypto.randomUUID();
  const webPageId = url.href;

  const scan: WebPageScan = {
    id: scanId,
    webPageId: webPageId,
    status: ScanStatus.Pending,
    createdAt: new Date().toISOString(),
  };

  const hostname: Hostname = { id: url.hostname };

  const res = await kv.atomic()
    .set(["scans", scanId], scan)
    .set(["scans_by_url", webPageId], scanId)
    .set(["hostnames", url.hostname], hostname)
    .commit();

  if (!res.ok) throw new Error("Failed to create scan.");

  // Enqueue the scan task for the worker
  await kv.enqueue({ type: "performScan", payload: { url: url.href, scanId } });

  return scan;
}

export async function getScanById(id: string): Promise<WebPageScan | null> {
    const res = await kv.get<WebPageScan>(["scans", id]);
    return res.value;
}

export async function getLatestScanByUrl(url: URL): Promise<WebPageScan | null> {
  const webPageId = url.href;
  const scanIdRes = await kv.get<string>(["scans_by_url", webPageId]);

  if (!scanIdRes.value) return null;

  return getScanById(scanIdRes.value);
}

export async function updateScanResult(scanId: string, status: ScanStatus, result?: ScanResult) {
  const scanKey = ["scans", scanId];
  const scan = (await kv.get<WebPageScan>(scanKey)).value;
  if (!scan) throw new Error("Scan not found");

  scan.status = status;
  scan.scanResult = result;
  scan.finishedAt = new Date().toISOString();

  const atomicOp = kv.atomic().set(scanKey, scan);

  // If the scan was successful, also update package usage stats
  if (status === ScanStatus.Processed && result) {
      for (const pkg of result.identifiedPackages) {
          const usageKey = ["package_usage", pkg.name, new URL(scan.webPageId).hostname];
          atomicOp.set(usageKey, true);
      }
  }

  const res = await atomicOp.commit();
  if (!res.ok) throw new Error("Failed to update scan result");
}

// Packages
export async function getPackageInfo(packageName: string) {
    const pkgRes = await kv.get<PackageMetadata>(["packages", packageName]);
    const vulnerabilities: PackageVulnerability[] = [];
    for await (const entry of kv.list<PackageVulnerability>({ prefix: ["vulnerabilities_by_package", packageName]})) {
        vulnerabilities.push(entry.value);
    }
    return { ...pkgRes.value, vulnerabilities };
}

// Vulnerabilities
export async function upsertVulnerability(vuln: PackageVulnerability) {
    const key1 = ["vulnerabilities", vuln.osvId, vuln.packageName];
    const key2 = ["vulnerabilities_by_package", vuln.packageName, vuln.osvId];
    const res = await kv.atomic()
      .set(key1, vuln)
      .set(key2, vuln)
      .commit();

    if (!res.ok) console.error(`Failed to upsert vulnerability ${vuln.osvId}`);
}