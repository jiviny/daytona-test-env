// The provisioning job processor and the worker heartbeat. Shared by worker/index.mjs.
// Each step writes an audit event so the UI timeline tells the upgrade story in order.

import { setTimeout as delay } from "node:timers/promises";
import { setJobStatus, applyProvisionedPlan, addAudit, beat } from "./db.mjs";
import { captureUpgradeEmail } from "./email.mjs";

export async function processProvisioningJob(job) {
  const { jobId, toPlan, priority } = job.data;

  await setJobStatus(jobId, "active");
  await addAudit("worker", `Worker picked up provisioning job ${jobId}`);
  await delay(800);

  if (priority) {
    await addAudit("provision", `Priority provisioning enabled for the ${toPlan} plan`);
    await delay(400);
  }

  await addAudit("provision", `Provisioning ${toPlan} services`);
  await delay(800);

  const applied = await applyProvisionedPlan(toPlan, Boolean(priority));
  if (!applied) {
    // The upgrade is no longer the current intent (e.g. the demo was reset mid-flight).
    // Do not bounce the subscription or send a duplicate email.
    await addAudit("provision", `Provisioning job ${jobId} was superseded; no changes applied`);
    await setJobStatus(jobId, "cancelled");
    return { ok: false, superseded: true, jobId };
  }
  await addAudit("provision", `Subscription is now ${toPlan} (provisioned)`);

  const email = await captureUpgradeEmail({ toPlan, priority: Boolean(priority) });
  await addAudit("email", `Confirmation email sent to ${email.recipient}`);

  await setJobStatus(jobId, "completed");
  await addAudit("done", `Provisioning job ${jobId} completed`);

  return { ok: true, jobId };
}

// Periodically records a worker liveness signal so /api/health can tell the worker is
// actually running, not merely launched once.
export function startHeartbeat(service = "worker", intervalMs = 3000) {
  const tick = async () => {
    try {
      await beat(service);
    } catch {
      // Heartbeat best-effort; a transient DB blip should not crash the worker.
    }
  };
  void tick();
  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  return () => clearInterval(timer);
}
