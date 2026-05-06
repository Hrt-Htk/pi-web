# pi-web Rename Design

**Date:** 2026-05-06

## Goal
Rename the local project folder and project-facing identity from `pi-sessions-viewer` to `pi-web`, and update repository references from `https://github.com/ygncode/pi-sessions-viewer` to `https://github.com/setkyar/pi-web`.

## Scope
This change includes:
- Local folder rename to `pi-web`
- GitHub repository URL/reference updates
- Project/app naming updates in docs and user-facing configuration
- Technical artifact renames where practical, including binary and LaunchAgent naming

This change does **not** intentionally modify runtime behavior or feature logic.

## Approach
Use a focused naming sweep across repository metadata, documentation, user-facing commands, and configuration files. Preserve existing functionality while making the repository and app identity consistently use `pi-web`.

## Files and Areas Expected to Change
- `README.md`
- `go.mod`
- `skill/SKILL.md`
- `view-sessions.ts`
- `com.pi-sessions-viewer.plist` (and likely its filename)
- local git remotes / local folder name

## Naming Decisions
- Repository: `setkyar/pi-web`
- Local folder: `pi-web`
- Binary name: `pi-web`
- LaunchAgent plist filename/label: `com.pi-web.plist` / `com.pi-web`
- Skill install path examples: `~/.pi/agent/skills/pi-web`

## Behavior and Compatibility
The rename is primarily branding and repository alignment. Existing functionality should remain unchanged. Some old commands or file names documented previously under `pi-sessions-viewer` will be replaced with `pi-web` for consistency.

## Risks
- A partial rename could leave mixed branding and confusing setup instructions.
- Renaming the plist changes install commands for macOS auto-start.
- Renaming the Go module may affect local imports if internal package paths depend on it; this should be verified during implementation.

## Validation
Verify:
- local folder is renamed successfully
- remotes point at the intended repositories
- repository references use `setkyar/pi-web`
- user-facing docs and commands consistently use `pi-web`
- code still builds after module/name updates
