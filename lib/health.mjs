// Aggregates live service health by actually probing each dependency (a query, a Redis
// ping, a worker-heartbeat freshness check) rather than assuming "it started, so it's up".

import { ping as dbPing, getHeartbeat, query } from "./db.mjs";
import { queueHealth } from "./queue.mjs";
import { config } from "./config.mjs";

async function probe(fn) {
  try {
    await fn();
    return "ok";
  } catch {
    return "down";
  }
}

export async function gatherHealth() {
  const database = await probe(() => dbPing());
  const queue = await probe(() => queueHealth());

  let worker = "down";
  if (database === "ok") {
    try {
      const beatAt = await getHeartbeat("worker");
      if (beatAt) {
        const ageMs = Date.now() - new Date(beatAt).getTime();
        worker = ageMs <= config.heartbeatStaleSeconds * 1000 ? "ok" : "down";
      }
    } catch {
      worker = "down";
    }
  }

  // Email capture and the webhook receiver are app capabilities backed by Postgres.
  const email = database === "ok" ? await probe(() => query("SELECT 1 FROM emails LIMIT 1")) : "down";
  const webhook =
    database === "ok" ? await probe(() => query("SELECT 1 FROM webhook_events LIMIT 1")) : "down";

  const services = { web: "ok", database, queue, worker, email, webhook };
  const ready = Object.values(services).every((status) => status === "ok");

  return {
    ok: true,
    preview: config.preview,
    pr: config.pr,
    sha: config.sha,
    ready,
    services,
  };
}
