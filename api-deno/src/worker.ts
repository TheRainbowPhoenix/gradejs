import { dequeueTask, completeTask, failTask } from "./db/index.ts";
import { TaskType } from "./types.ts";
import * as taskHandlers from "./tasks.ts";

const POLL_INTERVAL_MS = 5000; // Poll for new tasks every 5 seconds.
console.log(`Worker process started. Polling for tasks every ${POLL_INTERVAL_MS / 1000} seconds...`);

/**
 * Fetches the next available task from the database and processes it.
 */
async function processNextTask() {
  let task = null;
  try {
    // Atomically fetch a task and mark it as 'processing'
    task = await dequeueTask();

    if (task) {
      console.log(`[Worker] Processing task: ${task.type} (ID: ${task.id})`);
      
      // Dynamically call the correct handler from tasks.ts
      const handler = (taskHandlers as any)[task.type];

      if (typeof handler === 'function') {
        await handler(task.payload);
      } else {
        throw new Error(`No handler found for task type: ${task.type}`);
      }
      
      // Mark the task as completed
      await completeTask(task.id);
      console.log(`[Worker] Task ${task.type} (ID: ${task.id}) completed successfully.`);
    }
  } catch (error) {
    console.error(`[Worker] An error occurred while processing task.`, { task, error });
    if (task) {
      // If a task was dequeued, mark it as failed
      await failTask(task.id, (error as Error)?.message || "");
    }
  }
}

// Set up the polling loop to continuously check for new tasks.
const intervalId = setInterval(processNextTask, POLL_INTERVAL_MS);

// Graceful shutdown logic
async function shutdown() {
  console.log("Worker shutting down...");
  clearInterval(intervalId); // Stop polling for new tasks

  // Wait a moment for any in-progress task to finish
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Close database connections if the driver supports it
  const dbModule = await import("./db/index.ts") as any;
  if (dbModule.postgres && typeof dbModule.postgres.end === 'function') {
      await dbModule.postgres.end({ timeout: 5 });
  }
  if (dbModule.sqlite && typeof dbModule.sqlite.close === 'function') {
      dbModule.sqlite.close();
  }

  console.log("Shutdown complete.");
  Deno.exit(0);
}

Deno.addSignalListener("SIGINT", shutdown);
try {
    Deno.addSignalListener("SIGTERM", shutdown);
} catch (_) {}