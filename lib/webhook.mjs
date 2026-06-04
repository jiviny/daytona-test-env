// FAKE-but-realistic webhook signing. This demonstrates the signature-validation flow a
// real billing provider (Stripe/GitHub-style) requires, using HMAC-SHA256 over the raw
// request body. The secret in config is intentionally fake and documented as such.

import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.mjs";

export function signPayload(rawBody, secret = config.webhookSecret) {
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  return `sha256=${digest}`;
}

export function verifySignature(rawBody, signature, secret = config.webhookSecret) {
  if (typeof signature !== "string" || signature.length === 0) return false;
  const expected = signPayload(rawBody, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function sampleBillingEvent() {
  return {
    type: "invoice.paid",
    customer: "acme-logistics",
    amount: 49900,
    currency: "usd",
  };
}
