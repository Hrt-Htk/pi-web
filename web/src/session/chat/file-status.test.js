import { describe, expect, it } from 'vitest';
import { fileStatusKind, folderStatusKind } from './file-status.js';

describe('fileStatusKind', () => {
  it('returns null for empty/falsy inputs', () => {
    expect(fileStatusKind('')).toBeNull();
    expect(fileStatusKind(null)).toBeNull();
    expect(fileStatusKind(undefined)).toBeNull();
  });

  it('returns "untracked" for ??', () => {
    expect(fileStatusKind('??')).toBe('untracked');
  });

  it('returns "added" for codes containing A', () => {
    expect(fileStatusKind('A')).toBe('added');
    expect(fileStatusKind('AM')).toBe('added');
    expect(fileStatusKind('AA')).toBe('added');
  });

  it('returns "deleted" for codes containing D', () => {
    expect(fileStatusKind('D')).toBe('deleted');
    expect(fileStatusKind('DD')).toBe('deleted');
  });

  it('returns "updated" for codes containing U', () => {
    expect(fileStatusKind('U')).toBe('updated');
    expect(fileStatusKind('UU')).toBe('updated');
    expect(fileStatusKind('UU')).toBe('updated');
  });

  it('returns "modified" for M and other non-empty codes', () => {
    expect(fileStatusKind('M')).toBe('modified');
    expect(fileStatusKind('MM')).toBe('modified');
    expect(fileStatusKind('R')).toBe('modified');
    expect(fileStatusKind('C')).toBe('modified');
    expect(fileStatusKind('RM')).toBe('modified');
    expect(fileStatusKind('CR')).toBe('modified');
  });
});

describe('folderStatusKind', () => {
  it('returns null when no descendant is changed', () => {
    const map = { 'other/x.js': 'M' };
    expect(folderStatusKind(map, 'src')).toBeNull();
    expect(folderStatusKind({}, 'src')).toBeNull();
  });

  it('returns the single kind when all changed descendants share one', () => {
    const map = { 'src/a.js': 'M', 'src/b.js': 'M', 'src/nested/c.js': 'M' };
    expect(folderStatusKind(map, 'src')).toBe('modified');
    const untracked = { 'src/new.js': '??', 'src/sub/also.js': '??' };
    expect(folderStatusKind(untracked, 'src')).toBe('untracked');
  });

  it('returns "modified" when descendants are a mix of kinds', () => {
    const map = { 'src/a.js': 'M', 'src/b.js': '??', 'src/c.js': 'D' };
    expect(folderStatusKind(map, 'src')).toBe('modified');
  });

  it('matches only true path-segment descendants (prefix boundary)', () => {
    // "src2/x" must not count as a descendant of "src"
    const map = { 'src2/x.js': 'M' };
    expect(folderStatusKind(map, 'src')).toBeNull();
  });
});
