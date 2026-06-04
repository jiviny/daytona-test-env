import { resetDemoData } from "@/lib/db.mjs";
import { seed } from "@/lib/seed.mjs";
import { errorMessage } from "@/lib/util.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Resets the demo to its seeded baseline (Acme Logistics on Starter) so a reviewer can
// re-run the upgrade flow from scratch.
export async function POST() {
  try {
    await seed();
    await resetDemoData();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: errorMessage(error) }, { status: 503 });
  }
}
