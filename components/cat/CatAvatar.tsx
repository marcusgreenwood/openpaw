"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useCatStore, type CatMood } from "@/lib/store/cat";
import { cn } from "@/lib/utils";

const MOOD_MESSAGES: Record<CatMood, string[]> = {
  idle: ["Purring softly...", "*kneads desk*", "Mrrow?", "*flicks tail*", "zzz...wait, I'm awake!", "..."],
  thinking: ["Hmm, let me think...", "Processing...", "*taps chin*", "Interesting question..."],
  happy: ["Purrrrr! 😸", "Nyaa~!", "That worked!", "*happy tail wag*"],
  excited: ["MEOW! 🎉", "Wow wow wow!", "*zoomies*", "So cool!"],
  sleeping: ["zzz...", "💤", "*soft purring*", "five more minutes..."],
  curious: ["Ooh, what's this?", "*perks ears*", "Tell me more!", "*leans in*"],
  typing: ["Writing...", "*tap tap tap*", "Almost done...", "Let me draft this..."],
  error: ["Hiss! 😾", "Something went wrong...", "*flattens ears*", "Uh oh..."],
};

function getRandomMessage(mood: CatMood): string {
  const msgs = MOOD_MESSAGES[mood];
  return msgs[Math.floor(Math.random() * msgs.length)];
}

export function CatAvatar() {
  const { mood, message, visible, setMood } = useCatStore();
  const [eyeX, setEyeX] = useState(0);
  const [eyeY, setEyeY] = useState(0);
  const [blink, setBlink] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Blink randomly
  useEffect(() => {
    if (mood === "sleeping") return;
    const scheduleBlink = () => {
      blinkTimerRef.current = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 150);
        scheduleBlink();
      }, 2000 + Math.random() * 4000);
    };
    scheduleBlink();
    return () => clearTimeout(blinkTimerRef.current);
  }, [mood]);

  // Eyes follow mouse
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!containerRef.current || mood === "sleeping") return;
      const rect = containerRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / window.innerWidth;
      const dy = (e.clientY - cy) / window.innerHeight;
      setEyeX(Math.max(-1, Math.min(1, dx * 4)));
      setEyeY(Math.max(-1, Math.min(1, dy * 4)));
    },
    [mood]
  );

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  // Idle behavior: show speech bubbles periodically
  useEffect(() => {
    if (mood !== "idle" && mood !== "sleeping") return;
    const scheduleIdle = () => {
      idleTimerRef.current = setTimeout(() => {
        setShowBubble(true);
        setMood(mood, getRandomMessage(mood));
        setTimeout(() => setShowBubble(false), 3000);
        scheduleIdle();
      }, 8000 + Math.random() * 12000);
    };
    scheduleIdle();
    return () => clearTimeout(idleTimerRef.current);
  }, [mood, setMood]);

  // Show bubble briefly when mood changes
  useEffect(() => {
    if (mood === "idle") return;
    const showTimer = setTimeout(() => setShowBubble(true), 0);
    const t = setTimeout(() => setShowBubble(false), 4000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(t);
    };
  }, [mood, message]);

  if (!visible) return null;

  const isAsleep = mood === "sleeping";
  const isExcited = mood === "excited";
  const isHappy = mood === "happy" || mood === "excited";
  const isError = mood === "error";
  const isThinking = mood === "thinking" || mood === "typing";

  return (
    <div
      ref={containerRef}
      className="fixed bottom-20 right-4 z-50 select-none pointer-events-none"
      style={{ perspective: "600px" }}
    >
      {/* Speech bubble */}
      <div
        className={cn(
          "absolute -top-12 right-0 max-w-[180px] px-3 py-1.5 rounded-xl text-xs transition-all duration-300",
          "bg-bg-elevated border border-white/10 text-text-secondary shadow-lg",
          "pointer-events-auto",
          showBubble && message
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-2"
        )}
      >
        <span>{message || getRandomMessage(mood)}</span>
        <div className="absolute -bottom-1.5 right-6 w-3 h-3 bg-bg-elevated border-r border-b border-white/10 rotate-45" />
      </div>

      {/* Cat body */}
      <div
        className={cn(
          "relative w-16 h-16 pointer-events-auto cursor-pointer transition-transform duration-500",
          isExcited && "animate-bounce",
          isAsleep && "opacity-80",
        )}
        style={{
          transform: `rotateY(${eyeX * 5}deg) rotateX(${-eyeY * 3}deg)`,
          transformStyle: "preserve-3d",
        }}
        onClick={() => {
          const moods: CatMood[] = ["happy", "excited", "curious"];
          const next = moods[Math.floor(Math.random() * moods.length)];
          setMood(next, getRandomMessage(next));
          setTimeout(() => setMood("idle"), 3000);
        }}
        title="Pet the cat!"
      >
        {/* Ears */}
        <div
          className={cn(
            "absolute -top-3 left-1.5 w-0 h-0 transition-transform duration-300",
            isError ? "border-b-rose-400" : "border-b-accent-cyan",
            isThinking && "animate-ear-twitch-left"
          )}
          style={{
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderBottom: "10px solid",
            borderBottomColor: isError ? "#f87171" : "#63b3ed",
            transform: `rotate(-15deg) ${isError ? "scaleY(0.6)" : ""}`,
          }}
        />
        <div
          className={cn(
            "absolute -top-3 right-1.5 w-0 h-0 transition-transform duration-300",
            isThinking && "animate-ear-twitch-right"
          )}
          style={{
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderBottom: "10px solid",
            borderBottomColor: isError ? "#f87171" : "#63b3ed",
            transform: `rotate(15deg) ${isError ? "scaleY(0.6)" : ""}`,
          }}
        />

        {/* Inner ears */}
        <div
          className="absolute -top-1.5 left-2.5 w-0 h-0"
          style={{
            borderLeft: "3px solid transparent",
            borderRight: "3px solid transparent",
            borderBottom: "6px solid",
            borderBottomColor: isError ? "#fca5a5" : "#90cdf4",
            transform: "rotate(-15deg)",
          }}
        />
        <div
          className="absolute -top-1.5 right-2.5 w-0 h-0"
          style={{
            borderLeft: "3px solid transparent",
            borderRight: "3px solid transparent",
            borderBottom: "6px solid",
            borderBottomColor: isError ? "#fca5a5" : "#90cdf4",
            transform: "rotate(15deg)",
          }}
        />

        {/* Head */}
        <div
          className={cn(
            "absolute inset-0 rounded-[50%_50%_45%_45%] transition-colors duration-500",
            isError
              ? "bg-gradient-to-b from-rose-400/90 to-rose-500/90"
              : "bg-gradient-to-b from-accent-cyan/90 to-accent-cyan/70"
          )}
          style={{
            boxShadow: isError
              ? "0 4px 20px rgba(248,113,113,0.3)"
              : isHappy
                ? "0 4px 20px rgba(99,179,237,0.4)"
                : "0 4px 20px rgba(99,179,237,0.2)",
          }}
        />

        {/* Face patch (lighter area) */}
        <div
          className="absolute top-[35%] left-[15%] right-[15%] bottom-[15%] rounded-[50%] bg-white/20"
        />

        {/* Eyes */}
        {isAsleep ? (
          <>
            <div className="absolute top-[32%] left-[18%] w-[22%] h-[3px] bg-bg-base/70 rounded-full" style={{ transform: "rotate(-5deg)" }} />
            <div className="absolute top-[32%] right-[18%] w-[22%] h-[3px] bg-bg-base/70 rounded-full" style={{ transform: "rotate(5deg)" }} />
          </>
        ) : (
          <>
            {/* Left eye */}
            <div
              className="absolute top-[28%] left-[16%] w-[26%] h-[28%] bg-white rounded-[50%] overflow-hidden transition-all duration-100"
              style={{
                transform: blink ? "scaleY(0.1)" : "scaleY(1)",
              }}
            >
              <div
                className={cn(
                  "absolute w-[65%] h-[65%] rounded-full transition-colors",
                  isError ? "bg-rose-900" : isHappy ? "bg-emerald-900" : "bg-slate-900"
                )}
                style={{
                  left: `${30 + eyeX * 15}%`,
                  top: `${25 + eyeY * 12}%`,
                }}
              >
                {/* Pupil */}
                <div
                  className="absolute w-[55%] h-[55%] rounded-full bg-black"
                  style={{ left: "22%", top: "22%" }}
                />
                {/* Highlight */}
                <div className="absolute w-[25%] h-[25%] rounded-full bg-white top-[15%] left-[15%]" />
              </div>
            </div>

            {/* Right eye */}
            <div
              className="absolute top-[28%] right-[16%] w-[26%] h-[28%] bg-white rounded-[50%] overflow-hidden transition-all duration-100"
              style={{
                transform: blink ? "scaleY(0.1)" : "scaleY(1)",
              }}
            >
              <div
                className={cn(
                  "absolute w-[65%] h-[65%] rounded-full transition-colors",
                  isError ? "bg-rose-900" : isHappy ? "bg-emerald-900" : "bg-slate-900"
                )}
                style={{
                  left: `${30 + eyeX * 15}%`,
                  top: `${25 + eyeY * 12}%`,
                }}
              >
                <div
                  className="absolute w-[55%] h-[55%] rounded-full bg-black"
                  style={{ left: "22%", top: "22%" }}
                />
                <div className="absolute w-[25%] h-[25%] rounded-full bg-white top-[15%] left-[15%]" />
              </div>
            </div>
          </>
        )}

        {/* Nose */}
        <div className="absolute top-[55%] left-1/2 -translate-x-1/2 w-0 h-0"
          style={{
            borderLeft: "3px solid transparent",
            borderRight: "3px solid transparent",
            borderTop: "4px solid",
            borderTopColor: isError ? "#500724" : "#1a365d",
          }}
        />

        {/* Mouth */}
        {isHappy ? (
          <div className="absolute top-[62%] left-1/2 -translate-x-1/2 w-[30%] h-[8%] border-b-2 border-bg-base/60 rounded-b-full" />
        ) : isError ? (
          <div className="absolute top-[65%] left-1/2 -translate-x-1/2 w-[20%] h-[6%] border-t-2 border-bg-base/60 rounded-t-full" />
        ) : (
          <>
            <div className="absolute top-[60%] left-[37%] w-[12%] h-[6%] border-b border-bg-base/40 rounded-br-full" />
            <div className="absolute top-[60%] right-[37%] w-[12%] h-[6%] border-b border-bg-base/40 rounded-bl-full" />
          </>
        )}

        {/* Whiskers */}
        <div className="absolute top-[56%] left-[-8%] w-[30%] h-[1px] bg-white/30 rotate-[-5deg]" />
        <div className="absolute top-[60%] left-[-10%] w-[32%] h-[1px] bg-white/25 rotate-[3deg]" />
        <div className="absolute top-[56%] right-[-8%] w-[30%] h-[1px] bg-white/30 rotate-[5deg]" />
        <div className="absolute top-[60%] right-[-10%] w-[32%] h-[1px] bg-white/25 rotate-[-3deg]" />

        {/* Blush (when happy) */}
        {isHappy && (
          <>
            <div className="absolute top-[50%] left-[8%] w-[18%] h-[12%] rounded-full bg-pink-400/25" />
            <div className="absolute top-[50%] right-[8%] w-[18%] h-[12%] rounded-full bg-pink-400/25" />
          </>
        )}

        {/* Thinking dots */}
        {isThinking && (
          <div className="absolute -top-8 -right-2 flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan/60 animate-pulse" style={{ animationDelay: "0ms" }} />
            <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan/60 animate-pulse" style={{ animationDelay: "300ms" }} />
            <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan/60 animate-pulse" style={{ animationDelay: "600ms" }} />
          </div>
        )}

        {/* Zzz when sleeping */}
        {isAsleep && (
          <div className="absolute -top-6 -right-1 text-accent-cyan/50 text-xs font-bold animate-float">
            💤
          </div>
        )}

        {/* Tail */}
        <div
          className={cn(
            "absolute -bottom-1 -right-4 w-8 h-3 rounded-full origin-left transition-transform",
            isError
              ? "bg-rose-400/80"
              : "bg-accent-cyan/70",
            isHappy ? "animate-tail-wag" : isExcited ? "animate-tail-wag-fast" : isError ? "animate-tail-puff" : "animate-tail-idle",
          )}
          style={{ borderRadius: "50% 50% 50% 0" }}
        />
      </div>
    </div>
  );
}
