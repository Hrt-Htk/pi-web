<script>
  // Live reload (SSE) — drives the streaming chat preview, follow/scroll, stats,
  // and reconciles the shared reactive model when the session JSONL changes. The
  // Svelte <SessionContent> owns #messages and re-renders from the model, so this
  // never patches the message DOM (reactive-only): on reload it reconciles the
  // model through the session runtime context and only tracks brand-new ids for the
  // follow/scroll/highlight decisions. Live-only: never imported by the static
  // export bundle.
  //
  // Absorbed from live-reload-runner.js + live-events/live-scroll/live-stats
  // during the Svelte migration teardown (docs/dev/svelte-migration-plan.md §11).
  // SSE, follow-scroll, stats, and chat-preview helpers live in session/live/
  // modules with focused unit tests.
  import { onMount } from 'svelte';
  import { marked } from 'marked';
  import { escapeHtml } from '../../session/render/session-format.js';
  import { safeMarkedParse } from '../../session/render/markdown.js';
  import {
    clearChatPreviewState,
    finishChatPreviewState,
    renderChatPreviewState,
    renderPendingChatState,
  } from '../../session/live/chat-preview.js';
  import {
    getSessionIdFromLocation,
    handleSessionReload,
  } from '../../session/live/live-events.js';
  import { setupSessionLiveConnection } from '../../session/live/live-connection.js';
  import {
    createFollowButton,
    isAtBottom,
    removeFollowButton,
    scrollElementAboveComposer,
    scrollToBottom,
    setFollowButtonText,
  } from '../../session/live/live-scroll.js';
  import { updateStatsDom } from '../../session/live/live-stats.js';
  import { sessionRuntime } from '../../session/session-runtime.js';
  import { getSessionRuntime } from '../../session/session-runtime-context.js';

  onMount(() => {
    const documentImpl = document;
    const windowImpl = window;
    const runtime = getSessionRuntime();
    const model = runtime.model;
    const reconcileEntries = runtime.reconcileEntries || (() => {});
    globalThis.__PI_TEST_LIVE_RELOAD_HOOK__?.();

    const fetchImpl = windowImpl.fetch.bind(windowImpl);
    const requestAnimationFrame = windowImpl.requestAnimationFrame.bind(windowImpl);
    const setTimeout = windowImpl.setTimeout.bind(windowImpl);

    const cleanups = [];
    const on = (host, type, handler, opts) => {
      host.addEventListener(type, handler, opts);
      cleanups.push(() => host.removeEventListener(type, handler, opts));
    };

    // Markdown for the streaming preview — globally-configured (sanitized) marked
    // with an escapeHtml fallback (matches the former live-renderer.renderMarkdown).
    const renderMarkdown = (text) => {
      try { return safeMarkedParse(text, { marked }); }
      catch { return escapeHtml(text, { documentImpl }); }
    };

    // New-entry highlight (after Svelte renders the reactive path).
    function highlightNewEntry(node) {
      node.classList.add('new-entry-highlight');
      setTimeout(() => { node.classList.remove('new-entry-highlight'); }, 1500);
    }
    function highlightNewEntries(newIds) {
      requestAnimationFrame(() => {
        newIds.forEach((id) => {
          const el = documentImpl.getElementById('entry-' + id);
          if (el) highlightNewEntry(el);
        });
      });
    }

    // "seen" set seeded from the model (the DOM may not be flushed yet at startup).
    const LIVE_ENTRY_STATE = {
      seen: new Set((model?.entries || []).map((e) => e.id).filter(Boolean)),
      liveRendered: new Set(),
    };

    // ── Follow mode (like terminal/chat) ───────────────────────────────────────
    let FOLLOW = true;
    let followBtn = null;
    let pendingCount = 0;
    let forcePreviewFollowUntil = 0;

    // The scroll helpers default to the real document/window, so they're called
    // directly here with the component-scoped dependencies only where needed.
    function showFollowButton() {
      if (followBtn) return;
      followBtn = createFollowButton({
        documentImpl,
        requestAnimationFrameImpl: requestAnimationFrame,
        onClick: () => {
          FOLLOW = true;
          pendingCount = 0;
          scrollToBottom(true);
          hideFollowButton();
        },
      });
      setFollowButtonText(followBtn, pendingCount);
    }
    function hideFollowButton() {
      if (!followBtn) return;
      removeFollowButton(followBtn, { windowImpl });
      followBtn = null;
    }

    let lastScrollTop = 0;
    const contentEl = documentImpl.getElementById('content');

    function getScrollPosition() {
      let scrolled = windowImpl.scrollY || windowImpl.pageYOffset || documentImpl.documentElement.scrollTop || documentImpl.body.scrollTop;
      if (contentEl && contentEl.scrollHeight > contentEl.clientHeight) {
        scrolled = Math.max(scrolled, contentEl.scrollTop);
      }
      return scrolled;
    }
    lastScrollTop = getScrollPosition();

    function disableFollowOnUserInteraction(e) {
      if (e.type === 'keydown') {
        const scrollingKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
        if (scrollingKeys.indexOf(e.key) === -1) return;
      }
      forcePreviewFollowUntil = 0;
      if (isAtBottom()) {
        FOLLOW = true;
        hideFollowButton();
      } else {
        FOLLOW = false;
        showFollowButton();
      }
    }

    function onScroll() {
      const currentScroll = getScrollPosition();
      const scrolledUp = currentScroll < lastScrollTop;
      lastScrollTop = currentScroll;
      FOLLOW = isAtBottom();
      if (scrolledUp) {
        // User manually scrolled up; release the forced follow so they can read
        // previous messages without being yanked back down.
        forcePreviewFollowUntil = 0;
        FOLLOW = false;
      }
      if (FOLLOW) {
        hideFollowButton();
        pendingCount = 0;
      } else {
        showFollowButton();
      }
    }

    on(windowImpl, 'scroll', onScroll, { passive: true });
    if (contentEl) on(contentEl, 'scroll', onScroll, { passive: true });
    on(windowImpl, 'wheel', disableFollowOnUserInteraction, { passive: true });
    on(windowImpl, 'touchmove', disableFollowOnUserInteraction, { passive: true });
    on(windowImpl, 'keydown', disableFollowOnUserInteraction, { passive: true });

    function scrollAfterLayout(smooth, target) {
      requestAnimationFrame(() => {
        scrollElementAboveComposer(target, !!smooth);
        setTimeout(() => { scrollElementAboveComposer(target, !!smooth); }, 40);
      });
    }
    function forceFollowToBottom(smooth) {
      FOLLOW = true;
      pendingCount = 0;
      hideFollowButton();
      scrollAfterLayout(!!smooth);
    }

    on(windowImpl, 'pi-chat-message-sent', (event) => {
      forcePreviewFollowUntil = Date.now() + 30000;
      if (event && event.detail && event.detail.message) {
        renderPendingChat(event.detail.message);
      } else {
        forceFollowToBottom(true);
      }
    });

    scrollToBottom(false);

    function updateStats(entries) {
      return updateStatsDom(entries, { documentImpl });
    }
    function updateTitle(name) {
      const title = String(name || '').trim();
      if (!title) return;
      const titleEl = documentImpl.getElementById('session-header-title');
      if (titleEl) titleEl.textContent = title;
      documentImpl.title = title;
    }

    const sessId = getSessionIdFromLocation({ locationImpl: windowImpl.location });

    // ── Streaming chat preview ─────────────────────────────────────────────────
    const CHAT_PREVIEW_STATE = { chatPreviewEl: null, pendingUserEl: null };

    function clearChatPreview() {
      const statusEl = documentImpl.getElementById('pi-chat-status');
      const isChatRunning = statusEl && statusEl.classList.contains('running');
      const hasDoneClass = CHAT_PREVIEW_STATE.chatPreviewEl && CHAT_PREVIEW_STATE.chatPreviewEl.classList.contains('done');
      const keepAssistant = !!(isChatRunning && !hasDoneClass);
      return clearChatPreviewState(CHAT_PREVIEW_STATE, { keepAssistant });
    }
    function finishChatPreview() {
      finishChatPreviewState(CHAT_PREVIEW_STATE);
    }
    const shouldFollow = () => FOLLOW || Date.now() < forcePreviewFollowUntil;
    function renderChatPreview(payload) {
      return renderChatPreviewState(payload, CHAT_PREVIEW_STATE, {
        documentImpl, windowImpl, renderMarkdown, shouldFollow, forceFollowToBottom, scrollAfterLayout,
      });
    }
    function renderPendingChat(message) {
      return renderPendingChatState(message, CHAT_PREVIEW_STATE, {
        documentImpl, windowImpl, renderMarkdown, shouldFollow, forceFollowToBottom, scrollAfterLayout,
      });
    }

    // ── Reload (fetch /api/session → reconcile the model) ──────────────────────
    function triggerReload() {
      return handleSessionReload({
        sessionId: sessId,
        fetchImpl,
        entryState: LIVE_ENTRY_STATE,
        clearChatPreview,
        // Reactive mode: the Svelte model owns #messages, so no DOM patchers.
        updateStats,
        updateTitle,
        isFollowing: () => FOLLOW,
        scrollAfterLayout,
        incrementPending: (count) => { pendingCount += count; },
        showFollowButton,
        onReloaded: (data) => { reconcileEntries(data.entries); },
        onNewEntries: highlightNewEntries,
      }).catch((err) => { console.error('Live update failed:', err); });
    }

    on(windowImpl, 'pi-worker-done', () => {
      // If the final filesystem reload is missed/delayed, don't leave the
      // streaming preview "working"; proactively reconcile from /api/session.
      finishChatPreview();
      triggerReload();
    });

    const liveConnection = setupSessionLiveConnection({
      documentImpl,
      windowImpl,
      sessionId: sessId,
      onReload: triggerReload,
      onChatPreview: renderChatPreview,
      onAnnotations: (list) => sessionRuntime.annotations?.setAnnotations(list),
    });
    liveConnection.connect();
    cleanups.push(liveConnection.dispose);

    return () => {
      for (const fn of cleanups) fn();
    };
  });
</script>
