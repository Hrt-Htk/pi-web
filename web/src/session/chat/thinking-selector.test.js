import { describe, expect, it, vi } from 'vitest';
import { setupThinkingLevelSelector } from './thinking-selector.js';

function createDom() {
  const div = document.createElement('div');
  div.innerHTML = `
    <button id="pi-chat-thinking-label">off</button>
    <div id="pi-chat-thinking-popup" style="display:none"></div>
    <div id="pi-chat-thinking-list"></div>
  `;
  document.body.appendChild(div);
  return div;
}

function cleanupDom(el) {
  el.remove();
}

describe('setupThinkingLevelSelector', () => {
  it('returns { open, close, cycle } API', () => {
    const el = createDom();
    const api = setupThinkingLevelSelector({ documentImpl: document });
    expect(api).toHaveProperty('open');
    expect(api).toHaveProperty('close');
    expect(api).toHaveProperty('cycle');
    cleanupDom(el);
  });

  it('returns false when required elements are missing', () => {
    const api = setupThinkingLevelSelector({ documentImpl: document });
    expect(api).toBe(false);
  });

  describe('cycle', () => {
    it('calls setThinkingLevel with the next level and updates labels on success', async () => {
      const el = createDom();
      const chatApi = {
        setThinkingLevel: vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ thinkingLevel: 'minimal' }),
        }),
      };
      const setKnownThinkingLevel = vi.fn();
      const setThinkingLabel = vi.fn();
      const setChatStatus = vi.fn();
      const getKnownThinkingLevel = () => 'off';

      const api = setupThinkingLevelSelector({
        documentImpl: document,
        sessionId: 'test-session',
        chatApi,
        getKnownThinkingLevel,
        setKnownThinkingLevel,
        setThinkingLabel,
        setChatStatus,
      });

      await api.cycle();

      expect(chatApi.setThinkingLevel).toHaveBeenCalledWith('test-session', 'minimal');
      expect(setKnownThinkingLevel).toHaveBeenCalledWith('minimal');
      expect(setThinkingLabel).toHaveBeenCalledWith('minimal');
      expect(setChatStatus).toHaveBeenCalledWith('thinking: minimal', 'ok');
      cleanupDom(el);
    });

    it('wraps around from last level to first', async () => {
      const el = createDom();
      const chatApi = {
        setThinkingLevel: vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ thinkingLevel: 'off' }),
        }),
      };
      const setKnownThinkingLevel = vi.fn();
      const getKnownThinkingLevel = () => 'xhigh';

      const api = setupThinkingLevelSelector({
        documentImpl: document,
        sessionId: 's',
        chatApi,
        getKnownThinkingLevel,
        setKnownThinkingLevel,
        setThinkingLabel: vi.fn(),
        setChatStatus: vi.fn(),
      });

      await api.cycle();
      expect(chatApi.setThinkingLevel).toHaveBeenCalledWith('s', 'off');
      cleanupDom(el);
    });

    it('skips unsupported levels for the current model', async () => {
      const el = createDom();
      const chatApi = {
        setThinkingLevel: vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ thinkingLevel: 'minimal' }),
        }),
      };
      const setKnownThinkingLevel = vi.fn();
      const getKnownThinkingLevel = () => 'off';

      // Model that only supports 'off' and 'minimal'
      const getCurrentModel = () => ({
        reasoning: true,
        thinkingLevelMap: { low: null, medium: null, high: null, xhigh: null },
      });

      const api = setupThinkingLevelSelector({
        documentImpl: document,
        sessionId: 's',
        chatApi,
        getKnownThinkingLevel,
        getCurrentModel,
        setKnownThinkingLevel,
        setThinkingLabel: vi.fn(),
        setChatStatus: vi.fn(),
      });

      await api.cycle();
      // Should skip 'low' and land on 'minimal'
      expect(chatApi.setThinkingLevel).toHaveBeenCalledWith('s', 'minimal');
      cleanupDom(el);
    });

    it('no-ops when only one level is supported', async () => {
      const el = createDom();
      const chatApi = { setThinkingLevel: vi.fn() };
      const getCurrentModel = () => ({
        reasoning: false,
      });

      const api = setupThinkingLevelSelector({
        documentImpl: document,
        sessionId: 's',
        chatApi,
        getKnownThinkingLevel: () => 'off',
        getCurrentModel,
        setKnownThinkingLevel: vi.fn(),
        setThinkingLabel: vi.fn(),
        setChatStatus: vi.fn(),
      });

      await api.cycle();
      // Only 'off' supported — no call
      expect(chatApi.setThinkingLevel).not.toHaveBeenCalled();
      cleanupDom(el);
    });

    it('cycles from unknown level (empty string) to first supported level', async () => {
      const el = createDom();
      const chatApi = {
        setThinkingLevel: vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ thinkingLevel: 'off' }),
        }),
      };
      const getKnownThinkingLevel = () => '';
      const getCurrentModel = () => ({ reasoning: false });

      const api = setupThinkingLevelSelector({
        documentImpl: document,
        sessionId: 's',
        chatApi,
        getKnownThinkingLevel,
        getCurrentModel,
        setKnownThinkingLevel: vi.fn(),
        setThinkingLabel: vi.fn(),
        setChatStatus: vi.fn(),
      });

      await api.cycle();
      // '' not in supported list, idx = -1, (-1+1)%1 = 0 → next = 'off'
      expect(chatApi.setThinkingLevel).toHaveBeenCalledWith('s', 'off');
      cleanupDom(el);
    });

    it('reports errors and reverts labels on failure', async () => {
      const el = createDom();
      const chatApi = {
        setThinkingLevel: vi.fn().mockResolvedValue({
          ok: false,
          json: () => Promise.resolve({ error: 'server error' }),
        }),
      };
      const setChatStatus = vi.fn();
      const setKnownThinkingLevel = vi.fn();
      const setThinkingLabel = vi.fn();

      const api = setupThinkingLevelSelector({
        documentImpl: document,
        sessionId: 's',
        chatApi,
        getKnownThinkingLevel: () => 'off',
        setKnownThinkingLevel,
        setThinkingLabel,
        setChatStatus,
      });

      await api.cycle();
      // Optimistic call with 'minimal' before API
      expect(setKnownThinkingLevel).toHaveBeenCalledWith('minimal');
      // Revert to original after failure
      expect(setKnownThinkingLevel).toHaveBeenCalledWith('off');
      expect(setThinkingLabel).toHaveBeenCalledWith('off');
      expect(setChatStatus).toHaveBeenCalledWith('server error', 'error');
      cleanupDom(el);
    });
  });
});
