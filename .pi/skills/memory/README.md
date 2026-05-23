# Memory Skill

Project-local memory workflow for Set Kyar's workspace.

## Files
- `SKILL.md` — skill instructions
- `scripts/memory.py` — CLI implementation
- `../../../data/memory.sqlite` — database
- `../../../data/schema.sql` — schema

## Use from repo root
```bash
python3 .pi/skills/memory/scripts/memory.py search "rent"
python3 .pi/skills/memory/scripts/memory.py add-memory "Prefers concise answers" --category preference --importance 4
python3 .pi/skills/memory/scripts/memory.py add-reminder "Pay rental" --due-at "2026-05-21 09:00" --timezone Asia/Singapore
```
