# Resume Terminal Notification Design

## Problem

The Resume in Terminal button currently changes its own text to `Copied!` after copying. The user wants the button label to remain stable and receive a nearby notification instead.

The copied command currently uses the session filename from the URL, for example:

```bash
pi --session 2026-05-08T13-05-24.068Z_492e5bad-c6e9-4c74-9195-f7efc309a7c7.jsonl
```

The desired command should use only the pi session UUID:

```bash
pi --session 492e5bad-c6e9-4c74-9195-f7efc309a7c7
```

## Goals

- Keep the Resume in Terminal button text unchanged after copy.
- Show a small notification near the button after successful copy.
- Let the notification communicate that the command was copied and can be tapped/clicked to view it.
- Copy the UUID-only `pi --session` command when the URL/session id is a timestamped `.jsonl` filename.
- Preserve Clipboard API guard and textarea fallback behavior.

## Approach

Add a small client-side helper in `templates/live_reload.js` for deriving the pi session argument from the session filename. It will strip `.jsonl` and then take the part after the first underscore. If the id has no underscore, it will fall back to the stripped id so older/nonstandard ids still copy something useful.

Change the Resume button click handler so successful copy calls a notification helper instead of mutating `resumeBtn.textContent`. The helper will create or update a sibling notification element inside the existing `.session-actions` container. The notification text will say `Copied — tap to view`. It will have a title containing the full copied command. Clicking/tapping the notification will expand the notification text to show the command. The notification will auto-hide after a short delay.

No backend changes are required.

## Testing

Add template regression tests that verify generated session HTML:

- Does not contain the old `resumeBtn.textContent = 'Copied!'` mutation.
- Contains a helper that derives the UUID-only session id.
- Contains the nearby notification text.
- Still contains the guarded Clipboard API call and `execCommand('copy')` fallback.

Then implement the minimal JavaScript changes and run focused and full Go tests.
