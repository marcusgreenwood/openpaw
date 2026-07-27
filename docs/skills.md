# Skill Authoring

Skills are Markdown files that get injected into the agent's system prompt. Each one adds
domain knowledge, a workflow, or CLI usage instructions that the agent then follows.

---

## The `SKILL.md` format

A skill is a directory containing a `SKILL.md` file with YAML frontmatter and a Markdown body.

```markdown
---
name: my-skill
description: What this does and when the agent should use it. Include trigger phrases.
version: "1.0"
author: your-name
tags: [category, another-tag]
---

# My Skill

## When to use

…

## Common patterns

```bash
some-cli do-the-thing --flag value
```
```

### Frontmatter fields

Parsed with `gray-matter` in `lib/skills/loader.ts`.

| Field | Required | Notes |
|-------|----------|-------|
| `name` | **yes** | Skill identifier. A `SKILL.md` missing this is silently skipped. Also the dedupe key. |
| `description` | **yes** | Also required — missing it means the skill is skipped. This is the main signal the agent uses to decide when to apply the skill, so write it as "what it does + when to use it + trigger phrases". |
| `version` | no | Free-form string; carried through to the API but not used for resolution |
| `author` | no | Free-form string |
| `tags` | no | Array of strings; defaults to `[]` |

Other keys (for example `allowed-tools`, used by some built-in skills) are preserved in the
file but ignored by the loader.

### Body processing

The body — everything after the frontmatter — is injected into the system prompt as-is, with
two transformations:

1. **HTML tags are stripped** (`/<[^>]*>/g`), so don't rely on inline HTML.
2. **Truncated to 4000 characters** (`MAX_SKILL_BODY_LENGTH`). Anything past that never
   reaches the model. Keep skills tight; put long reference material in sibling files the
   agent can read on demand and point at them from the body.

### How it reaches the model

`buildSystemPrompt` renders every loaded skill into the `{{SKILL_BLOCKS}}` slot of
`lib/system-prompt.md`:

```
You have the following skills installed: **agent-browser, bash, coding**.

### agent-browser
_Browser automation CLI for AI agents…_

<body>

---

### bash
…
```

With no skills loaded, the section instead tells the agent to run `npx skills find <query>`.

---

## Load order and precedence

`lib/skills/loader.ts` scans these directories in order:

1. `skills/` — built-in, at the project root → `source: "built-in"`
2. `user-skills/` — legacy location at the project root → `source: "user"`
3. `<workspace>/user-skills/` — the primary install target → `source: "user"`
4. `<workspace>/.claude/skills/` — Claude Code skills, e.g. from `npx skills add` → `source: "user"`

`<workspace>` is the request's `workspacePath` when provided, otherwise `DEFAULT_WORKSPACE`.

**First directory wins on name conflicts.** A built-in `coding` skill shadows a user-installed
skill also named `coding`, and the user copy is never loaded. Rename yours if you want to
override behaviour.

Each directory is scanned one level deep: every immediate subdirectory is checked for a
`SKILL.md`. Missing or malformed files are skipped silently.

**Caching** — `lib/skills/manager.ts` caches the loaded list per workspace for 10 seconds.
Install, edit, and delete all call `invalidateSkillsCache()`, so changes made through the app
take effect on the next message. Editing a `SKILL.md` by hand takes effect within 10 seconds.

---

## Writing a new skill

1. Create the directory and file:

   ```bash
   mkdir -p workspace/user-skills/my-skill
   $EDITOR workspace/user-skills/my-skill/SKILL.md
   ```

2. Write the frontmatter. `name` and `description` are mandatory — leave either out and the
   skill loads as nothing at all with no error.

3. Write the body. Effective skills tend to include:

   - **When to use this skill** — concrete triggers, phrased the way a user would ask
   - **Core workflow** — the exact command sequence, in order
   - **Common patterns** — copy-pasteable recipes for the usual tasks
   - **Gotchas** — what breaks and how to avoid it

   Look at `skills/agent-browser/SKILL.md` for a worked example of a CLI-wrapping skill.

4. Send any message. The skill is picked up on the next request (subject to the 10 s cache)
   and appears in the sidebar's Skills tab.

### Guidelines

- **Stay under 4000 characters.** Everything past that is cut.
- **Be imperative.** The body becomes system-prompt instructions — write "Always snapshot
  before interacting", not "the tool has a snapshot feature".
- **No inline HTML** — it is stripped.
- **Skills that save files must use `public/`.** Files written to `workspace/public/` are
  served at `/api/files/<filename>`; the project root `public/` is Next.js's static folder and
  is the wrong target. See [skills/README.md](../skills/README.md).
- **Remember skills are always loaded.** Every installed skill's body is in the system prompt
  on every request, so a bloated skill set costs input tokens on every message.

---

## Managing skills

### In the app

Sidebar → **Skills** tab:

- **Install by name** — enter `owner/repo` and install (`POST /api/skills`).
- **Search** — `SkillMarketplace` queries `/api/skills/search` with a debounce; results show
  install state per skill. An empty query returns a curated featured list.
- **Edit** — `SkillEditor` loads the raw `SKILL.md` (`GET /api/skills/[name]`) and saves it
  back (`PUT`). Built-in skills return `403` on edit.
- **Delete** — removes the skill's directory (`DELETE /api/skills/[name]`). Built-in skills
  return `403`.

### From the CLI

```bash
npx skills find <query>              # search the ecosystem
npx skills add <owner/repo>          # install
npx skills list                      # list installed
```

The in-app installer runs `npx skills add <name> --agent claude-code --copy -y` in a temp
directory and copies the result into `<workspace>/user-skills/`, so both paths land in the
same place.

### From the agent

The system prompt instructs the agent to search for skills on its own when it hits a task it
can't cover, and to use `askChoice` to confirm before installing — it should never run
`npx skills add` unprompted.

### Endpoints

Full request/response detail is in the [API reference](./api.md#skills):
`GET`/`POST /api/skills`, `GET`/`PUT`/`DELETE /api/skills/[name]`, `GET /api/skills/search`.

---

## Built-in skills

Shipped in `skills/`:

| Skill | Purpose |
|-------|---------|
| `agent-browser` | Browser automation — navigate, fill forms, click, screenshot, scrape |
| `coding` | Software engineering best practices |
| `bash` | Shell scripting and CLI workflows |
| `scheduled-tasks` | Creating and managing cron jobs (command and prompt types) |
| `find-skills` | Discovering and installing skills from the ecosystem |
| `skill-manager` | Managing installed skills |

These are part of the repo, so editing them is a source change, not a runtime one — the API
refuses to edit or delete anything with `source: "built-in"`.
