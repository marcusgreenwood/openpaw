"use client";

import { cn } from "@/lib/utils";

/**
 * Props for the MultipleChoice component.
 *
 * @property question - Prompt text displayed above the option buttons
 * @property options - Array of choice strings rendered as clickable buttons
 * @property onSelect - Callback invoked with the chosen option string
 */
interface MultipleChoiceProps {
  question: string;
  options: string[];
  onSelect: (option: string) => void;
}

/**
 * Renders an inline multiple-choice selector used by the agent to collect user
 * input during a conversation. Each option is presented as a cyan-styled button.
 */
export function MultipleChoice({ question, options, onSelect }: MultipleChoiceProps) {
  return (
    <div className="my-3 space-y-2">
      <p className="text-sm text-text-secondary">{question}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onSelect(option)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium",
              "bg-accent-cyan/15 border border-accent-cyan/30 text-accent-cyan",
              "hover:bg-accent-cyan/25 hover:border-accent-cyan/50",
              "transition-colors cursor-pointer"
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
