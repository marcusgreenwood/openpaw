"use client";

import { cn } from "@/lib/utils";

interface MultipleChoiceProps {
  question: string;
  options: string[];
  onSelect: (option: string) => void;
}

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
