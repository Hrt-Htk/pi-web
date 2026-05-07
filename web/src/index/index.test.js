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

describe('createSessionsPage', () => {
  it('creates the sessions page Alpine state object', () => {
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

  it('applies running class to cards with running worker status', async () => {
    mountSessionCards();
    const fetchImpl = vi.fn(async (url) => {
      if (url === '/api/worker-status?id=alpha.jsonl') {
        return new Response(JSON.stringify({ state: 'running' }), { status: 200 });
      }
      return new Response(JSON.stringify({ state: 'idle' }), { status: 200 });
    });
    const page = createSessionsPage({ fetchImpl, pollIntervalMs: 25 });

    await page.refreshRunningStatuses();

    expect(document.querySelector('[data-session-id="alpha.jsonl"]')?.classList.contains('session-card--running')).toBe(true);
    expect(document.querySelector('[data-session-id="beta.jsonl"]')?.classList.contains('session-card--running')).toBe(false);
  });

  it('removes running class when a running session becomes idle', async () => {
    mountSessionCards();
    let currentState = 'running';
    const fetchImpl = vi.fn(async (url) => new Response(JSON.stringify({ state: url.includes('alpha.jsonl') ? currentState : 'idle' }), { status: 200 }));
    const page = createSessionsPage({ fetchImpl, pollIntervalMs: 25 });

    await page.refreshRunningStatuses();
    expect(document.querySelector('[data-session-id="alpha.jsonl"]')?.classList.contains('session-card--running')).toBe(true);

    currentState = 'idle';
    await page.refreshRunningStatuses();

    expect(document.querySelector('[data-session-id="alpha.jsonl"]')?.classList.contains('session-card--running')).toBe(false);
  });

  it('clears running class when worker status fetch fails', async () => {
    mountSessionCards();
    let fail = false;
    const fetchImpl = vi.fn(async (url) => {
      if (!url.includes('alpha.jsonl')) {
        return new Response(JSON.stringify({ state: 'idle' }), { status: 200 });
      }
      if (fail) return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
      return new Response(JSON.stringify({ state: 'running' }), { status: 200 });
    });
    const page = createSessionsPage({ fetchImpl, pollIntervalMs: 25 });

    await page.refreshRunningStatuses();
    expect(document.querySelector('[data-session-id="alpha.jsonl"]')?.classList.contains('session-card--running')).toBe(true);

    fail = true;
    await page.refreshRunningStatuses();

    expect(document.querySelector('[data-session-id="alpha.jsonl"]')?.classList.contains('session-card--running')).toBe(false);
  });

  it('only polls visible session cards', async () => {
    mountSessionCards();
    document.querySelector('[data-session-id="beta.jsonl"]')?.classList.add('hidden');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ state: 'idle' }), { status: 200 }));
    const page = createSessionsPage({ fetchImpl, pollIntervalMs: 25 });

    await page.refreshRunningStatuses();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('/api/worker-status?id=alpha.jsonl');
  });

  describe('subscribe', () => {
    let OriginalEventSource;
    let mockInstances;

    beforeEach(() => {
      OriginalEventSource = globalThis.EventSource;
      mockInstances = [];
      globalThis.EventSource = vi.fn(function (url) {
        this.url = url;
        this.onmessage = null;
        this.close = vi.fn();
        mockInstances.push(this);
      });
    });

    afterEach(() => {
      globalThis.EventSource = OriginalEventSource;
      vi.useRealTimers();
      document.body.innerHTML = '';
    });

    it('avoids opening duplicate EventSource connections when called twice', () => {
      const page = createSessionsPage();
      page.subscribe();
      expect(mockInstances.length).toBe(2);
      const firstAll = mockInstances[0];
      const firstStatus = mockInstances[1];
      page.subscribe();
      expect(mockInstances.length).toBe(4);
      expect(firstAll.close).toHaveBeenCalled();
      expect(firstStatus.close).toHaveBeenCalled();
      expect(page._es).toBe(mockInstances[2]);
      expect(page._statusEs).toBe(mockInstances[3]);
    });

    it('removes the old beforeunload listener when called twice', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const page = createSessionsPage();
      page.subscribe();
      expect(addSpy).toHaveBeenCalledTimes(1);
      expect(addSpy).toHaveBeenLastCalledWith('beforeunload', expect.any(Function));
      const firstHandler = addSpy.mock.calls[0][1];
      page.subscribe();
      expect(removeSpy).toHaveBeenCalledWith('beforeunload', firstHandler);
      expect(addSpy).toHaveBeenCalledTimes(2);
      addSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('closes status EventSource during cleanup', () => {
      mountSessionCards();
      const page = createSessionsPage();
      page.subscribe();
      const statusEs = mockInstances[1];
      expect(statusEs.close).not.toHaveBeenCalled();
      page.cleanup();
      expect(statusEs.close).toHaveBeenCalled();
    });
  });

  describe('SSE batch status', () => {
    let OriginalEventSource;
    let mockInstances;

    beforeEach(() => {
      OriginalEventSource = globalThis.EventSource;
      mockInstances = [];
      globalThis.EventSource = vi.fn(function (url) {
        this.url = url;
        this.onmessage = null;
        this.onerror = null;
        this.close = vi.fn();
        this.readyState = 1; // OPEN
        mockInstances.push(this);
      });
      globalThis.EventSource.CLOSED = 2;
    });

    afterEach(() => {
      globalThis.EventSource = OriginalEventSource;
      document.body.innerHTML = '';
    });

    it('opens EventSource with ids query param for visible cards', () => {
      mountSessionCards();
      const page = createSessionsPage();
      page.subscribe();

      // First EventSource is for __all__ (new-session detection)
      // Second EventSource is for batch status
      expect(mockInstances.length).toBe(2);
      const statusEs = mockInstances[1];
      expect(statusEs.url).toContain('/events?ids=');
      expect(statusEs.url).toContain('alpha.jsonl');
      expect(statusEs.url).toContain('beta.jsonl');
    });

    it('updates running classes on status event', () => {
      mountSessionCards();
      const page = createSessionsPage();
      page.subscribe();

      const statusEs = mockInstances[1];
      statusEs.onmessage({
        data: JSON.stringify({
          'alpha.jsonl': { state: 'running' },
          'beta.jsonl': { state: 'idle' }
        })
      });

      expect(document.querySelector('[data-session-id="alpha.jsonl"]')?.classList.contains('session-card--running')).toBe(true);
      expect(document.querySelector('[data-session-id="beta.jsonl"]')?.classList.contains('session-card--running')).toBe(false);
    });

    it('reconnects status stream when filter changes visible set', () => {
      mountSessionCards();
      const page = createSessionsPage();
      page.subscribe();
      expect(mockInstances.length).toBe(2);

      // Filter to only show beta
      page.query = 'beta';
      page.filter();

      // Should have closed old status stream and opened new one
      expect(mockInstances.length).toBe(3);
      const newStatusEs = mockInstances[2];
      expect(newStatusEs.url).toContain('beta.jsonl');
      expect(newStatusEs.url).not.toContain('alpha.jsonl');
    });

    it('falls back to polling when EventSource errors', async () => {
      mountSessionCards();
      vi.useFakeTimers();
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ state: 'idle' }), { status: 200 }));
      const page = createSessionsPage({ fetchImpl, pollIntervalMs: 25 });

      page.subscribe();
      expect(mockInstances.length).toBe(2);

      // Simulate SSE error
      const statusEs = mockInstances[1];
      statusEs.readyState = 2; // CLOSED
      statusEs.onerror();

      // Wait for fallback timeout
      await vi.advanceTimersByTimeAsync(6000);
      expect(fetchImpl).toHaveBeenCalled();
    });
  });
});
