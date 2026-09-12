/**
 * Minns memory credentials, stored in .claw/minns-config.json.
 * GET /api/memory/config — reports whether memory is enabled, the credential source
 *   ("env" | "stored" | "none"), the masked key, and the project id
 * POST /api/memory/config — saves { apiKey, projectId }; apiKey is required
 * DELETE /api/memory/config — deletes the stored config file
 * MINNS_API_KEY / MINNS_PROJECT_ID take precedence over stored values.
 */

import { NextResponse } from "next/server";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isMemoryEnabled } from "@/lib/memory";

export const runtime = "nodejs";

const CONFIG_PATH = path.join(process.cwd(), ".claw", "minns-config.json");

export async function GET() {
  const enabled = await isMemoryEnabled();

  const envKey = process.env.MINNS_API_KEY;
  const envProject = process.env.MINNS_PROJECT_ID;

  let storedKey = "";
  let storedProject = "";
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    storedKey = parsed.apiKey ?? "";
    storedProject = parsed.projectId ?? "";
  } catch {
    // no stored config
  }

  return NextResponse.json({
    enabled,
    source: envKey ? "env" : storedKey ? "stored" : "none",
    hasApiKey: !!(envKey || storedKey),
    maskedKey: envKey
      ? `****${envKey.slice(-4)}`
      : storedKey
        ? `****${storedKey.slice(-4)}`
        : "",
    projectId: envProject || storedProject || "",
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { apiKey, projectId } = body as { apiKey?: string; projectId?: string };

  if (!apiKey) {
    return NextResponse.json({ error: "API key is required" }, { status: 400 });
  }

  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(
    CONFIG_PATH,
    JSON.stringify({ apiKey, projectId: projectId ?? "" }, null, 2),
    "utf-8"
  );

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  try {
    await fs.unlink(CONFIG_PATH);
  } catch {
    // already gone
  }
  return NextResponse.json({ success: true });
}
