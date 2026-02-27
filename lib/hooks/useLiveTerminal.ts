"use client";

import { useState, useRef, useCallback } from "react";

export interface TerminalLine {
  type: "stdout" | "stderr" | "system";
  text: string;
  timestamp: number;
}

export interface LiveTerminalState {
  output: TerminalLine[];
  isRunning: boolean;
  exitCode: number | null;
  command: string;
  durationMs: number | null;
}

export function useLiveTerminal() {
  const [state, setState] = useState<LiveTerminalState>({
    output: [],
    isRunning: false,
    exitCode: null,
    command: "",
    durationMs: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (command: string, workspacePath: string) => {
    // Abort any existing session
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      output: [
        { type: "system", text: `$ ${command}`, timestamp: Date.now() },
      ],
      isRunning: true,
      exitCode: null,
      command,
      durationMs: null,
    });

    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, workspacePath }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setState((prev) => ({
          ...prev,
          isRunning: false,
          exitCode: 1,
          output: [
            ...prev.output,
            {
              type: "system",
              text: `Failed to connect: ${res.status} ${res.statusText}`,
              timestamp: Date.now(),
            },
          ],
        }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        // Keep the last incomplete line in buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;

          try {
            const event = JSON.parse(json) as {
              type: "stdout" | "stderr" | "exit";
              text?: string;
              code?: number;
              duration?: number;
            };

            if (event.type === "stdout" || event.type === "stderr") {
              setState((prev) => ({
                ...prev,
                output: [
                  ...prev.output,
                  {
                    type: event.type as "stdout" | "stderr",
                    text: event.text ?? "",
                    timestamp: Date.now(),
                  },
                ],
              }));
            } else if (event.type === "exit") {
              setState((prev) => ({
                ...prev,
                isRunning: false,
                exitCode: event.code ?? 0,
                durationMs: event.duration ?? null,
                output: [
                  ...prev.output,
                  {
                    type: "system",
                    text: `Process exited with code ${event.code ?? 0}`,
                    timestamp: Date.now(),
                  },
                ],
              }));
            }
          } catch {
            // Skip malformed SSE events
          }
        }
      }

      // If stream ended without an exit event, mark as done
      setState((prev) => {
        if (prev.isRunning) {
          return {
            ...prev,
            isRunning: false,
            exitCode: prev.exitCode ?? 0,
            output: [
              ...prev.output,
              {
                type: "system",
                text: "Stream ended",
                timestamp: Date.now(),
              },
            ],
          };
        }
        return prev;
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setState((prev) => ({
          ...prev,
          isRunning: false,
          exitCode: 130,
          output: [
            ...prev.output,
            { type: "system", text: "Aborted", timestamp: Date.now() },
          ],
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        isRunning: false,
        exitCode: 1,
        output: [
          ...prev.output,
          {
            type: "system",
            text: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
            timestamp: Date.now(),
          },
        ],
      }));
    }
  }, []);

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  return { ...state, run, stop };
}
