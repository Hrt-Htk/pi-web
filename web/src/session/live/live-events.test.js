import { describe, expect, it, vi } from 'vitest';
import {
  createSessionEventSource,
  getSessionIdFromLocation,
  handleSessionReload,
  wireSessionEvents,
} from './live-events.js';

describe('live events', () => {
  it('gets session id and creates event source', () => {
    expect(getSessionIdFromLocation({ locationImpl: { search: '?id=a%20b&x=1' } })).toBe('a%20b');
    const EventSourceImpl = vi.fn();
    createSessionEventSource('a b', { EventSourceImpl });
    expect(EventSourceImpl).toHaveBeenCalledWith('/events?id=a%20b');
  });

  it('handles reload entries, title, and follow behavior', async () => {
    const entries = [{ id: 'a' }, { id: 'r', message: { role: 'toolResult' } }];
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ name: 'New Title', entries }), { status: 200 }),
      ),
    );
    const entryState = { seen: new Set(), liveRendered: new Set() };
    const appendEntry = vi.fn((entry) => {
      entryState.seen.add(entry.id);
      return true;
    });
    const refresh = vi.fn();
    const updateStats = vi.fn();
    const updateTitle = vi.fn();
    const scrollAfterLayout = vi.fn();
    const onReloaded = vi.fn();

    const result = await handleSessionReload({
      sessionId: 's',
      fetchImpl,
      entryState,
      clearChatPreview: vi.fn(),
      appendEntry,
      upsertEntry: vi.fn(),
      refreshEntriesAffectedByToolResult: refresh,
      updateStats,
      updateTitle,
      isFollowing: () => true,
      scrollAfterLayout,
      onReloaded,
    });

    expect(fetchImpl).toHaveBeenCalledWith('/api/session?id=s');
    expect(result.newCount).toBe(2);
    expect(onReloaded).toHaveBeenCalledWith({ name: 'New Title', entries });
    expect(refresh).toHaveBeenCalledWith(entries[1], entries);
    expect(updateStats).toHaveBeenCalledWith(entries);
    expect(updateTitle).toHaveBeenCalledWith('New Title');
    expect(scrollAfterLayout).toHaveBeenCalledWith(true);
  });

  it('reconciles via the model in reactive mode (no DOM patching)', async () => {
    // No appendEntry/upsertEntry → the Svelte <SessionContent> owns #messages.
    // handleSessionReload only tracks new ids and flags them via onNewEntries.
    const entries = [{ id: 'a' }, { id: 'b', message: { role: 'assistant', content: 'reply' } }];
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ entries }), { status: 200 })),
    );
    const entryState = { seen: new Set(['a']), liveRendered: new Set() };
    const onReloaded = vi.fn();
    const onNewEntries = vi.fn();
    const scrollAfterLayout = vi.fn();
    const clearChatPreview = vi.fn();

    const result = await handleSessionReload({
      sessionId: 's',
      fetchImpl,
      entryState,
      clearChatPreview,
      isFollowing: () => true,
      scrollAfterLayout,
      onReloaded,
      onNewEntries,
    });

    expect(onReloaded).toHaveBeenCalledWith({ entries });
    expect(result.newCount).toBe(1);
    expect(entryState.seen.has('b')).toBe(true);
    expect(onNewEntries).toHaveBeenCalledWith(['b']);
    // Assistant entry with content arrived — preview should be cleared
    expect(clearChatPreview).toHaveBeenCalled();
    expect(scrollAfterLayout).toHaveBeenCalledWith(true);
  });

  it('does not clear chat preview when reload returns no new entries (stale data guard)', async () => {
    // When the worker hasn't flushed to disk yet, the reload fetches stale data
    // with no new entries. The preview should stay alive until a later reload
    // actually delivers the canonical entries.
    const entries = [{ id: 'welcome' }];
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ entries }), { status: 200 })),
    );
    const entryState = { seen: new Set(['welcome']), liveRendered: new Set() };
    const clearChatPreview = vi.fn();
    const onReloaded = vi.fn();

    const result = await handleSessionReload({
      sessionId: 's',
      fetchImpl,
      entryState,
      clearChatPreview,
      onReloaded,
    });

    expect(result.newCount).toBe(0);
    expect(clearChatPreview).not.toHaveBeenCalled();
  });

  it('does not clear preview when reload only brings user message (no assistant yet)', async () => {
    // The file-watcher reload may fire after the user message is written but
    // before the assistant reply. The streaming preview should stay alive.
    const entries = [
      { id: 'welcome' },
      { id: 'user-msg', message: { role: 'user', content: 'hello' } },
    ];
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ entries }), { status: 200 })),
    );
    const entryState = { seen: new Set(['welcome']), liveRendered: new Set() };
    const clearChatPreview = vi.fn();
    const clearPendingUser = vi.fn();
    const onReloaded = vi.fn();

    await handleSessionReload({
      sessionId: 's',
      fetchImpl,
      entryState,
      clearChatPreview,
      clearPendingUser,
      onReloaded,
    });

    // user message is new — pending user preview is cleared, full preview stays
    expect(clearChatPreview).not.toHaveBeenCalled();
    expect(clearPendingUser).toHaveBeenCalled();
  });

  it('clears pending user on reload that brings a new canonical user message', async () => {
    // A brand-new canonical user message arrived — the optimistic
    // #chat-pending-user is now redundant and should be removed while keeping
    // the streaming assistant preview alive.
    const entries = [
      { id: 'welcome' },
      { id: 'user-msg', message: { role: 'user', content: 'hello' } },
    ];
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ entries }), { status: 200 })),
    );
    const entryState = { seen: new Set(['welcome']), liveRendered: new Set() };
    const clearChatPreview = vi.fn();
    const clearPendingUser = vi.fn();
    const onReloaded = vi.fn();

    await handleSessionReload({
      sessionId: 's',
      fetchImpl,
      entryState,
      clearChatPreview,
      clearPendingUser,
      onReloaded,
    });

    expect(clearPendingUser).toHaveBeenCalledTimes(1);
    expect(clearChatPreview).not.toHaveBeenCalled();
  });

  it('clears preview when reload brings a canonical assistant entry with content', async () => {
    const entries = [
      { id: 'welcome' },
      { id: 'user-msg', message: { role: 'user', content: 'hello' } },
      { id: 'assistant-msg', message: { role: 'assistant', content: [{ type: 'text', text: 'Hi!' }] } },
    ];
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ entries }), { status: 200 })),
    );
    const entryState = { seen: new Set(['welcome']), liveRendered: new Set() };
    const clearChatPreview = vi.fn();
    const onReloaded = vi.fn();

    await handleSessionReload({
      sessionId: 's',
      fetchImpl,
      entryState,
      clearChatPreview,
      onReloaded,
    });

    // Assistant entry with content arrived — preview should be cleared
    expect(clearChatPreview).toHaveBeenCalled();
  });

  it('does not clear preview when assistant entry has no content', async () => {
    const entries = [
      { id: 'welcome' },
      { id: 'user-msg', message: { role: 'user', content: 'hello' } },
      { id: 'assistant-msg', message: { role: 'assistant', content: [] } },
    ];
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ entries }), { status: 200 })),
    );
    const entryState = { seen: new Set(['welcome']), liveRendered: new Set() };
    const clearChatPreview = vi.fn();
    const onReloaded = vi.fn();

    await handleSessionReload({
      sessionId: 's',
      fetchImpl,
      entryState,
      clearChatPreview,
      onReloaded,
    });

    // Assistant entry exists but has no content — preview stays alive
    expect(clearChatPreview).not.toHaveBeenCalled();
  });

  it('wires event source messages', () => {
    const eventSource = { addEventListener: vi.fn() };
    const onReload = vi.fn();
    const onChatPreview = vi.fn();
    const onError = vi.fn();
    wireSessionEvents({ eventSource, onReload, onChatPreview, onError });
    eventSource.onmessage({ data: 'noop' });
    eventSource.onmessage({ data: 'reload' });
    expect(onReload).toHaveBeenCalledTimes(1);
    const previewHandler = eventSource.addEventListener.mock.calls[0][1];
    previewHandler({ data: JSON.stringify({ content: 'x' }) });
    expect(onChatPreview).toHaveBeenCalledWith({ content: 'x' });
    previewHandler({ data: '{bad' });
    expect(onError).toHaveBeenCalled();
  });

  it('does not clear preview or reload on chat-preview done (real pi flushes after done)', () => {
    const eventSource = { addEventListener: vi.fn() };
    const onReload = vi.fn();
    const onChatPreview = vi.fn();
    const clearChatPreview = vi.fn();
    wireSessionEvents({ eventSource, onReload, onChatPreview, clearChatPreview });
    const previewHandler = eventSource.addEventListener.mock.calls[0][1];

    previewHandler({ data: JSON.stringify({ content: 'streaming', done: false }) });
    expect(onReload).not.toHaveBeenCalled();
    expect(clearChatPreview).not.toHaveBeenCalled();

    previewHandler({ data: JSON.stringify({ content: 'final', done: true }) });
    expect(onChatPreview).toHaveBeenLastCalledWith({ content: 'final', done: true });
    // done fires BEFORE disk flush — preview stays alive until file-watcher
    // reload brings the canonical assistant entry with content.
    expect(clearChatPreview).not.toHaveBeenCalled();
    expect(onReload).not.toHaveBeenCalled();
  });

  it('dispatches pi-session-reload window event on reload', () => {
    const eventSource = { addEventListener: vi.fn() };
    const dispatched = [];
    const windowImpl = {
      dispatchEvent: (e) => {
        dispatched.push(e);
        return true;
      },
    };
    class FakeCustomEvent {
      constructor(type) {
        this.type = type;
      }
    }
    wireSessionEvents({
      eventSource,
      onReload: vi.fn(),
      onChatPreview: vi.fn(),
      windowImpl,
      CustomEventImpl: FakeCustomEvent,
    });
    eventSource.onmessage({ data: 'reload' });
    expect(dispatched.length).toBe(1);
    expect(dispatched[0].type).toBe('pi-session-reload');
    eventSource.onmessage({ data: 'noop' });
    expect(dispatched.length).toBe(1);
  });
});
