import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { setupNewSessionButton, showNewSessionToast } from './new-session-button.js';

describe('new session button', () => {
  it('returns false when button is missing', () => {
    const dom = new JSDOM('<body></body>');
    const result = setupNewSessionButton({ documentImpl: dom.window.document, cwd: '/projects/foo', locationImpl: { href: '' } });
    expect(result).toBe(false);
  });

  it('shows toast notice', () => {
    const dom = new JSDOM('<body></body>');
    const state = {};
    showNewSessionToast('Something went wrong', state, {
      documentImpl: dom.window.document,
      setTimeoutImpl: () => {},
      clearTimeoutImpl: () => {}
    });
    const notice = dom.window.document.getElementById('new-session-toast');
    expect(notice.textContent).toBe('Something went wrong');
    expect(notice.classList.contains('toast-notice')).toBe(true);
    expect(notice.classList.contains('visible')).toBe(true);
  });

  it('posts to /api/new-session with cwd on click', async () => {
    const dom = new JSDOM('<body><button id="new-btn"><span>+</span>Session</button></body>');
    const fetchImpl = vi.fn(() => Promise.resolve({
      json: () => Promise.resolve({ ok: true, id: 'abc123.jsonl' })
    }));
    const locationImpl = { href: '' };
    setupNewSessionButton({
      documentImpl: dom.window.document,
      fetchImpl,
      locationImpl,
      cwd: '/projects/foo',
      sessionId: 'source.jsonl',
      state: {},
      setTimeoutImpl: () => {},
      clearTimeoutImpl: () => {}
    });
    dom.window.document.getElementById('new-btn').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchImpl).toHaveBeenCalledWith('/api/new-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/projects/foo', sourceSessionId: 'source.jsonl' })
    });
    expect(locationImpl.href).toBe('/session?id=abc123.jsonl');
  });

  it('shows working state while request is in flight', async () => {
    const dom = new JSDOM('<body><button id="new-btn"><span>+</span>Session</button></body>');
    let resolveRequest;
    const fetchImpl = vi.fn(() => new Promise(resolve => { resolveRequest = resolve; }));
    setupNewSessionButton({
      documentImpl: dom.window.document,
      fetchImpl,
      locationImpl: { href: '' },
      cwd: '/projects/foo',
      state: {},
      setTimeoutImpl: () => {},
      clearTimeoutImpl: () => {}
    });
    const btn = dom.window.document.getElementById('new-btn');
    btn.click();
    expect(btn.innerHTML).toContain('working-dots');
    expect(btn.disabled).toBe(true);
    resolveRequest({ json: () => Promise.resolve({ ok: true, id: 'x.jsonl' }) });
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  it('restores button text after API error', async () => {
    const dom = new JSDOM('<body><button id="new-btn"><span>+</span>Session</button></body>');
    const fetchImpl = vi.fn(() => Promise.resolve({
      json: () => Promise.resolve({ error: 'Directory not writable' })
    }));
    const state = {};
    setupNewSessionButton({
      documentImpl: dom.window.document,
      fetchImpl,
      locationImpl: { href: '' },
      cwd: '/projects/foo',
      state,
      setTimeoutImpl: (cb) => cb(),
      clearTimeoutImpl: () => {}
    });
    const btn = dom.window.document.getElementById('new-btn');
    btn.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(btn.innerHTML).toBe('<span>+</span>Session');
    expect(btn.disabled).toBe(false);
    const notice = dom.window.document.getElementById('new-session-toast');
    expect(notice.textContent).toBe('Directory not writable');
  });

  it('restores button text after network error', async () => {
    const dom = new JSDOM('<body><button id="new-btn"><span>+</span>Session</button></body>');
    const fetchImpl = vi.fn(() => Promise.reject(new Error('fetch failed')));
    const state = {};
    setupNewSessionButton({
      documentImpl: dom.window.document,
      fetchImpl,
      locationImpl: { href: '' },
      cwd: '/projects/foo',
      state,
      setTimeoutImpl: (cb) => cb(),
      clearTimeoutImpl: () => {}
    });
    const btn = dom.window.document.getElementById('new-btn');
    btn.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(btn.innerHTML).toBe('<span>+</span>Session');
    expect(btn.disabled).toBe(false);
    const notice = dom.window.document.getElementById('new-session-toast');
    expect(notice.textContent).toBe('fetch failed');
  });

  it('shows error toast when cwd is empty', () => {
    const dom = new JSDOM('<body><button id="new-btn"><span>+</span>Session</button></body>');
    const state = {};
    setupNewSessionButton({
      documentImpl: dom.window.document,
      locationImpl: { href: '' },
      cwd: '',
      state,
      setTimeoutImpl: (cb) => cb(),
      clearTimeoutImpl: () => {}
    });
    dom.window.document.getElementById('new-btn').click();
    const notice = dom.window.document.getElementById('new-session-toast');
    expect(notice.textContent).toBe('No working directory available for this session');
  });
});
