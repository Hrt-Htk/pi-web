import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderChatPreviewState } from './chat-preview';

function makeDom() {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div id="messages"></div>
    <div id="chat-preview-host"></div>
  </body></html>`);
  return {
    documentImpl: dom.window.document,
    windowImpl: dom.window,
  };
}

describe('chat-preview thinking', () => {
  let dom, state, deps;

  beforeEach(() => {
    dom = makeDom();
    state = {
      chatPreviewEl: null,
      pendingUserEl: null,
      runningSpinnerEl: null,
      activePreviewMessage: null,
    };
    deps = {
      documentImpl: dom.documentImpl,
      renderMarkdown: (t) => `<p>${t}</p>`,
    };
  });

  it('shows thinking chip when only thinking is present', () => {
    const payload = { content: '', thinking: 'reasoning here', done: false };
    renderChatPreviewState(payload, state, deps);

    const thoughtChip = state.chatPreviewEl.querySelector('.chat-preview-thought');
    expect(thoughtChip).toBeTruthy();
    expect(thoughtChip.style.display).not.toBe('none');
    const label = thoughtChip.querySelector('.tool-chip-label');
    expect(label.textContent).toBe('Thought');

    const contentEl = state.chatPreviewEl.querySelector('.message-content');
    expect(contentEl.innerHTML).toBe('<p></p>');
  });

  it('shows both thinking chip and content', () => {
    const payload = { content: 'The answer', thinking: 'reasoning here', done: false };
    renderChatPreviewState(payload, state, deps);

    const thoughtChip = state.chatPreviewEl.querySelector('.chat-preview-thought');
    expect(thoughtChip).toBeTruthy();
    expect(thoughtChip.style.display).not.toBe('none');

    const contentEl = state.chatPreviewEl.querySelector('.message-content');
    expect(contentEl.innerHTML).toContain('The answer');
  });

  it('hides thinking chip when thinking is empty', () => {
    const payload = { content: 'The answer', thinking: '', done: false };
    renderChatPreviewState(payload, state, deps);

    const thoughtChip = state.chatPreviewEl.querySelector('.chat-preview-thought');
    expect(thoughtChip).toBeTruthy();
    expect(thoughtChip.style.display).toBe('none');
  });
});
