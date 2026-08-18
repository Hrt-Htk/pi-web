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

  it('renders the thought chip as a clickable control', () => {
    const payload = { content: '', thinking: 'reasoning here', done: false };
    renderChatPreviewState(payload, state, deps);

    const thoughtChip = state.chatPreviewEl.querySelector('.chat-preview-thought');
    expect(thoughtChip.tagName).toBe('BUTTON');
    expect(thoughtChip.click).toBeTypeOf('function');
  });

  it('renders thinking into the thought body when present', () => {
    const payload = { content: 'The answer', thinking: 'step one', done: false };
    renderChatPreviewState(payload, state, deps);

    const body = state.chatPreviewEl.querySelector('.chat-preview-thought-body');
    expect(body).toBeTruthy();
    expect(body.innerHTML).toContain('step one');
  });

  it('toggles the expanded class on the stream when the chip is clicked', () => {
    const payload = { content: '', thinking: 'reasoning here', done: false };
    renderChatPreviewState(payload, state, deps);

    const thoughtChip = state.chatPreviewEl.querySelector('.chat-preview-thought');
    expect(state.chatPreviewEl.classList.contains('expanded')).toBe(false);

    thoughtChip.click();
    expect(state.chatPreviewEl.classList.contains('expanded')).toBe(true);

    thoughtChip.click();
    expect(state.chatPreviewEl.classList.contains('expanded')).toBe(false);
  });

  it('keeps the expansion across re-renders and updates the thinking text', () => {
    renderChatPreviewState({ content: '', thinking: 'first', done: false }, state, deps);
    const thoughtChip = state.chatPreviewEl.querySelector('.chat-preview-thought');
    thoughtChip.click();
    expect(state.chatPreviewEl.classList.contains('expanded')).toBe(true);

    renderChatPreviewState({ content: '', thinking: 'first second', done: false }, state, deps);

    expect(state.chatPreviewEl.classList.contains('expanded')).toBe(true);
    const body = state.chatPreviewEl.querySelector('.chat-preview-thought-body');
    expect(body.innerHTML).toContain('first second');
  });
});
