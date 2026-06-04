// Runs the (idempotent) schema migration against DATABASE_URL.
import { ensureSchema, closePool } from "../lib/db.mjs";

try {
  await ensureSchema();
  console.log("db:migrate: schema ensured");
} catch (error) {
  console.error("db:migrate failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closePool();
}
