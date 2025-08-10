import { Router, Context, helpers } from "./deps.ts";
import { createScan, getLatestScanByUrl, getPackageInfo, enqueueTask, searchEntities } from "./db/index.ts";

const router = new Router();

// Endpoint to initiate a scan
router.post("/scans", async (ctx: Context) => {
  const body = await ctx.request.body({ type: "json" }).value;
  const url = new URL(body.url);

  const existingScan = await getLatestScanByUrl(url);

  // For simplicity, we create a new scan every time.
  // The original had logic to return a recent scan.
  if (existingScan && !body.rescan) {
      ctx.response.body = existingScan;
      return;
  }

  const newScan = await createScan(url);
  ctx.response.status = 202; // Accepted
  ctx.response.body = newScan;
});

// Endpoint to get scan results by URL
router.get("/scans/by-url", async (ctx: Context) => {
    const { url } = helpers.getQuery(ctx, { mergeParams: true });
    const scan = await getLatestScanByUrl(new URL(url));
    if (scan) {
        ctx.response.body = scan;
    } else {
        ctx.response.status = 404;
        ctx.response.body = { error: "Scan not found" };
    }
});

// Endpoint to get package info
router.get("/packages/:name", async (ctx: Context) => {
    const { name } = helpers.getQuery(ctx, { mergeParams: true });
    const pkgInfo = await getPackageInfo(name);

    if (pkgInfo) {
        ctx.response.body = pkgInfo;
    } else {
        ctx.response.status = 404;
        ctx.response.body = { error: "Package not found" };
    }
});

// Simple search endpoint
router.get("/search", async (ctx: Context) => {
  const { q } = helpers.getQuery(ctx);

  if (!q || typeof q !== 'string' || q.trim().length < 2) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Search query 'q' must be at least 2 characters long." };
    return;
  }

  try {
    const results = await searchEntities(q.trim());
    ctx.response.body = results;
  } catch (error) {
    console.error("Search endpoint error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "An error occurred during the search." };
  }
});


export default router;