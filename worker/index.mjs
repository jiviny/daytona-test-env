// Standalone provisioning worker. Started as its own process by
// scripts/start-fullstack-preview.mjs (and `npm run worker` locally).

import { Worker } from "bullmq";
import { processProvisioningJob, startHeartbeat } from "../lib/worker-core.mjs";
import { makeWorkerConnection } from "../lib/queue.mjs";
import { ensureSchema } from "../lib/db.mjs";
import { config } from "../lib/config.mjs";

async function main() {
  // Best-effort: the start script already migrates, but make the worker self-sufficient.
  await ensureSchema().catch(() => {});

  const stopHeartbeat = startHeartbeat("worker");

  const worker = new Worker(config.queueName, processProvisioningJob, {
    connection: makeWorkerConnection(),
    concurrency: 2,
  });

  worker.on("completed", (job) => console.log(`[worker] job ${job.id} completed`));
  worker.on("failed", (job, err) =>
    console.error(`[worker] job ${job?.id ?? "?"} failed: ${err?.message ?? err}`),
  );
  worker.on("error", (err) => console.error(`[worker] error: ${err?.message ?? err}`));

  console.log(`[worker] listening on queue "${config.queueName}" (redis ${config.redisUrl})`);

  const shutdown = async () => {
    stopHeartbeat();
    try {
      await worker.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
