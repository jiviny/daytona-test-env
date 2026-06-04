import { gatherHealth } from "@/lib/health.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Always returns HTTP 200 with a per-service status map. This is the lenient health
// report used by smoke tests. The strict readiness gate lives at /api/ready.
export async function GET() {
  try {
    return Response.json(await gatherHealth());
  } catch {
    return Response.json({
      ok: true,
      preview: process.env.DAYTONA_PREVIEW === "true",
      pr: process.env.GITHUB_PR_NUMBER ?? null,
      sha: process.env.GITHUB_SHA ?? null,
      ready: false,
      services: {
        web: "ok",
        database: "down",
        queue: "down",
        worker: "down",
        email: "down",
        webhook: "down",
      },
    });
  }
}
