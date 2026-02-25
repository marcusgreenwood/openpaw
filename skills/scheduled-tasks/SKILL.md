---
name: scheduled-tasks
description: Create and manage scheduled tasks (cron jobs) that run bash commands or AI prompts on a recurring schedule. Use when the user wants to schedule recurring tasks, reminders, backups, reports, data sync, summaries, or any automated job.
allowed-tools: createCron, updateCron, deleteCron, listCrons
---

# Scheduled Tasks

Create and manage cron jobs that run on a schedule. Two types:

- **command** — Runs a bash command (backups, sync, scripts)
- **prompt** — Sends an AI prompt and creates a new chat session each run (summaries, analysis, reminders)

Tasks are stored and can be edited in the Crons panel in the left sidebar.

## Creating a Scheduled Task

Use the `createCron` tool with:

- **name** — Short descriptive label (e.g. "Daily backup", "Morning summary")
- **schedule** — Cron expression (5 fields: minute hour day month weekday)
- **type** — `"command"` or `"prompt"` (inferred from presence of `command` or `prompt`)
- **command** — Bash command when type is `"command"` (executes in workspace directory)
- **prompt** — Detailed AI prompt when type is `"prompt"` — creates a new chat session each run
- **modelId** — (optional) Model for prompt crons (e.g. `anthropic/claude-sonnet-4-6`)

### Prompt crons

When `type` is `"prompt"`, write a **very detailed** prompt. Include:

- Full context (what to analyze, where data lives, what format you need)
- Desired output format (markdown, bullet list, JSON, etc.)
- Any constraints or constraints

Each run creates a new chat session; the conversation appears in the Sessions sidebar.

### Common Cron Schedules

| Schedule | Expression | Description |
|----------|------------|-------------|
| Every 5 minutes | `*/5 * * * *` | |
| Every hour | `0 * * * *` | At minute 0 |
| Daily at midnight | `0 0 * * *` | |
| Daily at 9am | `0 9 * * *` | |
| Weekly (Sunday midnight) | `0 0 * * 0` | |
| Monthly (1st at midnight) | `0 0 1 * *` | |

### Cron Format

```
*    *    *    *    *
┬    ┬    ┬    ┬    ┬
│    │    │    │    └─ day of week (0-7, 0=Sunday)
│    │    │    └────── month (1-12)
│    │    └─────────── day of month (1-31)
│    └──────────────── hour (0-23)
└───────────────────── minute (0-59)
```

## Examples

**Daily backup at 2am (command):**
```
createCron({ name: "Daily backup", schedule: "0 2 * * *", command: "tar -czf backup-$(date +%Y%m%d).tar.gz data/" })
```

**Hourly data sync (command):**
```
createCron({ name: "Sync data", schedule: "0 * * * *", command: "python sync.py" })
```

**Every 15 minutes (command):**
```
createCron({ name: "Check status", schedule: "*/15 * * * *", command: "curl -s https://api.example.com/health" })
```

**Every morning at 9am — AI summary (prompt):**
```
createCron({
  name: "Morning summary",
  schedule: "0 9 * * *",
  type: "prompt",
  prompt: "Review the workspace README and any recent changes in the last 24 hours. Produce a concise summary (3–5 bullet points) of what was done and what might need attention today. Include file paths if relevant."
})
```

**Daily at midnight — analyze logs (prompt):**
```
createCron({
  name: "Log analysis",
  schedule: "0 0 * * *",
  type: "prompt",
  prompt: "Read the logs in ./logs/ from the last 24 hours. Identify any errors, warnings, or unusual patterns. Output a structured report: 1) Critical issues, 2) Warnings, 3) Summary. Use markdown."
})
```

## Managing Tasks

- **listCrons** — Show all scheduled tasks
- **updateCron** — Change schedule, command, or enable/disable (requires id)
- **deleteCron** — Remove a task (requires id)

Users can also edit crons in the Crons panel in the left sidebar.

## Running Tasks

Cron jobs are executed when `/api/crons/run` is called. For production:

- **Vercel**: Add a cron trigger in `vercel.json` to hit `/api/crons/run` every minute
- **Self-hosted**: Use system cron: `* * * * * curl -X POST https://your-app/api/crons/run`
