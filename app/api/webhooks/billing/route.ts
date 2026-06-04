import { verifySignature } from "@/lib/webhook.mjs";
import { addWebhookEvent, addAudit } from "@/lib/db.mjs";
import { errorMessage } from "@/lib/util.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Billing webhook receiver. Validates a FAKE HMAC-SHA256 "x-demo-signature" over the raw
// body, then persists the event. Invalid signatures are rejected with 401.
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-demo-signature");

  if (!verifySignature(raw, signature)) {
    return Response.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "invalid json body" }, { status: 400 });
  }

  const eventType = typeof payload.type === "string" ? payload.type : "unknown";
  const customerId = typeof payload.customer === "string" ? payload.customer : null;
  const source = request.headers.get("x-demo-source") === "replay" ? "replay" : "external";

  try {
    const event = await addWebhookEvent({
      eventType,
      customerId,
      payload,
      signatureValid: true,
      source,
    });
    await addAudit("webhook", `Billing webhook received: ${eventType} (${source})`);
    return Response.json({ ok: true, id: event.id, eventType });
  } catch (error) {
    console.error("[webhook] persist failed:", errorMessage(error));
    return Response.json({ ok: false, error: "Could not record webhook event." }, { status: 503 });
  }
}
