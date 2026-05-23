---
name: memory
description: Manages project-local long-term memory in SQLite for Set Kyar's workspace. Use when storing, searching, correcting, or listing memories, reminders, accounts, automations, or schema changes.
---

# Memory

Use this skill for project memory tasks.

## Core files
- `data/memory.sqlite` — primary memory database
- `data/schema.sql` — schema definition
- `.pi/skills/memory/scripts/memory.py` — CLI implementation

## Common commands
```bash
python3 .pi/skills/memory/scripts/memory.py search "rent"
python3 .pi/skills/memory/scripts/memory.py add-memory "Prefers concise answers" --category preference --importance 4
python3 .pi/skills/memory/scripts/memory.py add-reminder "Pay rental" --due-at "2026-05-21 09:00" --timezone Asia/Singapore
python3 .pi/skills/memory/scripts/memory.py add-account "Syfe" --account-name "Brokerage" --currency SGD --balance 100000
python3 .pi/skills/memory/scripts/memory.py schema-changes
```

## Rules
- Store explicit remember requests without asking again, unless sensitive.
- Ask before storing sensitive domains like finance, health, legal, identity, addresses, or private documents.
- Never store passwords, API keys, seed phrases, OTPs, or full card numbers.
- Prefer additive schema changes only.
- Use `schema-change` for schema updates.

## When to use
- Save user preferences or personal facts
- Add reminders or recurring automations
- Update corrected memories
- Check existing stored context before answering
