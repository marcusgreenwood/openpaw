/**
 * Store for the cat avatar's mood and speech bubble.
 *
 * Not persisted — the cat resets to idle on reload. lib/hooks/useCatReactions.ts drives
 * this from chat status changes.
 */

"use client";

import { create } from "zustand";

/** The cat's current animation state. */
export type CatMood =
  | "idle"
  | "thinking"
  | "happy"
  | "excited"
  | "sleeping"
  | "curious"
  | "typing"
  | "error";

interface CatState {
  mood: CatMood;
  message: string;
  visible: boolean;
  setMood: (mood: CatMood, message?: string) => void;
  setVisible: (visible: boolean) => void;
}

/** Flavor text picked at random when entering `idle` without an explicit message. */
const IDLE_MESSAGES = [
  "Purring softly...",
  "Watching you type...",
  "Kneading the desk...",
  "*stretches*",
  "Flicks tail lazily...",
  "...",
];

/**
 * Cat avatar state.
 *
 * `setMood(mood, message?)` sets the mood and bubble text. With no `message`, entering
 * `idle` picks a random idle line and every other mood clears the bubble.
 * `setVisible(visible)` shows or hides the avatar entirely.
 */
export const useCatStore = create<CatState>()((set) => ({
  mood: "idle",
  message: "",
  visible: true,

  setMood: (mood, message) =>
    set({
      mood,
      message:
        message ??
        (mood === "idle"
          ? IDLE_MESSAGES[Math.floor(Math.random() * IDLE_MESSAGES.length)]
          : ""),
    }),

  setVisible: (visible) => set({ visible }),
}));
