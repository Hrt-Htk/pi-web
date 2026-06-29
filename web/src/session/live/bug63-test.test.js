import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { startRunningSpinner, stopRunningSpinner } from './chat-preview.js';

describe('bug #63 — spinner swallowed into message list', () => {
  it('spinner does NOT fall into #messages when #chat-preview-host is missing', () => {
    const dom = new JSDOM('<body><div id="messages"></div></body>');
    const state = { runningSpinnerEl: null };

    startRunningSpinner(state, { documentImpl: dom.window.document });

    const spinner = dom.window.document.getElementById('chat-running-spinner');
    expect(spinner).toBeTruthy();

    // FIX: spinner should be appended to body directly, not swallowed by #messages
    expect(spinner.parentNode === dom.window.document.body).toBe(true);

    // Spinner must NOT be inside the message list
    const messagesEl = dom.window.document.getElementById('messages');
    expect(messagesEl.contains(spinner)).toBe(false);

    stopRunningSpinner(state);
  });
});
