import { NextResponse } from "next/server";
import {
  isMemoryEnabled,
  getMemories,
  searchMemoryFacts,
  getMinnsClient,
} from "@/lib/memory";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const enabled = await isMemoryEnabled();
  if (!enabled) {
    return NextResponse.json({ enabled: false, memories: [], stats: null });
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");
  const limit = parseInt(searchParams.get("limit") ?? "10", 10);

  if (query) {
    const claims = await searchMemoryFacts(query);
    return NextResponse.json({ enabled: true, claims });
  }

  const memories = await getMemories(1, limit);

  let stats = null;
  try {
    const client = await getMinnsClient();
    if (client) {
      stats = await client.getStats();
    }
  } catch {
    // stats unavailable
  }

  return NextResponse.json({ enabled: true, memories, stats });
}
