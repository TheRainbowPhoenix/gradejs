import { Router, Context, helpers } from "./deps.ts";
import { createScan, getLatestScanByUrl, getPackageInfo } from "./db/index.ts";

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
    // A real implementation would require more complex querying
    // of the KV store, which can be slow without proper indexing.
    ctx.response.body = {
        message: "Search not fully implemented. Deno KV requires careful index design for efficient searching."
    };
});

export default router;