import { describe, expect, it, vi } from 'vitest';
import { getFileTree, getFilesGitStatus } from './files-api.js';

describe('getFileTree', () => {
  it('calls getImpl with correct URL without scope', async () => {
    const stub = vi.fn().mockResolvedValue({ files: [] });
    const result = await getFileTree('session-1', '', { getImpl: stub });
    expect(stub).toHaveBeenCalledWith('/api/files/tree?id=session-1');
    expect(result).toEqual({ files: [] });
  });

  it('calls getImpl with correct URL with scope', async () => {
    const stub = vi.fn().mockResolvedValue({ files: [] });
    await getFileTree('session-1', 'src/components', { getImpl: stub });
    expect(stub).toHaveBeenCalledWith('/api/files/tree?id=session-1&scope=src%2Fcomponents');
  });

  it('encodes special characters in sessionId', async () => {
    const stub = vi.fn().mockResolvedValue({ files: [] });
    await getFileTree('my session/1', '', { getImpl: stub });
    expect(stub).toHaveBeenCalledWith('/api/files/tree?id=my%20session%2F1');
  });
});

describe('getFilesGitStatus', () => {
  it('calls getImpl with correct URL', async () => {
    const stub = vi.fn().mockResolvedValue({ files: [], summary: {} });
    const result = await getFilesGitStatus('session-1', { getImpl: stub });
    expect(stub).toHaveBeenCalledWith('/api/files/git-status?id=session-1');
    expect(result).toEqual({ files: [], summary: {} });
  });

  it('encodes special characters in sessionId', async () => {
    const stub = vi.fn().mockResolvedValue({ files: [], summary: {} });
    await getFilesGitStatus('my session/1', { getImpl: stub });
    expect(stub).toHaveBeenCalledWith('/api/files/git-status?id=my%20session%2F1');
  });
});
