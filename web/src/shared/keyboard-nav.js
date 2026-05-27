const SCROLL_AMOUNT = 300;
const GG_TIMEOUT = 500; // ms window for double-tap 'gg'

/**
 * Returns true when the element is an input, textarea, select, or
 * contenteditable region where the user types text.
 */
export function isEditableTarget(element) {
  if (!element) return false;
  const tagName = element.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }
  return element.isContentEditable
    || Boolean(element.closest?.('[contenteditable="true"]'));
}

/**
 * Installs vim-style document-level keyboard navigation:
 *
 * 1. <kbd>Escape</kbd> blurs the active editable element so the user
 *    can then use the nav keys.
 * 2. <kbd>j</kbd> / <kbd>k</kbd> scroll down/up by SCROLL_AMOUNT px.
 * 3. <kbd>g g</kbd> (double-tap) scrolls to the very top of the page.
 * 4. <kbd>G</kbd> (shift+g) scrolls to the very bottom of the page.
 * 5. <kbd>I</kbd> (shift+i) focuses the main input box (chat composer).
 *
 * All scrolls use instant (no animation) for snappy vim-like feel.
 */
export function setupKeyboardNav({
  windowImpl = window,
  documentImpl = document,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  focusSelector = '#pi-chat-message',
} = {}) {
  let ggTimer = null;

  // Capture phase so Escape blurs the input *before* bubble-phase
  // handlers (e.g. close-menu, clear-search) see the event.
  documentImpl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const active = documentImpl.activeElement;
      if (isEditableTarget(active)) {
        e.preventDefault();
        e.stopPropagation();
        active.blur();
        return;
      }
    }
  }, { capture: true });

  documentImpl.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isEditableTarget(documentImpl.activeElement)) return;

    if (e.key === 'j') {
      e.preventDefault();
      windowImpl.scrollBy({ top: SCROLL_AMOUNT, behavior: 'instant' });
    } else if (e.key === 'k') {
      e.preventDefault();
      windowImpl.scrollBy({ top: -SCROLL_AMOUNT, behavior: 'instant' });
    } else if (e.key === 'g') {
      e.preventDefault();
      if (ggTimer) {
        // Second 'g' within timeout — scroll to top
        clearTimeoutImpl(ggTimer);
        ggTimer = null;
        windowImpl.scrollTo({ top: 0, behavior: 'instant' });
      } else {
        // First 'g' — start the double-tap window
        ggTimer = setTimeoutImpl(() => { ggTimer = null; }, GG_TIMEOUT);
      }
    } else if (e.key === 'G') {
      e.preventDefault();
      windowImpl.scrollTo({
        top: documentImpl.documentElement.scrollHeight,
        behavior: 'instant',
      });
    } else if (e.key === 'I') {
      e.preventDefault();
      const el = documentImpl.querySelector(focusSelector);
      if (el) el.focus();
    }
  });
}
