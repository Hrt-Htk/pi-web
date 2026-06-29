import { describe, expect, it, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import SessionEntry from './SessionEntry.svelte';

afterEach(cleanup);

describe('SessionEntry - inline ask_user_question', () => {
  it('renders a pending question as an interactive inline card', () => {
    const entry = {
      type: 'message',
      id: 'a1',
      timestamp: '2026-01-01T00:00:00Z',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: 'tc1',
            name: 'pi_web_ask_user_question',
            arguments: {
              questions: [
                {
                  question: 'Tabs or spaces?',
                  options: [{ label: 'tabs' }, { label: 'spaces' }],
                },
              ],
            },
          },
        ],
      },
    };
    const toolResult = {
      type: 'message',
      id: 'r1',
      timestamp: '2026-01-01T00:00:01Z',
      message: {
        role: 'toolResult',
        toolCallId: 'tc1',
        toolName: 'pi_web_ask_user_question',
        details: { awaitingChatReply: true },
        isError: false,
        content: [{ type: 'text', text: 'asked' }],
      },
    };
    const model = { entries: [entry, toolResult] };

    render(SessionEntry, { props: { entry, model, live: true } });

    const card = document.querySelector('.ask-question-card');
    expect(card).not.toBeNull();
    expect(document.body.textContent).toContain('Tabs or spaces?');
    const opts = document.querySelectorAll('.ask-question-option-action');
    expect(opts.length).toBe(2);
    // Must NOT render as a ToolChip
    expect(document.querySelector('.tool-chip')).toBeNull();
  });

  it('renders an answered question as read-only (no action buttons)', () => {
    const entry = {
      type: 'message',
      id: 'a1',
      timestamp: '2026-01-01T00:00:00Z',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: 'tc1',
            name: 'pi_web_ask_user_question',
            arguments: {
              questions: [
                {
                  question: 'Tabs or spaces?',
                  options: [{ label: 'tabs' }, { label: 'spaces' }],
                },
              ],
            },
          },
        ],
      },
    };
    const toolResult = {
      type: 'message',
      id: 'r1',
      timestamp: '2026-01-01T00:00:01Z',
      message: {
        role: 'toolResult',
        toolCallId: 'tc1',
        toolName: 'pi_web_ask_user_question',
        details: { awaitingChatReply: false, answers: { 'Tabs or spaces?': 'tabs' } },
        isError: false,
        content: [{ type: 'text', text: 'answered' }],
      },
    };
    const model = { entries: [entry, toolResult] };

    render(SessionEntry, { props: { entry, model, live: true } });

    const card = document.querySelector('.ask-question-card');
    expect(card).not.toBeNull();
    expect(document.body.textContent).toContain('tabs');
    const opts = document.querySelectorAll('.ask-question-option-action');
    expect(opts.length).toBe(0);
  });
});
