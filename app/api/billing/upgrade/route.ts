import { createUpgrade } from "@/lib/db.mjs";
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

  try {
    const job = await createUpgrade(toPlan);
    await enqueueProvisioning(job);
    return Response.json({
      ok: true,
      jobId: job.jobId,
      fromPlan: job.fromPlan,
      toPlan: job.toPlan,
      priority: job.priority,
    });
  } catch (error) {
    return Response.json({ ok: false, error: errorMessage(error) }, { status: 503 });
  }
}
