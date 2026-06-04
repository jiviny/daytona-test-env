import { signPayload, sampleBillingEvent } from "@/lib/webhook.mjs";
import { config } from "@/lib/config.mjs";
import { errorMessage } from "@/lib/util.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Signs a sample billing event and POSTs it to the real receiver over HTTP, exercising
// the full signature-validation path the "Replay billing webhook" button demonstrates.
export async function POST() {
  const payload = sampleBillingEvent();
  const raw = JSON.stringify(payload);
  const signature = signPayload(raw);
  const url = `http://127.0.0.1:${config.port}/api/webhooks/billing`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-demo-signature": signature,
        "x-demo-source": "replay",
      },
      body: raw,
      cache: "no-store",
    });
    const data: unknown = await res.json().catch(() => ({}));
    return Response.json({ ok: res.ok, replayed: res.ok, event: payload, receiver: data }, { status: res.status });
  } catch (error) {
    return Response.json({ ok: false, error: errorMessage(error) }, { status: 502 });
  }
}
