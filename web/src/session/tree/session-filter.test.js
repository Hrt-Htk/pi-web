import { describe, expect, it } from 'vitest';
import { buildActivePathIds, buildTree, flattenTree, getGroupedPath } from './session-tree.js';
import {
  extractContent,
  filterNodes,
  getSearchableText,
  hasTextContent,
} from './session-filter.js';

const entries = [
  {
    id: 'root',
    timestamp: '2026-01-01T00:00:00Z',
    type: 'message',
    message: { role: 'user', content: 'hello world' },
  },
  {
    id: 'assistant-tool-only',
    parentId: 'root',
    timestamp: '2026-01-01T00:01:00Z',
    type: 'message',
    message: { role: 'assistant', content: [{ type: 'toolCall', id: 'tc1' }] },
  },
  {
    id: 'assistant-text',
    parentId: 'assistant-tool-only',
    timestamp: '2026-01-01T00:02:00Z',
    type: 'message',
    message: { role: 'assistant', content: [{ type: 'text', text: 'answer text' }] },
  },
  {
    id: 'tool',
    parentId: 'assistant-text',
    timestamp: '2026-01-01T00:03:00Z',
    type: 'message',
    message: { role: 'toolResult', content: [{ type: 'text', text: 'tool output' }] },
  },
  {
    id: 'model',
    parentId: 'tool',
    timestamp: '2026-01-01T00:04:00Z',
    type: 'model_change',
    modelId: 'x',
  },
];

function flat(labelMap = new Map()) {
  const roots = buildTree(entries, labelMap);
  return flattenTree(roots, buildActivePathIds('model', new Map(entries.map((e) => [e.id, e]))));
}

describe('session filter helpers', () => {
  it('extracts text content and detects non-empty text', () => {
    expect(hasTextContent([{ type: 'toolCall' }])).toBe(false);
    expect(hasTextContent([{ type: 'text', text: ' hi ' }])).toBe(true);
    expect(
      extractContent([{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }]),
    ).toBe('ab');
  });

  it('builds searchable text from labels and entries', () => {
    expect(getSearchableText(entries[0], 'Greeting')).toContain('greeting user hello world');
    expect(getSearchableText({ type: 'branch_summary', summary: 'summary text' })).toContain(
      'branch summary summary text',
    );
  });

  it('applies default filter and hides assistant tool-only messages', () => {
    expect(filterNodes(flat(), 'model').map((n) => n.node.entry.id)).toEqual([
      'root',
      'assistant-text',
      'tool',
      'model',
    ]);
  });

  it('applies no-tools, user-only, labeled-only, all, and search filters', () => {
    expect(
      filterNodes(flat(), 'none', { filterMode: 'no-tools' }).map((n) => n.node.entry.id),
    ).toEqual(['root', 'assistant-text']);
    expect(
      filterNodes(flat(), 'none', { filterMode: 'user-only' }).map((n) => n.node.entry.id),
    ).toEqual(['root']);
    expect(
      filterNodes(flat(new Map([['assistant-text', 'Keep']])), 'none', {
        filterMode: 'labeled-only',
      }).map((n) => n.node.entry.id),
    ).toEqual(['assistant-text']);
    expect(filterNodes(flat(), 'none', { filterMode: 'all' }).map((n) => n.node.entry.id)).toEqual([
      'root',
      'assistant-text',
      'tool',
      'model',
    ]);
    expect(
      filterNodes(flat(), 'none', { searchQuery: 'answer' }).map((n) => n.node.entry.id),
    ).toEqual(['assistant-text']);
  });

  it('recalculates visual structure when hidden ancestors are skipped', () => {
    const filtered = filterNodes(flat(), 'none', { searchQuery: 'tool output' });
    expect(filtered.map((n) => n.node.entry.id)).toEqual(['tool']);
    expect(filtered[0].indent).toBe(0);
    expect(filtered[0].multipleRoots).toBe(false);
  });
});

describe('getGroupedPath', () => {
  it('passes through a simple single-turn path unchanged', () => {
    const path = [
      { id: 'u1', type: 'message', message: { role: 'user', content: 'hello' } },
      {
        id: 'a1',
        type: 'message',
        message: { role: 'assistant', content: [{ type: 'text', text: 'hi there' }] },
      },
    ];
    const grouped = getGroupedPath(path);
    expect(grouped.map((e) => e.id)).toEqual(['u1', 'a1']);
    expect(grouped[1].message.content).toEqual(path[1].message.content);
  });

  it('merges consecutive internal assistant entries into the terminal', () => {
    const path = [
      { id: 'u1', type: 'message', message: { role: 'user', content: 'do something' } },
      {
        id: 'a1',
        type: 'message',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'plan step 1' },
            { type: 'toolCall', id: 'tc1', name: 'read_file' },
          ],
        },
      },
      {
        id: 'tr1',
        type: 'message',
        message: { role: 'toolResult', content: [{ type: 'text', text: 'file contents' }] },
      },
      {
        id: 'a2',
        type: 'message',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'plan step 2' },
            { type: 'toolCall', id: 'tc2', name: 'write_file' },
          ],
        },
      },
      {
        id: 'tr2',
        type: 'message',
        message: { role: 'toolResult', content: [{ type: 'text', text: 'written' }] },
      },
      {
        id: 'a3',
        type: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Done!' }],
        },
      },
    ];
    const grouped = getGroupedPath(path);
    expect(grouped.map((e) => e.id)).toEqual(['u1', 'a3']);
    // a3 should have collected thinking + toolCalls from a1 and a2
    const merged = grouped[1].message.content;
    // Verify document order: think1, tool1, think2, tool2, text
    expect(merged.map((b) => b.type)).toEqual([
      'thinking',
      'toolCall',
      'thinking',
      'toolCall',
      'text',
    ]);
    expect(merged[0].thinking).toBe('plan step 1');
    expect(merged[1].id).toBe('tc1');
    expect(merged[2].thinking).toBe('plan step 2');
    expect(merged[3].id).toBe('tc2');
    expect(merged[4].text).toBe('Done!');
  });

  it('preserves document order (interleaved thinking/toolCalls) across merged entries', () => {
    const path = [
      { id: 'u1', type: 'message', message: { role: 'user', content: 'go' } },
      {
        id: 'a1',
        type: 'message',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'think1' },
            { type: 'toolCall', id: 'tc1', name: 'f1' },
          ],
        },
      },
      {
        id: 'tr1',
        type: 'message',
        message: { role: 'toolResult', content: [{ type: 'text', text: 'r1' }] },
      },
      {
        id: 'a2',
        type: 'message',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'think2' },
            { type: 'toolCall', id: 'tc2', name: 'f2' },
          ],
        },
      },
      {
        id: 'tr2',
        type: 'message',
        message: { role: 'toolResult', content: [{ type: 'text', text: 'r2' }] },
      },
      {
        id: 'a3',
        type: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
        },
      },
    ];
    const grouped = getGroupedPath(path);
    expect(grouped.map((e) => e.id)).toEqual(['u1', 'a3']);
    // Must be think1, tool1, think2, tool2, text — NOT think1,think2,tool1,tool2,text
    const merged = grouped[1].message.content;
    expect(merged).toEqual([
      { type: 'thinking', thinking: 'think1' },
      { type: 'toolCall', id: 'tc1', name: 'f1' },
      { type: 'thinking', thinking: 'think2' },
      { type: 'toolCall', id: 'tc2', name: 'f2' },
      { type: 'text', text: 'done' },
    ]);
  });

  it('skips tool results between internal entries', () => {
    const path = [
      { id: 'u1', type: 'message', message: { role: 'user', content: 'go' } },
      {
        id: 'a1',
        type: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'tc1', name: 'search' }],
        },
      },
      {
        id: 'tr1',
        type: 'message',
        message: { role: 'toolResult', content: [{ type: 'text', text: 'results' }] },
      },
      {
        id: 'a2',
        type: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Found it.' }],
        },
      },
    ];
    const grouped = getGroupedPath(path);
    expect(grouped.map((e) => e.id)).toEqual(['u1', 'a2']);
    // toolResult tr1 should NOT appear in grouped path
    expect(grouped.find((e) => e.id === 'tr1')).toBeUndefined();
  });

  it('flushes orphan group only on new user turn', () => {
    const path = [
      { id: 'u1', type: 'message', message: { role: 'user', content: 'start' } },
      {
        id: 'a1',
        type: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'thinking...' }],
        },
      },
      { id: 'u2', type: 'message', message: { role: 'user', content: 'next question' } },
    ];
    const grouped = getGroupedPath(path);
    // New user turn flushes the internal a1 into an orphan group
    expect(grouped.map((e) => e.id)).toEqual(['u1', 'a1', 'u2']);
    expect(grouped[1].message.content[0].type).toBe('thinking');
  });

  it('does not split group when custom entry appears mid-turn', () => {
    const path = [
      { id: 'u1', type: 'message', message: { role: 'user', content: 'search something' } },
      {
        id: 'a1',
        type: 'message',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'plan search' },
            { type: 'toolCall', id: 'tc1', name: 'web_search' },
          ],
        },
      },
      { id: 'custom1', type: 'custom', data: { hook: 'some_hook' } },
      {
        id: 'tr1',
        type: 'message',
        message: { role: 'toolResult', content: [{ type: 'text', text: 'search results' }] },
      },
      {
        id: 'a2',
        type: 'message',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'analyze results' },
            { type: 'text', text: 'Here is the answer.' },
          ],
        },
      },
    ];
    const grouped = getGroupedPath(path);
    // custom entry passes through; a1 merges into a2 — one actions group
    expect(grouped.map((e) => e.id)).toEqual(['u1', 'custom1', 'a2']);
    const merged = grouped[2].message.content;
    expect(merged.map((b) => b.type)).toEqual(['thinking', 'toolCall', 'thinking', 'text']);
    expect(merged[0].thinking).toBe('plan search');
    expect(merged[1].id).toBe('tc1');
    expect(merged[2].thinking).toBe('analyze results');
    expect(merged[3].text).toBe('Here is the answer.');
  });

  it('does not split group when model_change appears mid-turn', () => {
    const path = [
      { id: 'u1', type: 'message', message: { role: 'user', content: 'start' } },
      {
        id: 'a1',
        type: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'thinking...' }],
        },
      },
      { id: 'mc1', type: 'model_change', modelId: 'gpt-4', implicit: false },
      {
        id: 'a2',
        type: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'answer' }],
        },
      },
    ];
    const grouped = getGroupedPath(path);
    // model_change passes through — a1 merges into a2, NOT an orphan
    expect(grouped.map((e) => e.id)).toEqual(['u1', 'mc1', 'a2']);
    const merged = grouped[2].message.content;
    expect(merged.map((b) => b.type)).toEqual(['thinking', 'text']);
    expect(merged[0].thinking).toBe('thinking...');
    expect(merged[1].text).toBe('answer');
  });

  it('handles empty path', () => {
    expect(getGroupedPath([])).toEqual([]);
  });

  it('handles path with only internal assistant (no terminal)', () => {
    const path = [
      { id: 'u1', type: 'message', message: { role: 'user', content: 'go' } },
      {
        id: 'a1',
        type: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'still thinking...' }],
        },
      },
    ];
    const grouped = getGroupedPath(path);
    // Should produce an orphan entry with the thinking
    expect(grouped.length).toBe(2);
    expect(grouped[1].id).toBe('a1');
    expect(grouped[1].message.content[0].type).toBe('thinking');
  });
});
