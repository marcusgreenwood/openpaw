---
name: skill-manager
description: Add, modify, or delete skills. Manages SKILL.md files in the skills/ and workspace/user-skills/ directories which are automatically loaded by the app.
version: "1.0"
author: claw
tags: [skills, management, meta]
---

## Skill Management

You can manage skills for this agent. Skills are loaded from these directories:

1. `skills/<skill-name>/SKILL.md` — built-in skills bundled with the app
2. `workspace/user-skills/<skill-name>/SKILL.md` — skills installed by the user via `npx skills add` or manually

Both are automatically loaded at runtime. No restart is needed — skills are re-read on each request.

### Installing a skill from skills.sh

Use the Skills CLI to install from the ecosystem. The app runs `npx skills add` in a temp directory and copies the results into `workspace/user-skills/`:

```bash
npx skills add <owner/repo> --skill <skill-name> --agent claude-code --copy -y
```

Or use the sidebar's install input to install by repo (e.g. `vercel-labs/agent-skills`).

### Adding a custom skill manually

To create your own skill, write a `SKILL.md` file in `workspace/user-skills/`:

Every SKILL.md must have YAML frontmatter with at least `name` and `description`:

```
---
name: my-skill
description: A short description of what this skill does and when to activate it.
version: "1.0"
author: claw
tags: [relevant, tags]
---

## Heading

- Instruction or guideline
- Another instruction
```

Steps:
1. Choose a short, kebab-case name for the skill (e.g. `docker`, `react`, `testing`).
2. Run: `mkdir -p workspace/user-skills/<skill-name>`
3. Write the `SKILL.md` file into `workspace/user-skills/<skill-name>/SKILL.md` with valid frontmatter and markdown body.
4. The skill will be available on the next chat message automatically.

If the user provides a URL to a markdown file, fetch it with `curl -sL <url>` and save the output directly as the SKILL.md file.

If the user provides a local file path, copy it with `cp <path> workspace/user-skills/<skill-name>/SKILL.md`.

### Modifying an existing skill

1. Read the current skill file. Check both `skills/` and `workspace/user-skills/`.
2. Apply the requested changes (edit frontmatter, update instructions, add/remove guidelines).
3. Write the updated file back.

### Deleting a skill

To remove a built-in skill:

```
rm -rf skills/<skill-name>
```

To remove a user-installed skill:

```
rm -rf workspace/user-skills/<skill-name>
```

Always confirm with the user before deleting.

### Listing skills

To show all installed skills, list both directories:

```
ls skills/ workspace/user-skills/ 2>/dev/null
```

Or read each `SKILL.md` frontmatter to display names and descriptions.

### Rules

- Skill names must be kebab-case (lowercase, hyphens, no spaces).
- The `name` and `description` frontmatter fields are required — skills without them are silently skipped.
- The markdown body is injected into the system prompt, so keep it concise and actionable (max ~4000 chars).
- Tags help with discoverability but are optional.
- If a skill exists in both directories, `skills/` takes priority (first wins).
- Never delete a skill without explicit user confirmation.
