import { describe, it, expect } from 'vitest';
import { splitOutputLines } from './entry-format.js';

describe('splitOutputLines', () => {
  it('returns collapsed length 1, preview length 10, remaining 2, lines length 12 for 12-line input with maxLines=10', () => {
    const text = Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n');
    const result = splitOutputLines(text, 10);
    expect(result.collapsed.length).toBe(1);
    expect(result.preview.length).toBe(10);
    expect(result.remaining).toBe(2);
    expect(result.lines.length).toBe(12);
  });

  it('collapsed[0] equals the first line text', () => {
    const text = 'first line\nsecond line\nthird line';
    const result = splitOutputLines(text, 10);
    expect(result.collapsed[0]).toBe('first line');
  });

  it('returns remaining = -7 and collapsed length 1 for 3-line input with maxLines=10', () => {
    const text = 'a\nb\nc';
    const result = splitOutputLines(text, 10);
    expect(result.remaining).toBe(-7);
    expect(result.collapsed.length).toBe(1);
  });
});
