"use client";

import { create } from "zustand";

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
