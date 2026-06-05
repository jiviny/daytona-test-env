import { resetDemoData } from "@/lib/db.mjs";
import { seed } from "@/lib/seed.mjs";
import { obliterateQueue } from "@/lib/queue.mjs";
import { errorMessage } from "@/lib/util.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Resets the demo to its seeded baseline (Acme Logistics on Starter) so a reviewer can
// re-run the upgrade flow from scratch. Drains the queue first so any in-flight job
// cannot complete against the reset state.
export async function POST() {
  try {
    await seed();
    await obliterateQueue();
    await resetDemoData();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[reset] failed:", errorMessage(error));
    return Response.json({ ok: false, error: "Reset is temporarily unavailable." }, { status: 503 });
  }
}
