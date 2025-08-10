import { updateScanResult, upsertVulnerability, upsertPackageMetadata } from "./db/index.ts";
import { performScan as executeMockScan } from "./scanner.ts"; // Renamed import for clarity
import { PackageMetadata, ScanStatus, PackageVulnerability } from "./types.ts";

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
            osv_id: "GHSA-j8r7-94qg-qg6g",
            package_name: "lodash",
            package_version_range: "< 4.17.21",
            osv_data: { summary: "Prototype Pollution in lodash", database_specific: { severity: "HIGH" } }
        },
        {
            osv_id: "GHSA-j8r7-94qg-qg6g",
            package_name: "lodash",
            package_version_range: "< 4.17.21",
            summary: "Prototype Pollution in lodash",
            severity: "HIGH"
        },
        {
            osv_id: "GHSA-cph5-m8f7-6c5x",
            package_name: "moment",
            package_version_range: "< 2.29.2",
            summary: "Path Traversal in moment",
            severity: "CRITICAL"
        }
    ];

    for (const vuln of mockVulns) {
        await upsertVulnerability(vuln);
    }

    console.log("[Task] Vulnerability database sync complete.");
}

export async function syncPackageIndex() {
    console.log("[Task] Starting mock package index sync...");
    const mockPackages: PackageMetadata[] = [
        { name: "react", latest_version: "18.2.0", monthly_downloads: 10000000, description: "A JavaScript library for building user interfaces.", updated_at: new Date().toISOString() },
        { name: "lodash", latest_version: "4.17.21", monthly_downloads: 5000000, description: "A modern JavaScript utility library delivering modularity, performance, & extras.", updated_at: new Date().toISOString() },
        // ... more mock packages
    ];
    for (const pkg of mockPackages) {
        await upsertPackageMetadata(pkg);
    }
    console.log("[Task] Mock package index sync complete.");
}


/**
 * This is the handler for the 'performScan' task type.
 * It orchestrates the scanning process.
 */
export async function performScan(payload: { url: string; scanId: string }) {
    try {
        // 1. Call the actual scanner logic (which is our mock in scanner.ts)
        const scanResult = await executeMockScan(payload.url);

        // 2. Update the database with the result
        await updateScanResult(payload.scanId, ScanStatus.Processed, scanResult);
        console.log(`[Task] Scan completed for ${payload.url}`);
    } catch (error) {
        console.error(`[Task] Failed to scan ${payload.url}:`, error);
        await updateScanResult(payload.scanId, ScanStatus.Failed);
        // Re-throw the error so the worker marks the task as failed
        throw error;
    }
}