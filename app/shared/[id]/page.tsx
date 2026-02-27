import * as fs from "node:fs/promises";
import * as path from "node:path";
import Link from "next/link";
import { SharedSessionView } from "@/components/chat/SharedSessionView";

export const dynamic = "force-dynamic";

const SHARED_DIR = path.join(process.cwd(), ".claw", "shared-sessions");

interface SharedSession {
  sessionId: string;
  messages: unknown[];
  sharedAt: number;
  updatedAt: number;
}

async function loadSharedSession(
  id: string
): Promise<SharedSession | null> {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const filePath = path.join(SHARED_DIR, `${safe}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default async function SharedSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await loadSharedSession(id);

  if (!session) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-base">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold text-text-primary">
            Session Not Found
          </h1>
          <p className="text-text-muted text-sm">
            This shared session doesn&apos;t exist or has been removed.
          </p>
          <Link
            href="/"
            className="inline-block text-sm text-accent-cyan hover:underline"
          >
            Go to OpenPaw
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-bg-base">
      {/* Minimal header */}
      <header className="h-14 shrink-0 flex items-center justify-between px-4 md:px-6 border-b border-white/6 bg-bg-base/80 backdrop-blur-lg">
        <Link href="/" className="flex items-center gap-2">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            className="shrink-0"
          >
            <ellipse
              cx="12"
              cy="18"
              rx="5"
              ry="3.5"
              fill="currentColor"
              className="text-accent-cyan opacity-90"
            />
            <circle
              cx="7.5"
              cy="10"
              r="2.2"
              fill="currentColor"
              className="text-accent-cyan"
            />
            <circle
              cx="12"
              cy="7"
              r="2.2"
              fill="currentColor"
              className="text-accent-cyan"
            />
            <circle
              cx="16.5"
              cy="10"
              r="2.2"
              fill="currentColor"
              className="text-accent-cyan"
            />
          </svg>
          <h1 className="text-lg font-bold gradient-text tracking-tight">
            OpenPaw
          </h1>
        </Link>
      </header>

      <main className="flex-1 overflow-hidden">
        <SharedSessionView
          sessionId={session.sessionId}
          initialMessages={session.messages as Parameters<typeof SharedSessionView>[0]["initialMessages"]}
          sharedAt={session.sharedAt}
          viewerCount={0}
        />
      </main>
    </div>
  );
}
