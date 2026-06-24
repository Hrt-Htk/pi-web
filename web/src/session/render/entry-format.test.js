import { describe, it, expect } from 'vitest';
import { splitOutputLines } from './entry-format.js';

describe('splitOutputLines', () => {
  it('splits multi-line text into an array of lines', () => {
    const text = Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n');
    const result = splitOutputLines(text);
    expect(result.lines.length).toBe(12);
  });

  it('replaces tabs with spaces', () => {
    const text = 'hello\tworld';
    const result = splitOutputLines(text);
    expect(result.lines[0]).toBe('hello   world');
  });

  it('handles single-line input', () => {
    const text = 'single line';
    const result = splitOutputLines(text);
    expect(result.lines).toEqual(['single line']);
  });
});
