import { describe, expect, it } from 'vitest';
import {
  chipsFromItems,
  summarizeTools,
  chipSummaryText,
  resolveToolResult,
  resolveToolStatus,
  diffStat,
  aggregateStatus,
} from './tool-summary.js';

function makeTool(name, id = 'tc1') {
  return {
    type: 'toolCall',
    block: { id, name, arguments: {} },
    sourceId: 'a',
    timestamp: '2026-01-01T00:00:00Z',
  };
}

function makeThinking(text = 'thinking') {
  return { type: 'thinking', text, sourceId: 'a', timestamp: '2026-01-01T00:00:00Z' };
}

function makeModel(results = []) {
  const entries = [];
  for (const r of results) {
    entries.push({
      id: r.id,
      type: 'message',
      message: {
        role: 'toolResult',
        toolCallId: r.callId,
        isError: r.isError ?? false,
        content: [],
      },
    });
  }
  return { entries };
}

describe('chipsFromItems', () => {
  it('splits on thinking boundaries', () => {
    const items = [
      makeThinking('first'),
      makeTool('read', 'tc1'),
      makeTool('read', 'tc2'),
      makeThinking('second'),
      makeTool('bash', 'tc3'),
    ];
    const chips = chipsFromItems(items);
    expect(chips).toHaveLength(2);
    expect(chips[0].thinking).toBeTruthy();
    expect(chips[0].tools).toHaveLength(2);
    expect(chips[1].thinking).toBeTruthy();
    expect(chips[1].tools).toHaveLength(1);
  });

  it('creates a leading tool-only chip when tools come before thinking', () => {
    const items = [makeTool('read', 'tc1'), makeThinking('thought'), makeTool('bash', 'tc2')];
    const chips = chipsFromItems(items);
    expect(chips).toHaveLength(2);
    expect(chips[0].thinking).toBeNull();
    expect(chips[0].tools).toHaveLength(1);
    expect(chips[1].thinking).toBeTruthy();
    expect(chips[1].tools).toHaveLength(1);
  });

  it('collects unique sourceIds in document order', () => {
    const items = [
      { ...makeThinking(), sourceId: 'a' },
      { ...makeTool('read', 'tc1'), sourceId: 'a' },
      { ...makeTool('read', 'tc2'), sourceId: 'b' },
      { ...makeTool('read', 'tc3'), sourceId: 'a' },
    ];
    const chips = chipsFromItems(items);
    expect(chips[0].sourceIds).toEqual(['a', 'b']);
  });

  it('uses first item timestamp', () => {
    const items = [
      { ...makeThinking(), timestamp: '2026-01-01T00:00:00Z' },
      { ...makeTool('read', 'tc1'), timestamp: '2026-01-01T00:01:00Z' },
    ];
    const chips = chipsFromItems(items);
    expect(chips[0].timestamp).toBe('2026-01-01T00:00:00Z');
  });

  it('handles tool-only items', () => {
    const items = [makeTool('read', 'tc1'), makeTool('bash', 'tc2')];
    const chips = chipsFromItems(items);
    expect(chips).toHaveLength(1);
    expect(chips[0].thinking).toBeNull();
    expect(chips[0].tools).toHaveLength(2);
  });

  it('handles thinking-only items', () => {
    const items = [makeThinking()];
    const chips = chipsFromItems(items);
    expect(chips).toHaveLength(1);
    expect(chips[0].tools).toHaveLength(0);
  });
});

describe('summarizeTools', () => {
  it('pluralizes file counts', () => {
    expect(summarizeTools([makeTool('read', 'tc1')])).toBe('Read 1 file');
    expect(summarizeTools([makeTool('read', 'tc1'), makeTool('read', 'tc2')])).toBe('Read 2 files');
  });

  it('uses correct verb mappings', () => {
    expect(summarizeTools([makeTool('edit', 'tc1')])).toBe('Edited 1 file');
    expect(summarizeTools([makeTool('write', 'tc1')])).toBe('Created 1 file');
    expect(summarizeTools([makeTool('bash', 'tc1')])).toBe('Ran 1 command');
    expect(summarizeTools([makeTool('grep', 'tc1')])).toBe('Searched 1 file');
    expect(summarizeTools([makeTool('find', 'tc1')])).toBe('Searched 1 file');
    expect(summarizeTools([makeTool('ls', 'tc1')])).toBe('Searched 1 file');
  });

  it('pluralizes commands', () => {
    expect(
      summarizeTools([makeTool('bash', 'tc1'), makeTool('bash', 'tc2'), makeTool('bash', 'tc3')]),
    ).toBe('Ran 3 commands');
  });

  it('joins mixed verbs with comma in first-appearance order', () => {
    expect(
      summarizeTools([makeTool('read', 'tc1'), makeTool('read', 'tc2'), makeTool('bash', 'tc3')]),
    ).toBe('Read 2 files, Ran 1 command');
  });

  it('groups same verb even if interleaved with others', () => {
    expect(
      summarizeTools([makeTool('read', 'tc1'), makeTool('bash', 'tc2'), makeTool('read', 'tc3')]),
    ).toBe('Read 2 files, Ran 1 command');
  });

  it('handles unknown tool names verbatim', () => {
    expect(summarizeTools([makeTool('custom_tool', 'tc1')])).toBe('custom_tool');
    expect(summarizeTools([makeTool('custom_tool', 'tc1'), makeTool('custom_tool', 'tc2')])).toBe(
      'custom_tool ×2',
    );
  });

  it('returns empty string for no tools', () => {
    expect(summarizeTools([])).toBe('');
  });
});

describe('chipSummaryText', () => {
  it('joins thinking and tools with middle-dot', () => {
    const chip = {
      thinking: makeThinking(),
      tools: [makeTool('read', 'tc1'), makeTool('bash', 'tc2')],
    };
    expect(chipSummaryText(chip)).toBe('Thought · Read 1 file, Ran 1 command');
  });

  it('shows only Thought when no tools', () => {
    const chip = { thinking: makeThinking(), tools: [] };
    expect(chipSummaryText(chip)).toBe('Thought');
  });

  it('shows only tool summary when no thinking', () => {
    const chip = { thinking: null, tools: [makeTool('read', 'tc1')] };
    expect(chipSummaryText(chip)).toBe('Read 1 file');
  });
});

describe('resolveToolResult', () => {
  it('returns the message object when result exists', () => {
    const model = makeModel([{ id: 'r1', callId: 'tc1' }]);
    const result = resolveToolResult(model, 'tc1');
    expect(result).toBeTruthy();
    expect(result.role).toBe('toolResult');
    expect(result.toolCallId).toBe('tc1');
  });

  it('returns null when no result found', () => {
    const model = makeModel([]);
    expect(resolveToolResult(model, 'tc1')).toBeNull();
  });

  it('returns null for null model', () => {
    expect(resolveToolResult(null, 'tc1')).toBeNull();
  });

  it('preserves details and isError on the message', () => {
    const entries = [
      {
        id: 'r1',
        type: 'message',
        message: {
          role: 'toolResult',
          toolCallId: 'tc1',
          isError: true,
          content: [],
          details: { diff: '+added\n-removed' },
        },
      },
    ];
    const result = resolveToolResult({ entries }, 'tc1');
    expect(result.isError).toBe(true);
    expect(result.details.diff).toBe('+added\n-removed');
  });
});

describe('diffStat', () => {
  it('counts added and removed lines', () => {
    const diff = '--- a/foo\n+++ b/foo\n context\n+added1\n+added2\n-removed1';
    const stat = diffStat(diff);
    expect(stat).toEqual({ added: 2, removed: 1 });
  });

  it('returns zero for empty diff', () => {
    expect(diffStat('')).toEqual({ added: 0, removed: 0 });
    expect(diffStat(null)).toEqual({ added: 0, removed: 0 });
    expect(diffStat(undefined)).toEqual({ added: 0, removed: 0 });
  });

  it('ignores +++ and --- header lines', () => {
    const diff = '--- a/file\n+++ b/file';
    expect(diffStat(diff)).toEqual({ added: 0, removed: 0 });
  });
});

describe('resolveToolStatus', () => {
  it('returns success when result exists without error', () => {
    const model = makeModel([{ id: 'r1', callId: 'tc1' }]);
    expect(resolveToolStatus(model, 'tc1')).toBe('success');
  });

  it('returns error when result has isError', () => {
    const model = makeModel([{ id: 'r1', callId: 'tc1', isError: true }]);
    expect(resolveToolStatus(model, 'tc1')).toBe('error');
  });

  it('returns pending when no result found', () => {
    const model = makeModel([]);
    expect(resolveToolStatus(model, 'tc1')).toBe('pending');
  });

  it('returns pending for null model', () => {
    expect(resolveToolStatus(null, 'tc1')).toBe('pending');
  });
});

describe('aggregateStatus', () => {
  it('returns error if any tool errors', () => {
    const model = makeModel([
      { id: 'r1', callId: 'tc1' },
      { id: 'r2', callId: 'tc2', isError: true },
    ]);
    const tools = [makeTool('read', 'tc1'), makeTool('bash', 'tc2')];
    expect(aggregateStatus(tools, model)).toBe('error');
  });

  it('returns pending if any tool has no result', () => {
    const model = makeModel([{ id: 'r1', callId: 'tc1' }]);
    const tools = [makeTool('read', 'tc1'), makeTool('bash', 'tc2')];
    expect(aggregateStatus(tools, model)).toBe('pending');
  });

  it('returns success when all tools succeeded', () => {
    const model = makeModel([
      { id: 'r1', callId: 'tc1' },
      { id: 'r2', callId: 'tc2' },
    ]);
    const tools = [makeTool('read', 'tc1'), makeTool('bash', 'tc2')];
    expect(aggregateStatus(tools, model)).toBe('success');
  });

  it('returns pending for empty tools', () => {
    expect(aggregateStatus([], null)).toBe('pending');
  });
});
