"use client";

import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
  length: number;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionConstructor | null;
}

interface VoiceInputProps {
  onChange: (text: string) => void;
  disabled?: boolean;
}

const subscribe = () => () => {};
const getSnapshot = () => getSpeechRecognition() !== null;
const getServerSnapshot = () => false;

export function VoiceInput({ onChange, disabled }: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const supported = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const startRecording = useCallback(() => {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from({ length: event.results.length })
        .map((_, i) => event.results[i][0].transcript)
        .join("");
      onChange(transcript);
    };

    recognition.onerror = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [onChange]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const handleClick = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer",
        "disabled:opacity-30 disabled:cursor-not-allowed",
        isRecording
          ? "bg-red-500/20 border border-red-500/40 text-red-400"
          : "bg-white/5 border border-white/8 text-text-muted hover:bg-white/8 hover:text-text-secondary"
      )}
      title={isRecording ? "Stop recording" : "Voice input"}
    >
      {isRecording ? (
        <div className="flex items-center gap-[2px]">
          <span className="w-[3px] h-3 bg-red-400 rounded-full animate-voice-bar1" />
          <span className="w-[3px] h-4 bg-red-400 rounded-full animate-voice-bar2" />
          <span className="w-[3px] h-2.5 bg-red-400 rounded-full animate-voice-bar3" />
        </div>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      )}
    </button>
  );
}
