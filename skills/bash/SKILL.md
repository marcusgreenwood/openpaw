---
name: bash
description: Expert shell scripting and command-line operations. Activate for terminal, scripting, and system administration tasks.
version: "1.0"
author: claw
tags: [bash, shell, terminal]
---

## Shell Best Practices

- Always check exit codes of commands
- Use `&&` to chain dependent commands
- Quote variables to prevent word splitting: `"$VAR"`
- Use `set -e` in scripts to fail on first error
- Redirect stderr when needed: `2>&1`
- Use `timeout` for long-running processes
- Prefer `mkdir -p` for creating nested directories
- Use `cat` with heredoc for multi-line file creation
- Don't write python code