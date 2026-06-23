// Reactive store for the tool detail bottom-sheet overlay.
// Only one sheet open at a time.

let state = $state({ open: false, chip: null, summary: '', model: null });

/** Open the tool sheet for a chip. */
export function openToolSheet({ chip, summary, model }) {
  state = { open: true, chip, summary, model };
}

/** Close the tool sheet. */
export function closeToolSheet() {
  state = { open: false, chip: null, summary: '', model: null };
}

/** Get the current sheet state (reactive reference). */
export function getToolSheet() {
  return state;
}
