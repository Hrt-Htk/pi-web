import {
  createFollowButton,
  isAtBottom,
  removeFollowButton,
  scrollToBottom,
  setFollowButtonText,
} from './live-scroll.js';

// Owns the follow-scroll decision for the live session viewer: keep the view
// pinned to the bottom while the user is at (within threshold of) the bottom,
// and stop the moment they scroll up.
//
// New content arrives via two async paths — the Svelte <SessionContent>
// reconcile and the imperative streaming chat preview — and both grow the DOM
// after their callbacks return. Rather than racing that render timing with a
// fixed delay (which under-scrolled when the new content landed late), we
// observe the growing containers with a ResizeObserver and re-pin AFTER layout
// settles.
//
// Two guards keep the decision honest:
//   • `pinning` — set while we (or the reflow our scroll triggers) move the
//     viewport, so the resulting 'scroll' events don't get mistaken for the
//     user leaving the bottom and latch follow mode off.
//   • `suppressPinUntil` — a short window opened when the user signals up-intent
//     (wheel-up / touch / Up keys), during which the constant streaming pins are
//     suppressed so the user isn't yanked back down while reading.
export function createFollowScrollController({
  documentImpl = document,
  windowImpl = window,
  requestAnimationFrameImpl = windowImpl.requestAnimationFrame.bind(windowImpl),
  setTimeoutImpl = windowImpl.setTimeout.bind(windowImpl),
  ResizeObserverImpl = windowImpl.ResizeObserver,
} = {}) {
  const scrollImpls = { documentImpl, windowImpl };
  const SUPPRESS_MS = 600;
  const PIN_GUARD_MS = 120;
  let following = true;
  let pinning = false;
  let followBtn = null;
  let pendingCount = 0;
  let forcePreviewFollowUntil = 0;
  let suppressPinUntil = 0;
  const contentEl = documentImpl.getElementById('content');
  const cleanups = [];
  const on = (host, type, handler, opts) => {
    host.addEventListener(type, handler, opts);
    cleanups.push(() => host.removeEventListener(type, handler, opts));
  };

  function showFollowButton() {
    if (followBtn) return;
    followBtn = createFollowButton({
      documentImpl,
      requestAnimationFrameImpl,
      onClick: () => {
        forceFollowToBottom(true);
      },
    });
    setFollowButtonText(followBtn, pendingCount);
  }
  function hideFollowButton() {
    if (!followBtn) return;
    removeFollowButton(followBtn, { windowImpl });
    followBtn = null;
  }

  function setFollowing(next) {
    following = next;
    if (following) {
      hideFollowButton();
      pendingCount = 0;
    } else {
      forcePreviewFollowUntil = 0;
      showFollowButton();
    }
  }

  // The user wants to leave the bottom. Drop the pin guard so reality is
  // observed, stop following, and hold off re-pinning for a beat so an in-flight
  // streaming pin can't immediately drag them back down.
  function userScrolledUp() {
    pinning = false;
    suppressPinUntil = Date.now() + SUPPRESS_MS;
    setFollowing(false);
  }

  function onScroll() {
    if (pinning) return;
    setFollowing(isAtBottom(scrollImpls));
  }

  function onWheel(e) {
    if (e.deltaY < 0) userScrolledUp();
    else if (!pinning) setFollowing(isAtBottom(scrollImpls));
  }

  function onTouchMove() {
    if (!isAtBottom(scrollImpls)) userScrolledUp();
  }

  function onKeyDown(e) {
    if (['ArrowUp', 'PageUp', 'Home'].indexOf(e.key) !== -1) {
      userScrolledUp();
    } else if (!pinning && ['ArrowDown', 'PageDown', 'End', ' '].indexOf(e.key) !== -1) {
      setFollowing(isAtBottom(scrollImpls));
    }
  }

  // Scroll to the bottom and hold the pin guard up long enough that the
  // asynchronously-dispatched 'scroll' event our scroll triggers is ignored. The
  // rAF pass re-pins once layout has flushed, unless the user scrolled up in the
  // meantime.
  function pinToBottom(smooth) {
    if (Date.now() < suppressPinUntil) return;
    pinning = true;
    scrollToBottom(!!smooth, scrollImpls);
    requestAnimationFrameImpl(() => {
      if (Date.now() < suppressPinUntil) {
        pinning = false;
        return;
      }
      scrollToBottom(!!smooth, scrollImpls);
    });
    setTimeoutImpl(() => {
      pinning = false;
    }, PIN_GUARD_MS);
  }

  // Re-pin after the DOM grows, but only while we should be following.
  function pin() {
    if (following || Date.now() < forcePreviewFollowUntil) {
      pinToBottom(false);
    }
  }

  function forceFollowToBottom(smooth) {
    following = true;
    pendingCount = 0;
    suppressPinUntil = 0;
    hideFollowButton();
    pinToBottom(!!smooth);
  }

  on(windowImpl, 'scroll', onScroll, { passive: true });
  if (contentEl) on(contentEl, 'scroll', onScroll, { passive: true });
  on(windowImpl, 'wheel', onWheel, { passive: true });
  on(windowImpl, 'touchmove', onTouchMove, { passive: true });
  on(windowImpl, 'keydown', onKeyDown, { passive: true });

  if (ResizeObserverImpl) {
    const ro = new ResizeObserverImpl(() => pin());
    const messagesEl = documentImpl.getElementById('messages');
    const previewHost = documentImpl.getElementById('chat-preview-host');
    if (messagesEl) ro.observe(messagesEl);
    if (previewHost) ro.observe(previewHost);
    if (contentEl) ro.observe(contentEl);
    cleanups.push(() => ro.disconnect());
  }

  scrollToBottom(false, scrollImpls);

  return {
    isFollowing: () => following,
    shouldFollow: () => following || Date.now() < forcePreviewFollowUntil,
    extendPreviewFollow: (ms = 30000) => {
      following = true;
      suppressPinUntil = 0;
      forcePreviewFollowUntil = Date.now() + ms;
    },
    incrementPending: (count) => {
      pendingCount += count;
    },
    showFollowButton,
    forceFollowToBottom,
    // Kept for the reconcile/preview callers; the ResizeObserver is the primary
    // re-pin path, this just nudges to the bottom on the next frame.
    scrollAfterLayout: () => {
      requestAnimationFrameImpl(() => pin());
    },
    dispose: () => {
      for (const fn of cleanups) fn();
    },
  };
}
