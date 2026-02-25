import { NextResponse } from "next/server";
import { getSessionUsageSummary } from "@/lib/usage/session-usage-store";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing session id" }, { status: 400 });
  }
  const summary = getSessionUsageSummary(id);
  return NextResponse.json(summary);
}
