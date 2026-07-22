/**
 * Applies prisma/rls.sql without needing psql on PATH.
 *
 *   pnpm db:rls
 *
 * The original script was `psql "$DIRECT_URL" -f prisma/rls.sql`, which assumes
 * a Postgres client install and a POSIX shell — neither of which holds on a
 * stock Windows machine, where "$DIRECT_URL" is passed through as a literal.
 * This runs the same file through the connection Prisma already has.
 *
 * Every statement in rls.sql is written to be re-runnable (create or replace,
 * drop policy if exists), so applying it twice is safe.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadEnvFile } from "./lib/env-file";
import { splitSqlStatements } from "./lib/sql-split";

loadEnvFile();

// Prefer the direct connection: DDL through pgbouncer in transaction mode
// fails on anything that needs a session, and rls.sql creates extensions.
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!url) {
  console.error("\n  DIRECT_URL (or DATABASE_URL) is not set. Fill in .env.local first.\n");
  process.exit(1);
}

if (!process.env.DIRECT_URL) {
  console.warn("  DIRECT_URL is not set — falling back to DATABASE_URL.");
  console.warn("  If that is the pooled (port 6543) URL, creating extensions may fail.\n");
}

const prisma = new PrismaClient({ datasources: { db: { url } }, log: ["warn", "error"] });

async function main() {
  const path = resolve(process.cwd(), "prisma/rls.sql");
  const sql = readFileSync(path, "utf8");
  const statements = splitSqlStatements(sql);

  console.log(`\n  Applying ${statements.length} statements from prisma/rls.sql\n`);

  let applied = 0;
  const failures: { statement: string; message: string }[] = [];

  for (const [index, statement] of statements.entries()) {
    const preview = statement.replace(/\s+/g, " ").slice(0, 68);
    try {
      await prisma.$executeRawUnsafe(statement);
      applied++;
      console.log(`  ${String(index + 1).padStart(3)}  ok    ${preview}`);
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n")[0] ?? "" : String(error);
      failures.push({ statement: preview, message });
      console.log(`  ${String(index + 1).padStart(3)}  FAIL  ${preview}`);
      console.log(`       ${message}`);
    }
  }

  console.log(`\n  ${applied}/${statements.length} applied.`);

  if (failures.length > 0) {
    console.error("\n  Some statements failed. Common causes:");
    console.error("    - The tables do not exist yet. Run the migration first.");
    console.error("    - The role lacks rights to create extensions. Run this from the Supabase SQL editor instead.");
    console.error("    - You are connected through the pooler. Use DIRECT_URL (port 5432).\n");
    process.exit(1);
  }

  console.log("  Row level security, indexes and the signup trigger are in place.\n");
}

main()
  .catch((error) => {
    console.error("\n  Could not apply rls.sql:", error instanceof Error ? error.message : error, "\n");
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
