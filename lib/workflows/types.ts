export interface WorkflowStep {
  id: string;
  type: "prompt" | "command" | "condition";
  name: string;
  prompt?: string;
  command?: string;
  condition?: string;
  onTrue?: string;
  onFalse?: string;
  timeout?: number;
  continueOnError?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  icon: string;
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  currentStepIndex: number;
  stepResults: WorkflowStepResult[];
  startedAt: number;
  completedAt?: number;
}

export interface WorkflowStepResult {
  stepId: string;
  status: "pending" | "running" | "success" | "failure" | "skipped";
  output?: string;
  error?: string;
  durationMs?: number;
}
