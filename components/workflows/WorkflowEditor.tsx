"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Workflow, WorkflowStep } from "@/lib/workflows/types";

function generateStepId() {
  return `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function createEmptyStep(): WorkflowStep {
  return {
    id: generateStepId(),
    type: "command",
    name: "",
    command: "",
    timeout: 60000,
    continueOnError: false,
  };
}

interface WorkflowEditorProps {
  workflow?: Workflow;
  onSave: (data: Omit<Workflow, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
}

export function WorkflowEditor({
  workflow,
  onSave,
  onCancel,
}: WorkflowEditorProps) {
  const [name, setName] = useState(workflow?.name ?? "");
  const [description, setDescription] = useState(workflow?.description ?? "");
  const [icon, setIcon] = useState(workflow?.icon ?? "⚡");
  const [steps, setSteps] = useState<WorkflowStep[]>(
    workflow?.steps ?? [createEmptyStep()]
  );

  const handleAddStep = () => {
    setSteps((prev) => [...prev, createEmptyStep()]);
  };

  const handleRemoveStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMoveStep = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= steps.length) return;
    setSteps((prev) => {
      const copy = [...prev];
      [copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
      return copy;
    });
  };

  const updateStep = (index: number, updates: Partial<WorkflowStep>) => {
    setSteps((prev) =>
      prev.map((step, i) => (i === index ? { ...step, ...updates } : step))
    );
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (steps.length === 0) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      icon,
      steps,
    });
  };

  return (
    <div className="flex flex-col gap-4 overflow-y-auto">
      {/* Workflow metadata */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className="w-12 h-8 px-2 rounded-lg text-center text-lg bg-white/5 border border-white/10 outline-none"
            maxLength={4}
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workflow name"
            className="flex-1 h-8 px-3 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full px-3 py-2 rounded-lg text-xs bg-white/5 border border-white/10 text-text-primary outline-none resize-none placeholder:text-text-muted"
        />
      </div>

      {/* Steps */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Steps ({steps.length})
          </span>
          <button
            onClick={handleAddStep}
            className="text-[10px] text-accent-cyan hover:text-accent-cyan/80 cursor-pointer"
          >
            + Add Step
          </button>
        </div>

        {steps.map((step, index) => (
          <div
            key={step.id}
            className="glass-card p-3 space-y-2"
          >
            {/* Step header */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-text-muted w-5 shrink-0">
                {index + 1}.
              </span>

              {/* Type selector */}
              <select
                value={step.type}
                onChange={(e) =>
                  updateStep(index, {
                    type: e.target.value as WorkflowStep["type"],
                  })
                }
                className="h-7 px-2 rounded text-[11px] bg-white/5 border border-white/10 text-text-secondary outline-none cursor-pointer"
              >
                <option value="command">Command</option>
                <option value="prompt">Prompt</option>
                <option value="condition">Condition</option>
              </select>

              <input
                type="text"
                value={step.name}
                onChange={(e) => updateStep(index, { name: e.target.value })}
                placeholder="Step name"
                className="flex-1 h-7 px-2 rounded text-xs bg-white/5 border border-white/10 text-text-primary outline-none placeholder:text-text-muted"
              />

              {/* Reorder & remove */}
              <div className="flex gap-0.5 shrink-0">
                <button
                  onClick={() => handleMoveStep(index, -1)}
                  disabled={index === 0}
                  className="w-6 h-6 rounded text-[10px] text-text-muted hover:text-text-primary hover:bg-white/5 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                >
                  ↑
                </button>
                <button
                  onClick={() => handleMoveStep(index, 1)}
                  disabled={index === steps.length - 1}
                  className="w-6 h-6 rounded text-[10px] text-text-muted hover:text-text-primary hover:bg-white/5 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                >
                  ↓
                </button>
                <button
                  onClick={() => handleRemoveStep(index)}
                  className="w-6 h-6 rounded text-[10px] text-terminal-red/70 hover:text-terminal-red hover:bg-red-500/5 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Step content */}
            {step.type === "command" && (
              <textarea
                value={step.command ?? ""}
                onChange={(e) => updateStep(index, { command: e.target.value })}
                placeholder="Bash command (e.g. npm test)"
                rows={2}
                className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-white/5 border border-white/10 text-text-primary outline-none resize-none placeholder:text-text-muted"
              />
            )}

            {step.type === "prompt" && (
              <textarea
                value={step.prompt ?? ""}
                onChange={(e) => updateStep(index, { prompt: e.target.value })}
                placeholder="AI prompt (use {{previousOutput}} to reference last step output)"
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-xs bg-white/5 border border-white/10 text-text-primary outline-none resize-none placeholder:text-text-muted"
              />
            )}

            {step.type === "condition" && (
              <div className="space-y-2">
                <textarea
                  value={step.condition ?? ""}
                  onChange={(e) =>
                    updateStep(index, { condition: e.target.value })
                  }
                  placeholder="JavaScript expression (e.g. output.includes('PASS'))"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-white/5 border border-white/10 text-text-primary outline-none resize-none placeholder:text-text-muted"
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-text-muted block mb-1">
                      If true → go to step
                    </label>
                    <select
                      value={step.onTrue ?? ""}
                      onChange={(e) =>
                        updateStep(index, { onTrue: e.target.value || undefined })
                      }
                      className="w-full h-7 px-2 rounded text-[11px] bg-white/5 border border-white/10 text-text-secondary outline-none cursor-pointer"
                    >
                      <option value="">Next step</option>
                      {steps.map((s, i) =>
                        i !== index ? (
                          <option key={s.id} value={s.id}>
                            {i + 1}. {s.name || `Step ${i + 1}`}
                          </option>
                        ) : null
                      )}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-text-muted block mb-1">
                      If false → go to step
                    </label>
                    <select
                      value={step.onFalse ?? ""}
                      onChange={(e) =>
                        updateStep(index, {
                          onFalse: e.target.value || undefined,
                        })
                      }
                      className="w-full h-7 px-2 rounded text-[11px] bg-white/5 border border-white/10 text-text-secondary outline-none cursor-pointer"
                    >
                      <option value="">Next step</option>
                      {steps.map((s, i) =>
                        i !== index ? (
                          <option key={s.id} value={s.id}>
                            {i + 1}. {s.name || `Step ${i + 1}`}
                          </option>
                        ) : null
                      )}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Options row */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[10px] text-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={step.continueOnError ?? false}
                  onChange={(e) =>
                    updateStep(index, { continueOnError: e.target.checked })
                  }
                  className="rounded border-white/20"
                />
                Continue on error
              </label>
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-text-muted">Timeout:</label>
                <input
                  type="number"
                  value={(step.timeout ?? 60000) / 1000}
                  onChange={(e) =>
                    updateStep(index, {
                      timeout: Math.max(1, Number(e.target.value)) * 1000,
                    })
                  }
                  className="w-14 h-6 px-1.5 rounded text-[10px] font-mono bg-white/5 border border-white/10 text-text-secondary outline-none"
                  min={1}
                />
                <span className="text-[10px] text-text-muted">s</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={!name.trim() || steps.length === 0}
        >
          {workflow ? "Update" : "Create"} Workflow
        </Button>
        <button
          onClick={onCancel}
          className="h-8 px-3 rounded-lg text-xs text-text-muted hover:text-text-secondary cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
