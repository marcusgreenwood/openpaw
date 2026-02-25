export interface Skill {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tags?: string[];
  body: string;
  filePath: string;
  source?: "built-in" | "user";
}

export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
}

export interface Session {
  id: string;
  title: string;
  modelId: string;
  workspacePath: string;
  createdAt: number;
  updatedAt: number;
}
