import { Database } from "@db/sqlite";
import { default as postgres } from "postgres";

export function runSqliteMigration() {
  try {
    const db = new Database(Deno.env.get("SQLITE_PATH") || "./gradejs.db");
    const schemaSql = Deno.readTextFileSync(new URL("./001_initial_schema_sqlite.sql", import.meta.url));
    db.exec(schemaSql);
    db.close();
    console.log("SQLite migration completed successfully.");
  } catch (error) {
    console.error("Error during SQLite migration:", error);
    throw error; // Re-throw to be caught by the startup script
  }
}

export async function runPostgresMigration() {
  const dbUrl = Deno.env.get("DATABASE_URL");
  if (!dbUrl) {
      throw new Error("DATABASE_URL is required for PostgreSQL migrations.");
  }
  const sql = postgres(dbUrl, { max: 1 });
  try {
    const schemaSql = Deno.readTextFileSync(new URL("./001_initial_schema_postgres.sql", import.meta.url));
    await sql.unsafe(schemaSql);
    console.log("PostgreSQL migration completed successfully.");
  } catch(error) {
    console.error("Error during PostgreSQL migration:", error);
    throw error;
  } finally {
    await sql.end();
  }
}

// This logic allows running the script directly via `deno task db-migrate`
if (import.meta.main) {
    const dbType = Deno.env.get("DB_TYPE") || "sqlite";
    console.log(`Manually running migrations for database type: ${dbType}`);
    if (dbType === 'sqlite') {
        runSqliteMigration();
    } else if (dbType === 'postgres') {
        await runPostgresMigration();
    } else {
        console.error(`Unsupported DB_TYPE: ${dbType}`);
        Deno.exit(1);
    }
}