import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createChatToolbarState, isRunningStatus } from './toolbar-state.js';

function setupDom() {
  return new JSDOM('<body><span id="pi-chat-status"></span><button id="pi-chat-cancel" style="display:none"></button><button id="pi-chat-model-label"></button><button id="pi-chat-thinking-label"></button></body>');
}

describe('chat toolbar state', () => {
  it('detects statuses that should expose cancel', () => {
    expect(isRunningStatus('sending', '')).toBe(true);
    expect(isRunningStatus('idle', 'running')).toBe(true);
    expect(isRunningStatus('idle', '')).toBe(false);
  });

  it('updates status text, class, and cancel visibility', () => {
    const dom = setupDom();
    const toolbar = createChatToolbarState({ documentImpl: dom.window.document });

    toolbar.setStatus('sending', 'running');
    expect(dom.window.document.getElementById('pi-chat-status').textContent).toBe('sending');
    expect(dom.window.document.getElementById('pi-chat-status').className).toBe('pi-chat-status running');
    expect(dom.window.document.getElementById('pi-chat-cancel').style.display).toBe('');

    toolbar.setStatus('cancelling', 'running');
    expect(dom.window.document.getElementById('pi-chat-cancel').disabled).toBe(true);

    toolbar.setStatus('idle', '');
    expect(dom.window.document.getElementById('pi-chat-cancel').style.display).toBe('none');
    expect(dom.window.document.getElementById('pi-chat-cancel').disabled).toBe(false);
  });

  it('updates model label, placeholder, tooltip, and context usage', () => {
    const dom = setupDom();
    const updateContextUsage = vi.fn();
    const toolbar = createChatToolbarState({
      documentImpl: dom.window.document,
      isMobileTextInputMode: () => false,
      updateContextUsage,
    });

    toolbar.setModelLabel('');
    const modelBtn = dom.window.document.getElementById('pi-chat-model-label');
    expect(modelBtn.textContent).toBe('Model');
    expect(modelBtn.style.display).toBe('');
    expect(modelBtn.getAttribute('title')).toBe('Switch model (Ctrl+I)');
    expect(updateContextUsage).toHaveBeenCalledTimes(1);

    toolbar.setModelLabel('gpt-4o @ openai');
    expect(modelBtn.textContent).toBe('gpt-4o @ openai');
    expect(updateContextUsage).toHaveBeenCalledTimes(2);
  });

  it('uses mobile tooltips and updates thinking label class', () => {
    const dom = setupDom();
    const toolbar = createChatToolbarState({
      documentImpl: dom.window.document,
      isMobileTextInputMode: () => true,
    });

    toolbar.updateInitialTooltips();
    expect(dom.window.document.getElementById('pi-chat-model-label').getAttribute('title')).toBe('Switch model');
    expect(dom.window.document.getElementById('pi-chat-thinking-label').getAttribute('title')).toBe('Switch effort');

    toolbar.setThinkingLabel('high');
    const thinkingBtn = dom.window.document.getElementById('pi-chat-thinking-label');
    expect(thinkingBtn.textContent).toBe('high');
    expect(thinkingBtn.className).toBe('pi-chat-thinking-label thinking-high');
    expect(thinkingBtn.style.display).toBe('');

    toolbar.setThinkingLabel('');
    expect(thinkingBtn.style.display).toBe('none');
  });
});
