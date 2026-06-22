# Issue Resolution Guide

Step-by-step process for resolving issues. Every change follows the same path: triage, implement, test with Playwright, validate with screenshots, PR.

## Step 1 — Triage

1. **Confirm the issue exists and is labelled.** Per [workflow rules](workflow.md), labels are mandatory. If unlabelled, add one (`bug`, `enhancement`, `docs`, `chore`, etc.).
2. **Classify the change** using the [Decision Matrix](#decision-matrix) below to determine what testing is required.
3. **Check for existing tests** that cover the affected area — you may need to update them alongside your change.

## Step 2 — Branch + Implement

1. **Ensure a clean tree:** `git status` must be clean. Commit, stash, or discard any pending work first.
2. **Create a named branch:** `type/issueN-description` (see [Branch Rules](workflow.md#branch-rules)).
3. **Implement the change.** Follow the [development rules](../../AGENTS.md) — clear names, no unnecessary abstractions, update matching docs.

## Step 3 — Write E2E Test(s)

If the Decision Matrix says an E2E spec is required:

1. **Create the spec** at `e2e/tests/issueN-short-name.spec.ts`.
2. **Import from the shared fixture:** `import { test, expect, isMobileLayout, collapseScratchpad } from '../lib/test'` (never import `@playwright/test` directly).
3. **Gate layout-specific assertions** with `isMobileLayout(page)` after navigation — iPad portrait is mobile, landscape is desktop.
4. **Call `collapseScratchpad(page)`** before `goto` on narrow viewports (the scratchpad overlays the header/composer).
5. **Take screenshots** at key states (see [Screenshot Rules](#screenshot-rules)).
6. **Create per-test session files** via `e2e/lib/sessions.ts` — never mutate committed fixtures.

See [e2e-testing.md](e2e-testing.md) for full E2E setup and project matrix details.

### Screenshot Rules

| Rule | Detail |
|---|---|
| **When** | Every UI-visible change — bugs, features, style/CSS |
| **Where** | `e2e/.shots/` (already gitignored) |
| **Naming** | `issueN-{desktop\|mobile}-{state}.png` — e.g. `issue68-desktop-collapsed.png` |
| **Minimum coverage** | Desktop (Chrome) + Mobile (Pixel 5 or iPhone 13) for layout-sensitive changes |
| **Scope** | Screenshot the component, not the full page — use `locator.screenshot()` |
| **Layout tag** | Use `isMobileLayout(page)` to determine `desktop` vs `mobile` tag |

**Helper pattern** (from `issue11-autoexpand.spec.ts`):

```ts
const mobile = await isMobileLayout(page);
const tag = mobile ? 'mobile' : 'desktop';
const shot = (n: string) => locator.screenshot({ path: `.shots/issueN-${tag}-${n}.png` });

// Key state 1
await shot('collapsed');
// Key state 2
await shot('expanded');
```

**Component-level pattern** (from `git-status-project-header.spec.ts`):

```ts
const mobile = await isMobileLayout(page);
const tag = mobile ? 'mobile' : 'desktop';
await projectGroup.first().screenshot({ path: `.shots/git-${tag}-project-header.png` });
```

## Step 4 — Verify

Run these checks in order:

```bash
# Unit + Go tests, lint, format, build, vet
make check

# Full E2E suite (builds binary first)
make e2e

# Or, if binary is already built — run your spec only
cd e2e
npx playwright test tests/issueN-name.spec.ts

# Headed mode for final eyeball review
npx playwright test --headed --project="Desktop Chrome" tests/issueN-name.spec.ts
```

**Screenshot review checklist:**

- [ ] Screenshots exist in `e2e/.shots/` for all key states
- [ ] Desktop and mobile variants look correct (no clipping, overlap, or broken layout)
- [ ] Text is readable, icons render properly
- [ ] Compare against the issue description — does the visual match the expected outcome?

## Step 5 — PR

1. **Commit with Conventional Commits:** `type(scope): description` + `Closes #N` footer (see [Commit Rules](workflow.md#commit-rules)).
2. **Push and create the PR** — title follows conventional commit format.
3. **Fill the PR template** — the E2E testing section now has concrete checkboxes.
4. **Reference screenshots in the PR body** — paste key screenshots so reviewers can see the visual result without running tests locally.

## Decision Matrix

What test type does each change require?

| Change type | Unit test (Go / Vitest) | E2E spec | Screenshots |
|---|---|---|---|
| **Bug fix (logic)** | Required | Only if UI-visible | Only if visual change |
| **Bug fix (UI / visual)** | — | Required | Required |
| **New feature** | Required | Required | Required |
| **Style / CSS only** | — | Required | Required (desktop + mobile) |
| **Refactor** | Required | Regression E2E if behavior changes | Only if visual impact |
| **Docs / chore** | — | — | — |

**When in doubt:** add the E2E spec and screenshots. They cost nothing to have and catch regressions.

## Examples

Study these specs for patterns:

- **`e2e/tests/issue11-autoexpand.spec.ts`** — state progression with screenshots at each step
- **`e2e/tests/issue13-tristate.spec.ts`** — tri-state cycling with height assertions + screenshots
- **`e2e/tests/git-status-project-header.spec.ts`** — component-level screenshot (desktop + mobile)
