// Central, preview-safe configuration for the full-stack Billing Operations Preview.
//
// Every value here is a preview default. Nothing in this file is a real production
// secret. The webhook secret below is intentionally fake and documented as such.

const DEFAULT_DATABASE_URL = "postgres://daytona@127.0.0.1:5432/billing_preview";
const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";
// FAKE signing secret used only to demonstrate webhook signature validation in the
// preview. This is NOT a real Stripe/GitHub secret and must never be used in production.
const DEFAULT_WEBHOOK_SECRET = "whsec_preview_demo_do_not_use_in_production";

export const config = {
  databaseUrl: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
  redisUrl: process.env.REDIS_URL || DEFAULT_REDIS_URL,
  webhookSecret: process.env.DEMO_WEBHOOK_SECRET || DEFAULT_WEBHOOK_SECRET,
  port: Number(process.env.PORT || 3000),

  // Queue + worker coordination.
  queueName: "provisioning",
  heartbeatKey: "billing:worker:heartbeat",
  heartbeatStaleSeconds: 15,

  // Preview metadata injected by the Daytona helper / GitHub Action.
  preview: process.env.DAYTONA_PREVIEW === "true",
  pr: process.env.GITHUB_PR_NUMBER || null,
  sha: process.env.GITHUB_SHA || null,
  repository: process.env.GITHUB_REPOSITORY || null,
  headRef: process.env.GITHUB_HEAD_REF || null,
};

// Deterministic seed identity. The whole demo revolves around this one organization so
// that every preview shows reviewers the exact same starting point.
export const SEED = {
  customerId: "acme-logistics",
  customerName: "Acme Logistics",
  contactEmail: "reviewer@example.com",
  startingPlan: "Starter",
  targetPlan: "Pro",
};

// Plan capabilities. Pro plans receive priority provisioning — this is the kind of
// real, data-backed behavior change a reviewer validates in a full-stack preview.
export function planProfile(plan) {
  if (plan === "Pro") {
    return { priorityProvisioning: true, seats: 50, sla: "priority" };
  }
  return { priorityProvisioning: false, seats: 5, sla: "standard" };
}
