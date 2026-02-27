"use client";

import { useCatStore } from "@/lib/store/cat";

/**
 * A tiny inline cat face (16x16) used as an avatar next to assistant messages.
 * Reflects the current cat mood.
 */
export function CatFace({ size = 20 }: { size?: number }) {
  const mood = useCatStore((s) => s.mood);
  const isHappy = mood === "happy" || mood === "excited";
  const isError = mood === "error";
  const isAsleep = mood === "sleeping";
  const color = isError ? "#f87171" : "#63b3ed";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0"
      aria-hidden
    >
      {/* Ears */}
      <polygon points="4,10 7,3 10,10" fill={color} opacity={0.9} />
      <polygon points="14,10 17,3 20,10" fill={color} opacity={0.9} />
      {/* Inner ears */}
      <polygon points="5.5,9 7,5 8.5,9" fill={isError ? "#fca5a5" : "#90cdf4"} opacity={0.7} />
      <polygon points="15.5,9 17,5 18.5,9" fill={isError ? "#fca5a5" : "#90cdf4"} opacity={0.7} />
      {/* Head */}
      <ellipse cx="12" cy="14" rx="9" ry="8" fill={color} opacity={0.85} />
      {/* Face patch */}
      <ellipse cx="12" cy="16" rx="6" ry="5" fill="white" opacity={0.15} />
      {/* Eyes */}
      {isAsleep ? (
        <>
          <line x1="7" y1="12.5" x2="10" y2="12.5" stroke="rgba(0,0,0,0.4)" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="14" y1="12.5" x2="17" y2="12.5" stroke="rgba(0,0,0,0.4)" strokeWidth="1.2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="8.5" cy="12.5" r="2" fill="white" />
          <circle cx="15.5" cy="12.5" r="2" fill="white" />
          <circle cx="8.8" cy="12.3" r="1.2" fill={isError ? "#500724" : "#1a365d"} />
          <circle cx="15.8" cy="12.3" r="1.2" fill={isError ? "#500724" : "#1a365d"} />
          <circle cx="8.2" cy="11.8" r="0.4" fill="white" />
          <circle cx="15.2" cy="11.8" r="0.4" fill="white" />
        </>
      )}
      {/* Nose */}
      <polygon points="12,15.5 11,16.5 13,16.5" fill={isError ? "#500724" : "#1a365d"} opacity={0.6} />
      {/* Mouth */}
      {isHappy ? (
        <path d="M10,17.5 Q12,19 14,17.5" stroke="rgba(0,0,0,0.3)" fill="none" strokeWidth="0.8" />
      ) : (
        <>
          <path d="M11,17 Q10.5,18 10,17" stroke="rgba(0,0,0,0.25)" fill="none" strokeWidth="0.6" />
          <path d="M13,17 Q13.5,18 14,17" stroke="rgba(0,0,0,0.25)" fill="none" strokeWidth="0.6" />
        </>
      )}
      {/* Whiskers */}
      <line x1="1" y1="15" x2="7" y2="14.5" stroke="white" opacity={0.2} strokeWidth="0.5" />
      <line x1="1" y1="16.5" x2="7" y2="16" stroke="white" opacity={0.2} strokeWidth="0.5" />
      <line x1="23" y1="15" x2="17" y2="14.5" stroke="white" opacity={0.2} strokeWidth="0.5" />
      <line x1="23" y1="16.5" x2="17" y2="16" stroke="white" opacity={0.2} strokeWidth="0.5" />
      {/* Blush when happy */}
      {isHappy && (
        <>
          <ellipse cx="6.5" cy="15" rx="1.5" ry="1" fill="#f472b6" opacity={0.2} />
          <ellipse cx="17.5" cy="15" rx="1.5" ry="1" fill="#f472b6" opacity={0.2} />
        </>
      )}
    </svg>
  );
}
