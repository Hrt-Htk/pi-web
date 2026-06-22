import { describe, expect, it } from 'vitest';
import {
  buildActivePathIds,
  buildTree,
  buildTreePrefix,
  buildTreeNodeMap,
  findNewestLeaf,
  flattenTree,
  getGroupedPath,
  getPath,
} from './session-tree.js';

const entries = [
  { id: 'root', timestamp: '2026-01-01T00:00:00Z' },
  { id: 'old', parentId: 'root', timestamp: '2026-01-01T00:01:00Z' },
  { id: 'new', parentId: 'root', timestamp: '2026-01-01T00:02:00Z' },
  { id: 'leaf', parentId: 'new', timestamp: '2026-01-01T00:03:00Z' },
  { id: 'orphan', parentId: 'missing', timestamp: '2026-01-01T00:04:00Z' },
];

function byId() {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

describe('session tree helpers', () => {
  it('builds roots, children, labels, and timestamp ordering', () => {
    const roots = buildTree(entries, new Map([['new', 'label']]));
    expect(roots.map((n) => n.entry.id)).toEqual(['root', 'orphan']);
    expect(roots[0].children.map((n) => n.entry.id)).toEqual(['old', 'new']);
    expect(roots[0].children[1].label).toBe('label');
  });

  it('ignores metadata entries without ids', () => {
    const roots = buildTree([...entries, { type: 'session_info', name: 'Renamed' }]);
    const flat = flattenTree(roots, buildActivePathIds('leaf', byId()));
    expect(flat.map((f) => f.node.entry.id)).toEqual(['root', 'new', 'leaf', 'old', 'orphan']);
  });

  it('deduplicates repeated ids before linking tree nodes', () => {
    const duplicated = [
      { id: 'session', timestamp: '2026-01-01T00:00:00Z', type: 'session' },
      {
        id: 'model',
        parentId: null,
        timestamp: '2026-01-01T00:01:00Z',
        type: 'model_change',
        modelId: 'old',
      },
      {
        id: 'thinking',
        parentId: 'model',
        timestamp: '2026-01-01T00:02:00Z',
        type: 'thinking_level_change',
        thinkingLevel: 'low',
      },
      {
        id: 'model',
        parentId: null,
        timestamp: '2026-01-01T00:03:00Z',
        type: 'model_change',
        modelId: 'new',
      },
      {
        id: 'thinking',
        parentId: 'model',
        timestamp: '2026-01-01T00:04:00Z',
        type: 'thinking_level_change',
        thinkingLevel: 'high',
      },
      {
        id: 'leaf',
        parentId: 'thinking',
        timestamp: '2026-01-01T00:05:00Z',
        type: 'message',
        message: { role: 'user', content: 'hi' },
      },
    ];

    const roots = buildTree(duplicated);
    const flat = flattenTree(
      roots,
      buildActivePathIds('leaf', new Map(duplicated.map((entry) => [entry.id, entry]))),
    );

    expect(flat.map((f) => f.node.entry.id)).toEqual(['model', 'thinking', 'leaf', 'session']);
    expect(roots.find((node) => node.entry.id === 'model').entry.modelId).toBe('new');
    expect(roots.find((node) => node.entry.id === 'model').children[0].entry.thinkingLevel).toBe(
      'high',
    );
  });

  it('builds active path and path entries from leaf to root', () => {
    expect([...buildActivePathIds('leaf', byId())]).toEqual(['leaf', 'new', 'root']);
    expect(getPath('leaf', byId()).map((e) => e.id)).toEqual(['root', 'new', 'leaf']);
  });

  it('finds newest reachable leaf', () => {
    const roots = buildTree(entries);
    expect(findNewestLeaf('root', buildTreeNodeMap(roots))).toBe('leaf');
    expect(findNewestLeaf('missing', roots)).toBe('missing');
  });

  it('does not treat label bookkeeping entries as newest navigable leaves', () => {
    const roots = buildTree([
      ...entries,
      {
        id: 'label-only',
        type: 'label',
        parentId: 'leaf',
        targetId: 'leaf',
        label: 'Done',
        timestamp: '2026-01-01T00:04:00Z',
      },
    ]);
    expect(findNewestLeaf('leaf', roots)).toBe('leaf');
  });

  it('flattens active branch first and builds prefixes', () => {
    const roots = buildTree(entries);
    const flat = flattenTree(roots, buildActivePathIds('leaf', byId()));
    expect(flat.map((f) => f.node.entry.id)).toEqual(['root', 'new', 'leaf', 'old', 'orphan']);
    expect(buildTreePrefix(flat[1])).toContain('├');
  });
});

describe('getGroupedPath memberIds', () => {
  it('attaches memberIds with internal + terminal ids for grouped assistant', () => {
    const path = [
      {
        id: 'think1',
        type: 'message',
        message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'reasoning' }] },
        timestamp: '2026-01-01T00:00:00Z',
      },
      {
        id: 'tool1',
        type: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'toolCall', name: 'read', input: {} }],
        },
        timestamp: '2026-01-01T00:01:00Z',
      },
      {
        id: 'result1',
        type: 'message',
        message: { role: 'toolResult', content: 'ok' },
        timestamp: '2026-01-01T00:02:00Z',
      },
      {
        id: 'final',
        type: 'message',
        message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
        timestamp: '2026-01-01T00:03:00Z',
      },
    ];
    const grouped = getGroupedPath(path);
    expect(grouped.length).toBe(1);
    expect(grouped[0].id).toBe('think1');
    expect(grouped[0].memberIds).toEqual(['think1', 'tool1', 'final']);
  });

  it('passes through a plain user entry with memberIds [id]', () => {
    const path = [
      {
        id: 'user1',
        type: 'message',
        message: { role: 'user', content: 'hello' },
        timestamp: '2026-01-01T00:00:00Z',
      },
    ];
    const grouped = getGroupedPath(path);
    expect(grouped.length).toBe(1);
    expect(grouped[0].id).toBe('user1');
    expect(grouped[0].memberIds).toEqual(['user1']);
  });

  it('builds orphan group with memberIds covering internal ids', () => {
    const path = [
      {
        id: 'think2',
        type: 'message',
        message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'working' }] },
        timestamp: '2026-01-01T00:00:00Z',
      },
      {
        id: 'tool2',
        type: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'toolCall', name: 'write', input: {} }],
        },
        timestamp: '2026-01-01T00:01:00Z',
      },
    ];
    const grouped = getGroupedPath(path);
    expect(grouped.length).toBe(1);
    expect(grouped[0].id).toBe('think2');
    expect(grouped[0].memberIds).toEqual(['think2', 'tool2']);
  });

  it('terminal assistant with no pending blocks gets memberIds [self]', () => {
    const path = [
      {
        id: 'solo',
        type: 'message',
        message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
        timestamp: '2026-01-01T00:00:00Z',
      },
    ];
    const grouped = getGroupedPath(path);
    expect(grouped[0].id).toBe('solo');
    expect(grouped[0].memberIds).toEqual(['solo']);
  });

  it('grouped turn id equals memberIds[0] (first source entry)', () => {
    const path = [
      {
        id: 'a1',
        type: 'message',
        message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'x' }] },
        timestamp: '2026-01-01T00:00:00Z',
      },
      {
        id: 'a2',
        type: 'message',
        message: { role: 'assistant', content: [{ type: 'toolCall', name: 'f', input: {} }] },
        timestamp: '2026-01-01T00:01:00Z',
      },
      {
        id: 'r1',
        type: 'message',
        message: { role: 'toolResult', content: 'ok' },
        timestamp: '2026-01-01T00:02:00Z',
      },
      {
        id: 'a3',
        type: 'message',
        message: { role: 'assistant', content: [{ type: 'text', text: 'result' }] },
        timestamp: '2026-01-01T00:03:00Z',
      },
    ];
    const grouped = getGroupedPath(path);
    expect(grouped[0].id).toBe(grouped[0].memberIds[0]);
    expect(grouped[0].id).toBe('a1');
  });

  it('orphan group id equals pendingIds[0]', () => {
    const path = [
      {
        id: 'o1',
        type: 'message',
        message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'y' }] },
        timestamp: '2026-01-01T00:00:00Z',
      },
      {
        id: 'o2',
        type: 'message',
        message: { role: 'assistant', content: [{ type: 'toolCall', name: 'g', input: {} }] },
        timestamp: '2026-01-01T00:01:00Z',
      },
      {
        id: 'u1',
        type: 'message',
        message: { role: 'user', content: 'hi' },
        timestamp: '2026-01-01T00:02:00Z',
      },
    ];
    const grouped = getGroupedPath(path);
    expect(grouped[0].id).toBe('o1');
    expect(grouped[0].memberIds).toEqual(['o1', 'o2']);
  });

  it('single-entry turn keeps its own id', () => {
    const path = [
      {
        id: 'solo',
        type: 'message',
        message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
        timestamp: '2026-01-01T00:00:00Z',
      },
    ];
    const grouped = getGroupedPath(path);
    expect(grouped[0].id).toBe('solo');
  });

  it('merged content blocks carry sourceId equal to originating entry id', () => {
    const path = [
      {
        id: 'think3',
        type: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'internal thought' }],
        },
        timestamp: '2026-01-01T00:00:00Z',
      },
      {
        id: 'final2',
        type: 'message',
        message: { role: 'assistant', content: [{ type: 'text', text: 'final answer' }] },
        timestamp: '2026-01-01T00:01:00Z',
      },
    ];
    const grouped = getGroupedPath(path);
    const blocks = grouped[0].message.content;
    expect(blocks[0].sourceId).toBe('think3');
    expect(blocks[1].sourceId).toBe('final2');
  });

  it('terminal-only turn tags blocks with terminal sourceId', () => {
    const path = [
      {
        id: 'term1',
        type: 'message',
        message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
        timestamp: '2026-01-01T00:00:00Z',
      },
    ];
    const grouped = getGroupedPath(path);
    expect(grouped[0].message.content[0].sourceId).toBe('term1');
  });
});
