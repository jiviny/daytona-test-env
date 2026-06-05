import { gatherHealth } from "@/lib/health.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Strict readiness gate used by the Daytona DAYTONA_PREVIEW_READY_COMMAND. Returns 200
// only when every service is up; otherwise 503 so the preview URL is not posted until
// the full stack is actually usable.
export async function GET() {
  try {
    const health = await gatherHealth();
    return Response.json(health, { status: health.ready ? 200 : 503 });
  } catch {
    return Response.json({ ok: false, ready: false }, { status: 503 });
  }
}
