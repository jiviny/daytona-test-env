import { getState } from "@/lib/db.mjs";
import { gatherHealth } from "@/lib/health.mjs";
import { config } from "@/lib/config.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMPTY_STATE = {
  customer: null,
  subscription: null,
  jobs: [],
  events: [],
  emails: [],
  webhooks: [],
};

// Full snapshot consumed by the dashboard. Degrades gracefully: if the database is not
// up yet, it still returns 200 with empty collections and whatever health is available,
// so the UI can render a "connecting" state instead of crashing.
export async function GET() {
  const [stateResult, healthResult] = await Promise.allSettled([getState(), gatherHealth()]);
  const state = stateResult.status === "fulfilled" ? stateResult.value : EMPTY_STATE;
  const health = healthResult.status === "fulfilled" ? healthResult.value : null;

  return Response.json({
    preview: config.preview,
    pr: config.pr,
    sha: config.sha,
    repository: config.repository,
    headRef: config.headRef,
    ...state,
    health,
  });
}
