import { describe, expect, it, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import SessionContent from '../../components/session/SessionContent.svelte';
import { SessionDataModel } from '../data/session-data.svelte.js';
import { findNewEntryHighlightTargets } from './new-entry-highlight.js';

afterEach(cleanup);

/**
 * Build entries for a multi-segment assistant turn:
 *   user U
 *   assistant A1 [thinking + toolCall]  (internal)
 *   toolResult T1
 *   assistant A2 [text only]            (terminal, the response)
 *
 * getGroupedPath merges A1 (internal) into A2 (terminal), producing a single
 * grouped entry with two segments: an actions group (from A1) and a text group (A2).
 */
function buildMultiSegmentEntries() {
  return [
    {
      id: 'U',
      timestamp: '2026-01-01T00:00:00Z',
      type: 'message',
      message: { role: 'user', content: 'do something' },
    },
    {
      id: 'A1',
      parentId: 'U',
      timestamp: '2026-01-01T00:01:00Z',
      type: 'message',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'let me check' },
          { type: 'toolCall', toolCallId: 'tc1', name: 'read_file', input: {} },
        ],
      },
    },
    {
      id: 'T1',
      parentId: 'A1',
      timestamp: '2026-01-01T00:01:30Z',
      type: 'message',
      message: { role: 'toolResult', toolCallId: 'tc1', content: 'file content' },
    },
    {
      id: 'A2',
      parentId: 'T1',
      timestamp: '2026-01-01T00:02:00Z',
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Here is the result.' }],
      },
    },
  ];
}

describe('findNewEntryHighlightTargets', () => {
  it('returns the text group when only A2 is new', () => {
    const entries = buildMultiSegmentEntries();
    const model = new SessionDataModel({ entries, header: {}, leafId: 'A2' });
    const { container } = render(SessionContent, { props: { model } });

    const doc = container.ownerDocument;
    const targets = findNewEntryHighlightTargets(['A2'], doc);

    expect(targets).toHaveLength(1);
    expect(targets[0]).toHaveClass('assistant-group');
    expect(targets[0].getAttribute('data-entry-ids')).toBe('A2');
  });

  it('returns only the last group when both A1 and A2 are new', () => {
    const entries = buildMultiSegmentEntries();
    const model = new SessionDataModel({ entries, header: {}, leafId: 'A2' });
    const { container } = render(SessionContent, { props: { model } });

    const doc = container.ownerDocument;
    const targets = findNewEntryHighlightTargets(['A1', 'A2'], doc);

    expect(targets).toHaveLength(1);
    expect(targets[0]).toHaveClass('assistant-group');
    expect(targets[0].getAttribute('data-entry-ids')).toBe('A2');
  });

  it('returns the user-message entry when U is new', () => {
    const entries = buildMultiSegmentEntries();
    const model = new SessionDataModel({ entries, header: {}, leafId: 'A2' });
    const { container } = render(SessionContent, { props: { model } });

    const doc = container.ownerDocument;
    const targets = findNewEntryHighlightTargets(['U'], doc);

    expect(targets).toHaveLength(1);
    expect(targets[0]).toHaveClass('user-message');
    expect(targets[0].id).toBe('entry-U');
  });

  it('returns empty array for unknown ids', () => {
    const entries = buildMultiSegmentEntries();
    const model = new SessionDataModel({ entries, header: {}, leafId: 'A2' });
    const { container } = render(SessionContent, { props: { model } });

    const doc = container.ownerDocument;
    const targets = findNewEntryHighlightTargets(['nope'], doc);

    expect(targets).toHaveLength(0);
  });

  it('returns empty array when messages-list is absent', () => {
    const doc = document.implementation.createHTMLDocument('blank');
    const targets = findNewEntryHighlightTargets(['A2'], doc);
    expect(targets).toHaveLength(0);
  });

  it('asserts rendered structure: groups carry data-entry-ids, inner elements do not', () => {
    const entries = buildMultiSegmentEntries();
    const model = new SessionDataModel({ entries, header: {}, leafId: 'A2' });
    const { container } = render(SessionContent, { props: { model } });

    const groups = container.querySelectorAll('.assistant-group');
    expect(groups.length).toBeGreaterThanOrEqual(2);

    for (const group of groups) {
      expect(group.getAttribute('data-entry-ids')).not.toBeNull();
      const innerText = group.querySelector('.assistant-text');
      if (innerText) {
        expect(innerText.getAttribute('data-entry-ids')).toBeNull();
      }
      const innerActions = group.querySelector('.actions-group');
      if (innerActions) {
        expect(innerActions.getAttribute('data-entry-ids')).toBeNull();
      }
    }
  });
});
