import { kv } from "./db.ts";
import { syncPackageVulnerabilities, handlePerformScan } from "./tasks.ts";

console.log("Worker process started. Listening for tasks...");

kv.listenQueue(async (msg: any) => {
  console.log("Received task:", msg.type);

  switch (msg.type) {
    case "performScan":
      await handlePerformScan(msg.payload);
      break;

    case "syncPackageVulnerabilities":
      await syncPackageVulnerabilities();
      break;

    // Add other task handlers here
    default:
      console.error(`Unknown task type: ${msg.type}`);
  }
});