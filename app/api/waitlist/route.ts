type WaitlistPayload = {
  email?: unknown;
  company?: unknown;
};

function isEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

export async function POST(request: Request) {
  let payload: WaitlistPayload;

  try {
    payload = (await request.json()) as WaitlistPayload;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isEmail(payload.email)) {
    return Response.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }

  return Response.json({
    ok: true,
    preview: process.env.DAYTONA_PREVIEW === "true",
    company: typeof payload.company === "string" ? payload.company.slice(0, 120) : null,
  });
}
