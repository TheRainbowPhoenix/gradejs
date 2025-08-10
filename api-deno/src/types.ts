// Shared TypeScript interfaces for data models

export interface Hostname {
  id: string; // hostname e.g., "deno.land"
  global_rank?: number;
}

export interface WebPage {
  id: string; // ULID
  hostname_id: string; // hostname e.g., "deno.land"
  path: string; // e.g., "/manual"
  created_at: string; // ISO 8601
}

export enum ScanStatus {
  Pending = "pending",
  Processed = "processed",
  Failed = "failed",
}

export interface WebPageScan {
  id: string; // ULID
  web_page_id: string; // ULID of WebPage
  status: ScanStatus;
  scan_result?: ScanResult; // JSONB
  created_at: string; // ISO 8601
  finished_at?: string; // ISO 8601
}

export interface ScanResult {
  identified_packages: IdentifiedPackage[];
  // Other fields like identifiedModuleMap can be added here, they'll be part of the JSONB column
}

export interface IdentifiedPackage {
  name: string;
  version_set: string[];
}

export interface PackageMetadata {
  name: string;
  latest_version: string;
  monthly_downloads?: number;
  description?: string;
  full_description?: string;
  maintainers?: { name: string; email: string; avatar: string }[];
  keywords?: string[];
  version_specific_values?: Record<string, { dependencies: Record<string, string>; unpacked_size?: number; update_date?: string; registry_modules_count?: number; }>;
  homepage_url?: string;
  repository_url?: string;
  license?: string;
  update_seq?: number;
  updated_at?: string;
}

export interface PackageVulnerability {
  osv_id: string;
  package_name: string;
  package_version_range: string;
  osv_data?: any; // JSONB, raw OSV data
}

// For our simple task queue
export enum TaskType {
  PerformScan = "performScan",
  SyncPackageVulnerabilities = "syncPackageVulnerabilities",
  SyncPackageIndex = "syncPackageIndex",
  SyncPackageIndexBatch = "syncPackageIndexBatch", // From original, but mocked here
  UpdateSitemap = "updateSitemap", // From original, but mocked here
  SyncHostnameRanking = "syncHostnameRanking", // From original, but mocked here
}

export interface Task {
  id: string; // ULID
  type: TaskType;
  payload: any; // JSONB
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string; // ISO 8601
  processed_at?: string; // ISO 8601
}