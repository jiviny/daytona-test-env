// PostgreSQL data layer for the Billing Operations Preview.
//
// The pool is created lazily on first use so that importing this module never opens a
// connection at build time (Next.js statically analyzes route modules). Every public
// function is small and readable; the worker and the API routes share these exact
// functions so behavior cannot drift between them.

import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config, SEED, planProfile } from "./config.mjs";

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 12,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
    // Never let a background idle-client error crash the process.
    pool.on("error", () => {});
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}

const schemaPath = fileURLToPath(new URL("./schema.sql", import.meta.url));

// Idempotent: safe to run on every boot.
export async function ensureSchema() {
  const sql = readFileSync(schemaPath, "utf8");
  await query(sql);
}

export async function ping() {
  await query("SELECT 1");
  return true;
}

// --- Heartbeats -----------------------------------------------------------------

export async function beat(service) {
  await query(
    `INSERT INTO service_heartbeats (service, beat_at) VALUES ($1, now())
     ON CONFLICT (service) DO UPDATE SET beat_at = now()`,
    [service],
  );
}

export async function getHeartbeat(service) {
  const { rows } = await query(
    "SELECT beat_at FROM service_heartbeats WHERE service = $1",
    [service],
  );
  return rows[0]?.beat_at ?? null;
}

// --- Audit / email / webhook writers --------------------------------------------

export async function addAudit(kind, message, customerId = SEED.customerId) {
  const { rows } = await query(
    `INSERT INTO audit_events (kind, message, customer_id)
     VALUES ($1, $2, $3) RETURNING id, kind, message, created_at`,
    [kind, message, customerId],
  );
  return rows[0];
}

export async function addEmail(recipient, subject, body) {
  const { rows } = await query(
    `INSERT INTO emails (recipient, subject, body)
     VALUES ($1, $2, $3) RETURNING id, recipient, subject, body, created_at`,
    [recipient, subject, body],
  );
  return rows[0];
}

export async function addWebhookEvent({ eventType, customerId, payload, signatureValid, source }) {
  const { rows } = await query(
    `INSERT INTO webhook_events (event_type, customer_id, payload, signature_valid, source)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, event_type, customer_id, payload, signature_valid, source, created_at`,
    [eventType, customerId ?? null, JSON.stringify(payload), signatureValid, source],
  );
  return rows[0];
}

// --- Upgrade flow ---------------------------------------------------------------

export async function getSubscription() {
  const { rows } = await query(
    `SELECT customer_id, plan, requested_plan, status, priority_provisioning, updated_at
     FROM subscriptions WHERE customer_id = $1`,
    [SEED.customerId],
  );
  return rows[0] ?? null;
}

// Records the customer's intent to upgrade and creates a queued provisioning job.
// Returns the job so the caller can enqueue it on Redis. Runs in a transaction so the
// subscription change and the job row are always consistent.
export async function createUpgrade(toPlan) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const sub = await client.query(
      `SELECT plan, status FROM subscriptions WHERE customer_id = $1 FOR UPDATE`,
      [SEED.customerId],
    );
    if (sub.rows.length === 0) {
      throw new Error("no subscription to upgrade; seed the demo first");
    }
    const fromPlan = sub.rows[0].plan;
    const currentStatus = sub.rows[0].status;
    // Guard against duplicate/concurrent upgrades so the demo never produces a Pro->Pro
    // job or a second confirmation email.
    if (currentStatus === "provisioning") {
      await client.query("COMMIT");
      return { skipped: true, reason: "An upgrade is already in progress." };
    }
    if (fromPlan === toPlan) {
      await client.query("COMMIT");
      return { skipped: true, reason: `Already on the ${toPlan} plan.` };
    }
    const priority = planProfile(toPlan).priorityProvisioning;
    const jobId = `prov_${SEED.customerId}_${Date.now()}`;

    await client.query(
      `UPDATE subscriptions
       SET requested_plan = $2, status = 'provisioning', updated_at = now()
       WHERE customer_id = $1`,
      [SEED.customerId, toPlan],
    );
    await client.query(
      `INSERT INTO provisioning_jobs (id, customer_id, from_plan, to_plan, status, priority)
       VALUES ($1, $2, $3, $4, 'queued', $5)`,
      [jobId, SEED.customerId, fromPlan, toPlan, priority],
    );
    await client.query(
      `INSERT INTO audit_events (kind, message, customer_id) VALUES ($1, $2, $3)`,
      ["upgrade", `Subscription change recorded: ${fromPlan} -> ${toPlan}`, SEED.customerId],
    );
    await client.query(
      `INSERT INTO audit_events (kind, message, customer_id) VALUES ($1, $2, $3)`,
      ["queue", `Provisioning job ${jobId} enqueued`, SEED.customerId],
    );
    await client.query("COMMIT");
    return { jobId, fromPlan, toPlan, priority };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getJob(jobId) {
  const { rows } = await query(
    `SELECT id, customer_id, from_plan, to_plan, status, priority, created_at, updated_at
     FROM provisioning_jobs WHERE id = $1`,
    [jobId],
  );
  return rows[0] ?? null;
}

export async function setJobStatus(jobId, status) {
  await query(
    `UPDATE provisioning_jobs SET status = $2, updated_at = now() WHERE id = $1`,
    [jobId, status],
  );
}

// Applies the upgrade to the subscription once the worker has "provisioned" it.
// Conditional on the upgrade still being the current intent (status='provisioning' and
// requested_plan still matches). Returns false if the job was superseded (e.g. the demo
// was reset mid-flight), so a stale worker can never bounce the subscription back to Pro.
export async function applyProvisionedPlan(toPlan, priority) {
  const res = await query(
    `UPDATE subscriptions
     SET plan = $2, requested_plan = NULL, status = 'provisioned',
         priority_provisioning = $3, updated_at = now()
     WHERE customer_id = $1 AND status = 'provisioning' AND requested_plan = $2`,
    [SEED.customerId, toPlan, priority],
  );
  return (res.rowCount ?? 0) > 0;
}

// Reverts a queued upgrade when the provisioning job could not be enqueued, so the
// subscription never gets stuck in 'provisioning' with no job to advance it.
export async function cancelUpgrade(jobId) {
  await query(`UPDATE provisioning_jobs SET status = 'failed', updated_at = now() WHERE id = $1`, [
    jobId,
  ]);
  await query(
    `UPDATE subscriptions SET status = 'active', requested_plan = NULL, updated_at = now()
     WHERE customer_id = $1 AND status = 'provisioning'`,
    [SEED.customerId],
  );
  await addAudit("error", `Provisioning job ${jobId} could not be enqueued; reverted`);
}

// --- Reads for the UI -----------------------------------------------------------

export async function listEvents(limit = 50) {
  const { rows } = await query(
    `SELECT id, kind, message, created_at FROM audit_events
     ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function listEmails(limit = 20) {
  const { rows } = await query(
    `SELECT id, recipient, subject, body, created_at FROM emails
     ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function listWebhooks(limit = 20) {
  const { rows } = await query(
    `SELECT id, event_type, customer_id, payload, signature_valid, source, created_at
     FROM webhook_events ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function listJobs(limit = 10) {
  const { rows } = await query(
    `SELECT id, customer_id, from_plan, to_plan, status, priority, created_at, updated_at
     FROM provisioning_jobs ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function getCustomer() {
  const { rows } = await query(
    `SELECT id, name, contact_email, created_at FROM customers WHERE id = $1`,
    [SEED.customerId],
  );
  return rows[0] ?? null;
}

// Aggregate snapshot consumed by /api/state and the UI.
export async function getState() {
  const [customer, subscription, jobs, events, emails, webhooks] = await Promise.all([
    getCustomer(),
    getSubscription(),
    listJobs(),
    listEvents(),
    listEmails(),
    listWebhooks(),
  ]);
  return { customer, subscription, jobs, events, emails, webhooks };
}

// Clears all dynamic activity and returns the subscription to its seeded baseline so a
// reviewer can re-run the demo from scratch. Idempotent.
export async function resetDemoData() {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM audit_events");
    await client.query("DELETE FROM emails");
    await client.query("DELETE FROM webhook_events");
    await client.query("DELETE FROM provisioning_jobs");
    await client.query(
      `UPDATE subscriptions
       SET plan = $2, requested_plan = $3, status = 'active',
           priority_provisioning = false, updated_at = now()
       WHERE customer_id = $1`,
      [SEED.customerId, SEED.startingPlan, SEED.targetPlan],
    );
    await client.query(
      `INSERT INTO audit_events (kind, message, customer_id) VALUES ($1, $2, $3)`,
      ["reset", "Demo data reset to seeded baseline", SEED.customerId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    const current = pool;
    pool = undefined;
    await current.end();
  }
}
