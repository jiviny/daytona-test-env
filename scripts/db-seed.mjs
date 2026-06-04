// Loads the deterministic Acme Logistics seed data.
import { seed } from "../lib/seed.mjs";
import { closePool } from "../lib/db.mjs";

try {
  const result = await seed();
  console.log("db:seed:", JSON.stringify(result));
} catch (error) {
  console.error("db:seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closePool();
}
