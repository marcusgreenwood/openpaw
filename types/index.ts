/**
 * @file Shared TypeScript types used across the application.
 *
 * Centralising interfaces here prevents circular imports and provides a single
 * source of truth for core domain shapes (skills, models, sessions, profiles).
 */

/** A parsed skill loaded from a SKILL.md file. */
export interface Skill {
  /** Unique skill name as declared in the SKILL.md frontmatter. */
  name: string;
  /** Human-readable description shown in the skills list. */
  description: string;
  /** Optional semver version string from frontmatter. */
  version?: string;
  /** Optional author name or handle from frontmatter. */
  author?: string;
  /** Optional list of categorisation tags from frontmatter. */
  tags?: string[];
  /** Sanitised Markdown body of the skill (HTML stripped, length-capped). */
  body: string;
  /** Absolute path to the SKILL.md file on disk. */
  filePath: string;
  /** Whether the skill is bundled (`"built-in"`) or user-installed (`"user"`). */
  source?: "built-in" | "user";
}

/** Configuration for an AI model available in the provider registry. */
export interface ModelConfig {
  /** Provider-specific model identifier (e.g. `"claude-sonnet-4-6"`). */
  id: string;
  /** Display name shown in the model selector UI. */
  name: string;
  /** Provider slug (e.g. `"anthropic"`, `"openai"`). */
  provider: string;
  /** Maximum context window size in tokens. */
  contextWindow: number;
}

/** A persisted chat session. */
export interface Session {
  /** Unique session identifier (UUID). */
  id: string;
  /** Auto-generated or user-edited title for the session. */
  title: string;
  /** ID of the model selected for this session. */
  modelId: string;
  /** Absolute path to the workspace directory associated with this session. */
  workspacePath: string;
  /** Unix timestamp (ms) when the session was created. */
  createdAt: number;
  /** Unix timestamp (ms) of the last update to this session. */
  updatedAt: number;
}

/** A named project profile that groups sessions under a shared workspace and settings. */
export interface ProjectProfile {
  /** Unique profile identifier (UUID). */
  id: string;
  /** Display name for the project. */
  name: string;
  /** Emoji or icon string displayed next to the project name. */
  icon: string;
  /** Absolute path to the project's workspace directory. */
  workspacePath: string;
  /** Optional preferred model ID to pre-select for new sessions in this project. */
  preferredModelId?: string;
  /** Optional text appended to the system prompt for all sessions in this project. */
  systemPromptAddition?: string;
  /** Unix timestamp (ms) when the profile was created. */
  createdAt: number;
}
