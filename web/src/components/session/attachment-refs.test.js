import { describe, expect, it } from 'vitest';
import { extractAttachmentRefs } from './attachment-refs.js';

describe('extractAttachmentRefs', () => {
  it('extracts a single attachment ref', () => {
    const input = '[Attached file: /home/user/report.csv (text/csv, 1024 bytes)]';
    const { text, refs } = extractAttachmentRefs(input);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      path: '/home/user/report.csv',
      name: 'report.csv',
      mime: 'text/csv',
      size: 1024,
    });
    expect(text).toBe('');
  });

  it('extracts multiple attachment refs', () => {
    const input =
      '[Attached file: /a/b.csv (text/csv, 100 bytes)]\n[Attached file: /c/d.json (application/json, 200 bytes)]';
    const { text, refs } = extractAttachmentRefs(input);
    expect(refs).toHaveLength(2);
    expect(refs[0].name).toBe('b.csv');
    expect(refs[0].mime).toBe('text/csv');
    expect(refs[0].size).toBe(100);
    expect(refs[1].name).toBe('d.json');
    expect(refs[1].mime).toBe('application/json');
    expect(refs[1].size).toBe(200);
    expect(text).toBe('');
  });

  it('preserves message text and strips ref lines', () => {
    const input =
      'Please review this file\n\n[Attached file: /home/user/report.csv (text/csv, 1024 bytes)]';
    const { text, refs } = extractAttachmentRefs(input);
    expect(refs).toHaveLength(1);
    expect(refs[0].name).toBe('report.csv');
    expect(text).toBe('Please review this file');
  });

  it('handles refs-only message (text becomes empty)', () => {
    const input =
      '[Attached file: /x/y.txt (text/plain, 50 bytes)]\n[Attached file: /a/b.txt (text/plain, 60 bytes)]';
    const { text, refs } = extractAttachmentRefs(input);
    expect(refs).toHaveLength(2);
    expect(text).toBe('');
  });

  it('keeps a line that almost matches (missing bytes suffix) in text', () => {
    const input = '[Attached file: /home/user/report.csv (text/csv, 1024)]';
    const { text, refs } = extractAttachmentRefs(input);
    expect(refs).toHaveLength(0);
    expect(text).toBe('[Attached file: /home/user/report.csv (text/csv, 1024)]');
  });

  it('extracts Windows path name correctly', () => {
    const input = '[Attached file: C:\\Users\\x\\report.csv (text/csv, 512 bytes)]';
    const { refs } = extractAttachmentRefs(input);
    expect(refs).toHaveLength(1);
    expect(refs[0].name).toBe('report.csv');
    expect(refs[0].path).toBe('C:\\Users\\x\\report.csv');
  });

  it('captures mime and size correctly', () => {
    const input = '[Attached file: /path/to/file.pdf (application/pdf, 99999 bytes)]';
    const { refs } = extractAttachmentRefs(input);
    expect(refs).toHaveLength(1);
    expect(refs[0].mime).toBe('application/pdf');
    expect(refs[0].size).toBe(99999);
  });

  it('collapses runs of 3+ newlines to 2', () => {
    const input = 'hello\n\n\n\n\n[Attached file: /x.txt (text/plain, 1 bytes)]';
    const { text } = extractAttachmentRefs(input);
    expect(text).toBe('hello');
  });

  it('trims trailing whitespace from result text', () => {
    const input = 'hello\n\n[Attached file: /x.txt (text/plain, 1 bytes)]';
    const { text } = extractAttachmentRefs(input);
    expect(text).toBe('hello');
  });

  it('returns non-matching text untouched', () => {
    const input = 'just some regular text\nwith no attachments';
    const { text, refs } = extractAttachmentRefs(input);
    expect(refs).toHaveLength(0);
    expect(text).toBe('just some regular text\nwith no attachments');
  });

  it('handles ref line in the middle of text', () => {
    const input = 'before text\n[Attached file: /x.txt (text/plain, 1 bytes)]\nafter text';
    const { text, refs } = extractAttachmentRefs(input);
    expect(refs).toHaveLength(1);
    expect(text).toBe('before text\nafter text');
  });
});
