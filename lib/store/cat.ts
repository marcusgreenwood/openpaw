"use client";

/**
 * @file Cat mascot store.
 *
 * Holds the mood, speech-bubble text, and visibility of the cat avatar.
 * Purely cosmetic and not persisted — `useCatReactions` drives it from chat state.
 */

import { create } from "zustand";

/** Visual states the cat avatar can display. */
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

const IDLE_MESSAGES = [
  "Purring softly...",
  "Watching you type...",
  "Kneading the desk...",
  "*stretches*",
  "Flicks tail lazily...",
  "...",
];

/**
 * Store for the cat mascot's mood and speech bubble.
 *
 * `setMood` without an explicit message clears the bubble, except for `"idle"`,
 * which picks a random idle line.
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
