"use client";

import { useEffect, useRef } from "react";
import { useCatStore } from "@/lib/store/cat";

/**
 * Connects the cat avatar's mood to chat events.
 * Call this in ChatInterface to make the cat react to the conversation.
 */
export function useCatReactions(
  status: "ready" | "submitted" | "streaming" | "error",
  messageCount: number,
  hasError: boolean
) {
  const setMood = useCatStore((s) => s.setMood);
  const prevStatus = useRef(status);
  const prevCount = useRef(messageCount);

  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = status;
    const countDelta = messageCount - prevCount.current;
    prevCount.current = messageCount;

    if (hasError) {
      setMood("error", "Hiss! Something broke...");
      return;
    }

    if (status === "submitted" && was === "ready") {
      setMood("curious", "Ooh, what's this?");
    } else if (status === "streaming") {
      setMood("typing", "*tap tap tap*");
    } else if (status === "ready" && was === "streaming") {
      if (countDelta > 0) {
        setMood("happy", "Done! Purrrr 😸");
        setTimeout(() => setMood("idle"), 5000);
      }
    } else if (status === "ready" && was === "ready" && messageCount === 0) {
      setMood("idle");
    }
  }, [status, messageCount, hasError, setMood]);

  // Go to sleep after 2 minutes of inactivity
  useEffect(() => {
    const timer = setTimeout(() => {
      const current = useCatStore.getState().mood;
      if (current === "idle") {
        setMood("sleeping", "zzz...");
      }
    }, 120000);
    return () => clearTimeout(timer);
  }, [status, messageCount, setMood]);
}
