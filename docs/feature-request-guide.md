# How to Write a Good Feature Request

A well-written feature request helps maintainers (or future you) understand the **why** behind the idea, not just the **what**. Here's the formula.

## Structure

### 1. Title
Be specific and action-oriented. Include a `[FEATURE]` tag for easy scanning.

```
[FEATURE] Archive sessions to declutter the sessions overview
```

### 2. Problem
Describe the pain point clearly. Focus on the user experience and why the current behavior falls short.

> Over time, the sessions list grows and becomes cluttered with completed or outdated sessions. There's currently no way to hide old sessions while keeping them accessible, making it harder to find and continue active work.

### 3. Proposed Solution
Describe what you want to happen. Be specific about behavior but flexible about implementation. Use bullet points for clarity.

> Add an "archive" action to sessions that moves them out of the main overview into a separate archived section.
> - Archived sessions are hidden from the default sessions list
> - Each project gets an expandable "Archived" subsection
> - Archiving is a simple toggle — one click to archive, one click to restore
> - Search still returns archived sessions

### 4. Alternatives Considered
Show you've thought it through. Mention other approaches and why they're not ideal (or worth considering later).

> - **Auto-archive by inactivity** — useful but better as a follow-up
> - **Session deletion** — too destructive without a safety net

### 5. Additional Context
Add anything that helps: screenshots, mockups, links to similar features in other tools, or edge cases to consider.

> This is a well-established UX pattern: Gmail (archive), Slack (archive channels), Linear (close/archive issues).

## Tips

- **Keep it concise** — maintainers skim issues, get to the point fast
- **Focus on the "why" first** — the problem motivates the solution
- **Be specific about behavior, flexible about implementation**
- **Reference similar features** in other projects to anchor expectations
- **Use labels** — `enhancement` or `feature` if the repo supports them
- **One idea per issue** — don't bundle unrelated requests together
