import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createSessionsPage } from './index.js';

function mountSessionCards() {
  document.body.innerHTML = `
    <div class="project-group">
      <div class="session-card" data-id="alpha.jsonl" data-session-id="alpha.jsonl" data-search="alpha"></div>
      <div class="session-card" data-id="beta.jsonl" data-session-id="beta.jsonl" data-search="beta"></div>
    </div>
  `;
}

class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.listeners = {};
    this.close = vi.fn();
    FakeEventSource.instances.push(this);
  }
  addEventListener(name, fn) {
    (this.listeners[name] ||= []).push(fn);
  }
  emit(name, data) {
    const evt = { data };
    if (name === 'message') {
      this.onmessage?.(evt);
      return;
    }
    for (const fn of this.listeners[name] || []) fn(evt);
  }
}
FakeEventSource.instances = [];

describe('createSessionsPage', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    globalThis.EventSource = FakeEventSource;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('creates the sessions page state object', () => {
    const page = createSessionsPage();
    expect(page).toMatchObject({ query: '', modal: false, path: '', recent: [], creating: false, error: '' });
    expect(typeof page.filter).toBe('function');
    expect(typeof page.openModal).toBe('function');
    expect(typeof page.create).toBe('function');
  });

  it('sets error and does not set creating when create() is called with blank path', async () => {
    const page = createSessionsPage();
    page.path = '   ';
    await page.create();
    expect(page.error).toBe('Please enter a path');
    expect(page.creating).toBe(false);
  });

  it('applies running class from a status-snapshot event', () => {
    mountSessionCards();
    const page = createSessionsPage();
    page.subscribe();
    const es = FakeEventSource.instances[0];

    es.emit('status-snapshot', JSON.stringify({ running: ['alpha.jsonl'] }));

    expect(document.querySelector('[data-session-id="alpha.jsonl"]').classList.contains('session-card--running')).toBe(true);
    expect(document.querySelector('[data-session-id="beta.jsonl"]').classList.contains('session-card--running')).toBe(false);
  });

  it('toggles running class on status-delta events', () => {
    mountSessionCards();
    const page = createSessionsPage();
    page.subscribe();
    const es = FakeEventSource.instances[0];

    es.emit('status-snapshot', JSON.stringify({ running: [] }));
    es.emit('status-delta', JSON.stringify({ id: 'beta.jsonl', running: true }));
    expect(document.querySelector('[data-session-id="beta.jsonl"]').classList.contains('session-card--running')).toBe(true);

    es.emit('status-delta', JSON.stringify({ id: 'beta.jsonl', running: false }));
    expect(document.querySelector('[data-session-id="beta.jsonl"]').classList.contains('session-card--running')).toBe(false);
  });

  it('reloads the page on a new-session message', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'location');
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload: reloadSpy },
    });
    try {
      const page = createSessionsPage();
      page.subscribe();
      const es = FakeEventSource.instances[0];
      es.emit('message', 'new-session');
      expect(reloadSpy).toHaveBeenCalled();
    } finally {
      if (original) Object.defineProperty(window, 'location', original);
    }
  });

  it('rebuilds running set on a fresh status-snapshot after reconnect', () => {
    mountSessionCards();
    const page = createSessionsPage();
    page.subscribe();
    const es = FakeEventSource.instances[0];
    es.emit('status-snapshot', JSON.stringify({ running: ['alpha.jsonl', 'beta.jsonl'] }));
    expect(document.querySelector('[data-session-id="alpha.jsonl"]').classList.contains('session-card--running')).toBe(true);

    page.subscribe();
    const es2 = FakeEventSource.instances[1];
    es2.emit('status-snapshot', JSON.stringify({ running: ['beta.jsonl'] }));
    expect(document.querySelector('[data-session-id="alpha.jsonl"]').classList.contains('session-card--running')).toBe(false);
    expect(document.querySelector('[data-session-id="beta.jsonl"]').classList.contains('session-card--running')).toBe(true);
  });

  it('closes the previous EventSource when subscribe is called twice', () => {
    const page = createSessionsPage();
    page.subscribe();
    const first = FakeEventSource.instances[0];
    page.subscribe();
    expect(first.close).toHaveBeenCalled();
    expect(FakeEventSource.instances.length).toBe(2);
  });
});
