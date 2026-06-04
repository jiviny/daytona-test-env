// DAYTONA_PREVIEW_START_COMMAND entrypoint: brings up the entire full stack as a single
// foreground process the Daytona helper can background and later kill.
//
// In Daytona (DAYTONA_PREVIEW=true) it provisions real Postgres + Redis natively (the
// snapshot has no Docker), then runs migrations, seeds, starts the worker, and starts
// Next.js on 0.0.0.0:3000. Locally it assumes DATABASE_URL/REDIS_URL already point at
// running services (e.g. docker compose) and skips provisioning.

import { spawn, execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { ping, ensureSchema, closePool } from "../lib/db.mjs";
import { seed } from "../lib/seed.mjs";
import { queueHealth, closeQueue } from "../lib/queue.mjs";
import { config } from "../lib/config.mjs";

const PORT = config.port;
const shouldProvision =
  process.env.DAYTONA_PREVIEW === "true" || process.env.PROVISION_SERVICES === "1";
const PGDATA = process.env.PGDATA || "/tmp/billing-pgdata";

const children = [];
let shuttingDown = false;

function run(cmd) {
  console.log(`[preview] $ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

function tryRun(cmd) {
  try {
    run(cmd);
  } catch (error) {
    console.log(`[preview] (non-fatal) ${cmd}: ${error instanceof Error ? error.message : error}`);
  }
}

function findPgBin() {
  const base = "/usr/lib/postgresql";
  if (!existsSync(base)) return null;
  const versions = readdirSync(base)
    .filter((v) => existsSync(`${base}/${v}/bin/pg_ctl`))
    .sort((a, b) => Number(b) - Number(a));
  return versions.length ? `${base}/${versions[0]}/bin` : null;
}

function provisionServices() {
  const db = new URL(config.databaseUrl);
  const redis = new URL(config.redisUrl);
  const pgPort = db.port || "5432";
  const pgUser = decodeURIComponent(db.username || "daytona");
  const pgDb = db.pathname.replace(/^\//, "") || "billing_preview";
  const redisPort = redis.port || "6379";

  // Clean up any orphaned processes from a previous preview boot.
  tryRun("pkill -f 'next/dist/bin/next' || true");
  tryRun("pkill -f 'worker/index.mjs' || true");

  const pgbin = findPgBin();
  if (!pgbin) {
    console.warn("[preview] postgres binaries not found; relying on DATABASE_URL being reachable");
  } else {
    if (!existsSync(`${PGDATA}/PG_VERSION`)) {
      run(`${pgbin}/initdb -D ${PGDATA} -U ${pgUser} --auth=trust`);
    }
    tryRun(
      `${pgbin}/pg_ctl -D ${PGDATA} -o "-p ${pgPort} -k /tmp -c listen_addresses=127.0.0.1" -l /tmp/billing-pg.log -w start`,
    );
    tryRun(`${pgbin}/createdb -h 127.0.0.1 -p ${pgPort} -U ${pgUser} ${pgDb}`);
  }

  tryRun(`redis-server --daemonize yes --port ${redisPort} --save '' --appendonly no`);
}

async function waitForServices(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let dbReady = false;
  let redisReady = false;
  while (Date.now() < deadline) {
    if (!dbReady) {
      try {
        await ping();
        dbReady = true;
        console.log("[preview] postgres ready");
      } catch {
        /* retry */
      }
    }
    if (!redisReady) {
      try {
        await queueHealth();
        redisReady = true;
        console.log("[preview] redis ready");
      } catch {
        /* retry */
      }
    }
    if (dbReady && redisReady) return;
    await delay(1000);
  }
  throw new Error("postgres/redis did not become ready before timeout");
}

function startChild(name, command, args) {
  const child = spawn(command, args, { stdio: "inherit", env: process.env });
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(`[preview] ${name} exited early (code=${code} signal=${signal})`);
      void shutdown(typeof code === "number" ? code : 1);
    }
  });
  children.push(child);
  return child;
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
  if (shouldProvision) {
    const pgbin = findPgBin();
    if (pgbin) tryRun(`${pgbin}/pg_ctl -D ${PGDATA} stop -m fast`);
  }
  process.exit(code);
}

async function main() {
  if (shouldProvision) provisionServices();

  await waitForServices();

  console.log("[preview] running migrations + seed");
  await ensureSchema();
  await seed();
  // The parent no longer needs DB/Redis; the worker and Next each open their own.
  await closePool();
  await closeQueue();

  if (!existsSync(".next/BUILD_ID")) {
    console.log("[preview] no build found; building");
    run(`"${process.execPath}" node_modules/next/dist/bin/next build`);
  }

  console.log("[preview] starting worker");
  startChild("worker", process.execPath, ["worker/index.mjs"]);

  console.log(`[preview] starting Next.js on 0.0.0.0:${PORT}`);
  startChild("next", process.execPath, [
    "node_modules/next/dist/bin/next",
    "start",
    "-H",
    "0.0.0.0",
    "-p",
    String(PORT),
  ]);

  console.log("[preview] full stack is up");
}

process.on("SIGTERM", () => void shutdown(0));
process.on("SIGINT", () => void shutdown(0));

main().catch((error) => {
  console.error("[preview] fatal:", error);
  void shutdown(1);
});
