import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createSessionsPage } from './index.js';

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
    });

    it('avoids opening duplicate EventSource connections when called twice', () => {
      const page = createSessionsPage();
      page.subscribe();
      expect(mockInstances.length).toBe(1);
      const first = mockInstances[0];
      page.subscribe();
      expect(mockInstances.length).toBe(2);
      expect(first.close).toHaveBeenCalled();
      expect(page._es).toBe(mockInstances[1]);
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
  });
});
