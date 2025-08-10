const dbType = Deno.env.get("DB_TYPE") || "sqlite";

// Re-export all functions from the selected database module.
let dbModule;
switch(dbType) {
    case 'sqlite':
        console.log("Using SQLite database backend.");
        dbModule = await import('./sqlite.ts');
        break;
    case 'postgres':
        console.log("Using PostgreSQL database backend.");
        dbModule = await import('./postgres.ts');
        break;
    // case 'kv':
    //     console.log("Using Deno KV database backend (placeholder).");
    //     dbModule = await import('./kv.ts');
    //     break;
    default:
        throw new Error(`Unsupported DB_TYPE: ${dbType}. Use 'sqlite', 'postgres', or 'kv'.`);
}

export const {
    findOrCreateHostname,
    findOrCreateWebPage,
    createScan,
    getScanById,
    getLatestScanByUrl,
    updateScanResult,
    getPackageInfo,
    upsertPackageMetadata,
    upsertVulnerability,
    enqueueTask,
    dequeueTask,
    completeTask,
    failTask,
    searchEntities,
} = dbModule;