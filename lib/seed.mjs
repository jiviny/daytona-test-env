// Deterministic seed for the Billing Operations Preview.
//
// Every preview shows reviewers the same starting point: Acme Logistics on the Starter
// plan, wanting Pro. Idempotent — safe to run repeatedly (e.g. on every preview boot).

import { query, ensureSchema } from "./db.mjs";
import { SEED } from "./config.mjs";

export async function seed() {
  await ensureSchema();

  await query(
    `INSERT INTO customers (id, name, contact_email)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, contact_email = EXCLUDED.contact_email`,
    [SEED.customerId, SEED.customerName, SEED.contactEmail],
  );

  // Only create the subscription if it does not exist, so re-seeding never clobbers an
  // in-progress demo. Use POST /api/demo/reset to deliberately return to baseline.
  const existing = await query(
    "SELECT customer_id FROM subscriptions WHERE customer_id = $1",
    [SEED.customerId],
  );
  if (existing.rows.length === 0) {
    await query(
      `INSERT INTO subscriptions (customer_id, plan, requested_plan, status)
       VALUES ($1, $2, $3, 'active')`,
      [SEED.customerId, SEED.startingPlan, SEED.targetPlan],
    );
    await query(
      `INSERT INTO audit_events (kind, message, customer_id) VALUES ($1, $2, $3)`,
      ["seed", `Seeded ${SEED.customerName} on the ${SEED.startingPlan} plan`, SEED.customerId],
    );
  }

  return { customer: SEED.customerName, plan: SEED.startingPlan };
}
