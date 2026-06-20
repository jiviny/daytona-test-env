// End-to-end full-stack verification (acceptance criterion #2).
//
// Brings up real Postgres + Redis (via docker compose unless DATABASE_URL is provided),
// starts the worker and a production Next.js server, then drives the whole reviewed
// workflow over HTTP and asserts the observable behavior:
//   reset -> starts on Starter -> upgrade -> worker provisions Pro -> email captured ->
//   webhook replay verified -> invalid signature rejected -> all services healthy.
//
// Env knobs: VERIFY_PORT (default 3939), DATABASE_URL/REDIS_URL (skip docker if set),
// SKIP_DOCKER=1, KEEP_SERVICES=1 (leave docker services running for debugging).

import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const PORT = Number(process.env.VERIFY_PORT || 3939);
const BASE = `http://127.0.0.1:${PORT}`;
// Dedicated host ports + project name so the verifier never collides with a local
// Postgres/Redis or with `npm run preview:local`.
const PG_HOST_PORT = process.env.PG_HOST_PORT || "55432";
const REDIS_HOST_PORT = process.env.REDIS_HOST_PORT || "56379";
const COMPOSE = "docker compose -p billing-verify -f docker-compose.preview.yml";
const useDocker = !process.env.DATABASE_URL && process.env.SKIP_DOCKER !== "1";
// Quote the node path for shell invocation (Windows path contains a space).
const NODE = `"${process.execPath}"`;

const env = {
  ...process.env,
  PORT: String(PORT),
  PG_HOST_PORT,
  REDIS_HOST_PORT,
  DATABASE_URL:
    process.env.DATABASE_URL || `postgres://billing:billing@127.0.0.1:${PG_HOST_PORT}/billing_preview`,
  REDIS_URL: process.env.REDIS_URL || `redis://127.0.0.1:${REDIS_HOST_PORT}`,
};

const children = [];
let failures = 0;

function run(cmd, options = {}) {
  console.log(`[verify] $ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env, ...options });
}

function tryRun(cmd) {
  try {
    run(cmd);
  } catch (error) {
    console.log(`[verify] (non-fatal) ${cmd}: ${error instanceof Error ? error.message : error}`);
  }
}

function startChild(name, args) {
  const child = spawn(process.execPath, args, { stdio: "inherit", env });
  child.on("exit", (code, signal) => {
    console.log(`[verify] ${name} exited (code=${code} signal=${signal})`);
  });
  children.push(child);
  return child;
}

function assert(condition, message) {
  if (condition) {
    console.log(`[verify] PASS: ${message}`);
  } else {
    failures += 1;
    console.error(`[verify] FAIL: ${message}`);
  }
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  return res.json();
}

async function postJson(path, body, headers) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function waitForReady(timeoutMs = 150000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/ready`, { cache: "no-store" });
      if (res.status === 200) return;
    } catch {
      /* server not up yet */
    }
    await delay(1500);
  }
  throw new Error("/api/ready did not return 200 before timeout");
}

async function waitForState(predicate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await getJson("/api/state");
    if (predicate(last)) return last;
    await delay(1000);
  }
  return last;
}

async function main() {
  if (useDocker) {
    // --wait blocks until the postgres/redis healthchecks pass, so migrations don't race
    // the database coming up.
    run(`${COMPOSE} up -d --wait postgres redis`);
  }

  if (!existsSync(".next/BUILD_ID")) {
    run(`${NODE} node_modules/next/dist/bin/next build`);
  }

  run(`${NODE} scripts/db-migrate.mjs`);
  run(`${NODE} scripts/db-seed.mjs`);

  startChild("worker", ["worker/index.mjs"]);
  startChild("next", ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(PORT)]);

  console.log("[verify] waiting for /api/ready (all services healthy)…");
  await waitForReady();

  // Baseline.
  await postJson("/api/demo/reset");
  let state = await getJson("/api/state");
  assert(state.subscription?.plan === "Starter", "subscription starts on Starter");
  assert(state.customer?.name === "Acme Logistics", "seeded customer is Acme Logistics");

  // Upgrade -> worker provisions.
  const upgrade = await postJson("/api/billing/upgrade", { plan: "Pro" });
  assert(upgrade.ok && upgrade.data.ok, "upgrade accepted and job enqueued");

  state = await waitForState(
    (s) => s.subscription?.status === "provisioned" && s.subscription?.plan === "Pro",
    40000,
  );
  assert(state.subscription?.plan === "Pro", "worker provisioned the Pro plan");
  assert(state.subscription?.status === "provisioned", "subscription status is provisioned");
  assert(state.subscription?.priority_provisioning === true, "Pro plan got priority provisioning");
  assert(state.jobs?.[0]?.status === "completed", "provisioning job completed");
  assert(state.emails?.length >= 1, "a confirmation email was captured");

  // Idempotency: a second upgrade to the already-provisioned plan is a benign no-op.
  const emailsAfterUpgrade = state.emails?.length ?? 0;
  const dup = await postJson("/api/billing/upgrade", { plan: "Pro" });
  assert(dup.ok === true && dup.data.skipped === true, "duplicate upgrade is a no-op (skipped)");
  const afterDup = await getJson("/api/state");
  assert(
    (afterDup.emails?.length ?? 0) === emailsAfterUpgrade,
    "duplicate upgrade did not send a second confirmation email",
  );

  // Provisioning auto-emits a subscription.activated billing webhook.
  const afterProvision = await getJson("/api/state");
  assert(
    (afterProvision.webhooks || []).some((w) => w.event_type === "subscription.activated"),
    "provisioning auto-emitted a subscription.activated webhook",
  );

  // Webhook replay (valid signature path).
  const replay = await postJson("/api/webhooks/billing/replay");
  assert(replay.ok && replay.data.ok, "billing webhook replayed successfully");
  state = await waitForState((s) => (s.webhooks?.length ?? 0) >= 1, 10000);
  assert(state.webhooks?.[0]?.signature_valid === true, "replayed webhook signature verified");

  // Invalid signature rejected.
  const bad = await postJson(
    "/api/webhooks/billing",
    { type: "invoice.paid", customer: "acme-logistics" },
    { "x-demo-signature": "sha256=deadbeef" },
  );
  assert(bad.status === 401, "invalid webhook signature rejected with 401");

  // Health.
  const health = await getJson("/api/health");
  const services = health.services || {};
  assert(
    ["web", "database", "queue", "worker", "email", "webhook"].every((s) => services[s] === "ok"),
    "all six services report healthy",
  );
  assert(health.ready === true, "health reports ready");
}

try {
  await main();
} catch (error) {
  failures += 1;
  console.error("[verify] error:", error instanceof Error ? error.message : error);
} finally {
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
  await delay(800);
  if (useDocker && process.env.KEEP_SERVICES !== "1") {
    tryRun(`${COMPOSE} down -v`);
  }
}

if (failures > 0) {
  console.error(`\n[verify] verify:fullstack FAILED (${failures} assertion(s))`);
  process.exit(1);
} else {
  console.log("\n[verify] verify:fullstack PASSED");
  process.exit(0);
}
