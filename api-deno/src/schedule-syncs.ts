import { kv } from "./db.ts";

kv.enqueue({ type: "syncPackageVulnerabilities" });
console.log("Scheduled vulnerability sync.");