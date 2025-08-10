import { IdentifiedPackage, ScanResult } from "./types.ts";


// A list of potential packages to be "found"
const FAKE_PACKAGES: IdentifiedPackage[] = [
  { name: "react", version_set: ["18.2.0"] },
  { name: "lodash", version_set: ["4.17.21"] },
  { name: "oak", version_set: ["12.4.0"] },
  { name: "zod", version_set: ["3.21.4"] },
  { name: "moment", version_set: ["2.29.4"] },
];

/**
 * Mocks the behavior of the external GradeJS scanner.
 * In a real scenario, this would involve fetching JS files,
 * parsing ASTs, and identifying libraries.
 *
 * @param url The URL to "scan".
 * @returns A simulated scan result.
 */
export async function performScan(url: string): Promise<ScanResult> {
  console.log(`[Scanner] Starting mock scan for: ${url}`);

  // Simulate network and processing delay
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Return a random subset of fake packages
  const identified_packages = FAKE_PACKAGES.sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 3) + 1);

  const result: ScanResult = {
    identified_packages,
  };

  console.log(`[Scanner] Completed mock scan for: ${url}`);
  return result;
}