import { createUpgrade, cancelUpgrade } from "@/lib/db.mjs";
import { enqueueProvisioning } from "@/lib/queue.mjs";
import { SEED } from "@/lib/config.mjs";
import { errorMessage } from "@/lib/util.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPPORTED_PLANS = new Set(["Starter", "Pro"]);

// Records the upgrade in Postgres and enqueues a provisioning job in Redis.
export async function POST(request: Request) {
  let toPlan: string = SEED.targetPlan;
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && typeof (body as { plan?: unknown }).plan === "string") {
      toPlan = (body as { plan: string }).plan;
    }
  } catch {
    // No/invalid body: fall back to the seeded target plan (Pro).
  }

  if (!SUPPORTED_PLANS.has(toPlan)) {
    return Response.json({ ok: false, error: `unsupported plan: ${toPlan}` }, { status: 400 });
  }

  let job: {
    skipped?: boolean;
    reason?: string;
    jobId?: string;
    fromPlan?: string;
    toPlan?: string;
    priority?: boolean;
  };
  try {
    job = await createUpgrade(toPlan);
  } catch (error) {
    console.error("[upgrade] createUpgrade failed:", errorMessage(error));
    return Response.json({ ok: false, error: "Upgrade is temporarily unavailable." }, { status: 503 });
  }

  // Duplicate / already-on-plan: benign no-op so the demo stays clean.
  if (job.skipped) {
    return Response.json({ ok: true, skipped: true, message: job.reason });
  }

  try {
    await enqueueProvisioning(job);
  } catch (error) {
    console.error("[upgrade] enqueue failed:", errorMessage(error));
    await cancelUpgrade(job.jobId).catch(() => {});
    return Response.json(
      { ok: false, error: "Could not enqueue provisioning; the upgrade was reverted." },
      { status: 503 },
    );
  }

  return Response.json({
    ok: true,
    jobId: job.jobId,
    fromPlan: job.fromPlan,
    toPlan: job.toPlan,
    priority: job.priority,
  });
}
