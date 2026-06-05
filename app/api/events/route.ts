import { listEvents } from "@/lib/db.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json({ events: await listEvents() });
  } catch {
    return Response.json({ events: [] });
  }
}
