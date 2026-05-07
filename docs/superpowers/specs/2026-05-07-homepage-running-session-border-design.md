# Homepage Running Session Border Design

## Goal
Make running sessions on the homepage visually obvious by showing an animated dashed border around the full session card.

## Scope
Only change the homepage session list UI at `/`. Do not change the session detail page, backend status semantics, or non-running card states.

## Proposed Behavior
- When a session is in `running` state, its card gets a dashed animated border.
- The animation should feel like a lightweight loading indicator (“marching ants”), not a spinner or pulse.
- The effect applies to the whole session card.
- The effect is border-only: no glow, no background tint, no content movement.
- When the session leaves `running`, the card returns to its normal appearance.
- If live status cannot be determined, the card should fall back to the normal non-running style.
- The homepage must detect running state even when activity starts in another browser tab, without requiring the user to open the session detail page first.

## UI Design
### Recommended approach: pseudo-element overlay
Use a `session-card--running` modifier class and render the animated border with a `::before` pseudo-element.

Why this approach:
- preserves the existing base border and hover behavior,
- avoids layout shifts,
- gives better control over rounded corners, inset spacing, and animation styling,
- keeps the running treatment isolated from the default card styles.

### Visual details
- dashed border color: Pi-aligned cyan/teal accent, not warm red,
- rounded corners matching the existing card radius,
- slight inset so the animated border sits cleanly inside the card,
- finer dash spacing and smoother motion so the effect feels polished rather than loud,
- slow, subtle motion to avoid visual noise when multiple sessions are running.

## Data / State Flow
The homepage needs to know which sessions are currently running.

Recommended implementation shape:
- extend the homepage data model to track running state per session id,
- populate initial state from a lightweight fetch path,
- refresh visible card statuses while the homepage is open so another tab’s chat activity appears here automatically,
- toggle the `session-card--running` class based on that state.

Recommended refresh behavior:
- check visible cards on initial load,
- continue polling visible cards near-real-time (about every 1–2 seconds) while the homepage is open,
- clear stale running state immediately when a poll reports non-running or fails.

If the current homepage already has enough live events to infer running state, reuse them. Otherwise client-side polling is acceptable and preferred over adding unnecessary backend event complexity for this feature.

## Accessibility and UX
- Running state must not rely only on hover.
- Animation should be subtle enough not to distract from scanning the list.
- Keep the effect purely decorative; card click targets and keyboard behavior must remain unchanged.
- Respect reduced-motion preferences by disabling or minimizing the animation under `prefers-reduced-motion`.

## Error Handling
- Unknown or unavailable status should not show a running border.
- A stale running style must be cleared when the client learns the session is idle or errored.

## Testing
Add or update frontend tests to cover:
- running class application when a session is marked running,
- running class removal when status becomes non-running,
- no false positive running class on unknown sessions,
- reduced-motion fallback if implemented in a testable way.

## Out of Scope
- glow effects,
- background tint changes,
- changes to card layout/content,
- non-homepage running indicators.
