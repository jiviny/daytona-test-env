// Redis-backed provisioning queue (BullMQ). Connections are created lazily so importing
// this module never opens a socket at build time.

import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "./config.mjs";

// BullMQ requires maxRetriesPerRequest: null on its blocking connections.
export function makeWorkerConnection() {
  return new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
}

let queue;
let queueConnection;

function getQueueConnection() {
  if (!queueConnection) {
    queueConnection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
    queueConnection.on("error", () => {});
  }
  return queueConnection;
}

export function getQueue() {
  if (!queue) {
    queue = new Queue(config.queueName, { connection: getQueueConnection() });
  }
  return queue;
}

export async function enqueueProvisioning(data) {
  const job = await getQueue().add("provision", data, {
    jobId: data.jobId,
    removeOnComplete: 50,
    removeOnFail: 50,
  });
  return job.id;
}

// Dedicated connection for health probes. Bounded retry so it recovers automatically
// when Redis comes up, but offline-queue disabled so a probe fails fast when it is down.
let healthRedis;
function getHealthRedis() {
  if (!healthRedis) {
    healthRedis = new IORedis(config.redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    healthRedis.on("error", () => {});
  }
  return healthRedis;
}

export async function queueHealth() {
  await getHealthRedis().ping();
  return getQueue().getJobCounts("waiting", "active", "completed", "failed");
}

export async function closeQueue() {
  const closers = [];
  if (queue) {
    closers.push(queue.close());
    queue = undefined;
  }
  if (queueConnection) {
    closers.push(queueConnection.quit());
    queueConnection = undefined;
  }
  if (healthRedis) {
    closers.push(healthRedis.quit());
    healthRedis = undefined;
  }
  await Promise.allSettled(closers);
}
