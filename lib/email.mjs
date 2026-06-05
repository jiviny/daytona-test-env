// Preview-safe email capture. Outbound email is stored in Postgres and rendered in the
// UI. No real email is ever sent.

import { addEmail } from "./db.mjs";
import { SEED, planProfile } from "./config.mjs";

export function buildUpgradeEmail({ customerName, toPlan, priority }) {
  const features = planProfile(toPlan);
  const subject = `Your ${customerName} account is now on the ${toPlan} plan`;
  const body = [
    `Hi ${customerName} team,`,
    "",
    `Your upgrade to the ${toPlan} plan is complete.`,
    `Seats included: ${features.seats}. Support SLA: ${features.sla}.`,
    priority ? "Priority provisioning was applied to your account." : null,
    "",
    "This is a preview-only message captured inside the Daytona environment.",
    "No real email was delivered.",
  ]
    .filter((line) => line !== null)
    .join("\n");
  return { subject, body };
}

export async function captureUpgradeEmail({ toPlan, priority }) {
  const { subject, body } = buildUpgradeEmail({
    customerName: SEED.customerName,
    toPlan,
    priority,
  });
  return addEmail(SEED.contactEmail, subject, body);
}
