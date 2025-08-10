import { upsertVulnerability, PackageVulnerability } from "./db.ts";
import { performScan } from "./scanner.ts";
import { updateScanResult, ScanStatus } from "./db.ts";

/**
 * Fetches the GitHub Advisory Database, parses it, and stores
 * vulnerability information in the KV store.
 */
export async function syncPackageVulnerabilities() {
    console.log("[Task] Starting vulnerability database sync...");
    // In a real implementation, you would fetch and parse the tarball
    // as in the original `syncPackageVulnerabilities.ts`.
    // For this example, we will just add a few mock vulnerabilities.

    const mockVulns: PackageVulnerability[] = [
        {
            osvId: "GHSA-j8r7-94qg-qg6g",
            packageName: "lodash",
            packageVersionRange: "< 4.17.21",
            summary: "Prototype Pollution in lodash",
            severity: "HIGH"
        },
        {
            osvId: "GHSA-cph5-m8f7-6c5x",
            packageName: "moment",
            packageVersionRange: "< 2.29.2",
            summary: "Path Traversal in moment",
            severity: "CRITICAL"
        }
    ];

    for (const vuln of mockVulns) {
        await upsertVulnerability(vuln);
    }

    console.log("[Task] Vulnerability database sync complete.");
}

/**
 * The main task that orchestrates the scanning of a webpage.
 */
export async function handlePerformScan(payload: { url: string; scanId: string }) {
    try {
        const scanResult = await performScan(payload.url);
        await updateScanResult(payload.scanId, ScanStatus.Processed, scanResult);
        console.log(`[Task] Scan completed for ${payload.url}`);
    } catch (error) {
        console.error(`[Task] Failed to scan ${payload.url}:`, error);
        await updateScanResult(payload.scanId, ScanStatus.Failed);
    }
}