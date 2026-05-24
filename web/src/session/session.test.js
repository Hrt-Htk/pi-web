import { describe, expect, it, vi } from 'vitest';
import { sessionEntrypointLoaded, runSessionApp } from './session.js';

describe('session entrypoint', () => {
  it('exports a load marker for smoke testing', () => {
    expect(sessionEntrypointLoaded).toBe(true);
  });

  it('owns direct module runtime bootstrap', () => {
    expect(runSessionApp).toBeInstanceOf(Function);
  });

  it('initializes live reload before chat so optimistic send events are observed', () => {
    const calls = [];
    const target = {
      document: {
        getElementById: vi.fn((id) => {
          if (id === 'session-data') return { textContent: btoa(JSON.stringify({ entries: [] })) };
          if (id === 'content') return { addEventListener: vi.fn() };
          return null;
        }),
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => []),
        addEventListener: vi.fn(),
        createElement: vi.fn(() => ({ textContent: '', innerHTML: '' })),
        body: { appendChild: vi.fn(), classList: { toggle: vi.fn() }, scrollHeight: 0 },
        documentElement: { scrollHeight: 0 },
        readyState: 'complete'
      },
      location: { search: '' },
      atob: (value) => Buffer.from(value, 'base64').toString('utf8'),
      marked: { parse: (value) => value },
      fetch: vi.fn(),
      EventSource: class EventSource { constructor() { this.readyState = 1; this.addEventListener = vi.fn(); this.close = vi.fn(); } },
      requestAnimationFrame: vi.fn((fn) => fn()),
      scrollTo: vi.fn(),
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
      setInterval: vi.fn(),
      matchMedia: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
      addEventListener: vi.fn(),
      navigator: {},
      CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
      FormData: class FormData {},
      URLSearchParams,
      __piSessionDataModel: {
        entries: [],
        byId: new Map(),
        toolCallMap: new Map(),
        leafId: '',
        urlTargetId: '',
        header: { cwd: '/tmp' }
      }
    };

    const original = {
      live: globalThis.__PI_TEST_LIVE_RELOAD_HOOK__,
      chat: globalThis.__PI_TEST_CHAT_COMPOSER_HOOK__
    };
    globalThis.__PI_TEST_LIVE_RELOAD_HOOK__ = () => calls.push('live');
    globalThis.__PI_TEST_CHAT_COMPOSER_HOOK__ = () => calls.push('chat');
    try {
      runSessionApp({ target });
    } finally {
      globalThis.__PI_TEST_LIVE_RELOAD_HOOK__ = original.live;
      globalThis.__PI_TEST_CHAT_COMPOSER_HOOK__ = original.chat;
    }

    expect(calls).toEqual(['live', 'chat']);
  });
});
