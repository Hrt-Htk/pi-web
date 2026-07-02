import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FileTree from './FileTree.svelte';

describe('FileTree', () => {
  it('shows loading state initially', async () => {
    const api = {
      getFileTree: vi.fn().mockResolvedValue({ files: [] }),
      getFilesGitStatus: vi.fn().mockResolvedValue({ files: [], summary: {} }),
    };

    render(FileTree, { sessionId: 'test', api });
    expect(screen.getByText('Loading files…')).toBeTruthy();
  });

  it('renders root entries from getFileTree', async () => {
    const api = {
      getFileTree: vi.fn().mockResolvedValue({
        files: [
          { path: 'src', isDir: true },
          { path: 'README.md', isDir: false },
        ],
      }),
      getFilesGitStatus: vi.fn().mockResolvedValue({ files: [], summary: {} }),
    };

    render(FileTree, { sessionId: 'test', api });

    // Wait for entries to appear
    expect(await screen.findByText('src')).toBeTruthy();
    expect(await screen.findByText('README.md')).toBeTruthy();
  });

  it('applies status dot classes from getFilesGitStatus', async () => {
    const api = {
      getFileTree: vi.fn().mockResolvedValue({
        files: [{ path: 'app.js', isDir: false }],
      }),
      getFilesGitStatus: vi.fn().mockResolvedValue({
        files: [{ status: 'M', path: 'app.js' }],
        summary: { modified: 1, added: 0, deleted: 0, untracked: 0 },
      }),
    };

    render(FileTree, { sessionId: 'test', api });

    await screen.findByText('app.js');
    const dot = document.querySelector('.ft-status-dot.modified');
    expect(dot).toBeTruthy();
  });

  it('shows empty state when tree is empty', async () => {
    const api = {
      getFileTree: vi.fn().mockResolvedValue({ files: [] }),
      getFilesGitStatus: vi.fn().mockResolvedValue({ files: [], summary: {} }),
    };

    render(FileTree, { sessionId: 'test', api });

    expect(await screen.findByText('No files to show')).toBeTruthy();
  });

  it('calls api with correct sessionId', async () => {
    const treeStub = vi.fn().mockResolvedValue({ files: [] });
    const statusStub = vi.fn().mockResolvedValue({ files: [], summary: {} });
    const api = {
      getFileTree: treeStub,
      getFilesGitStatus: statusStub,
    };

    render(FileTree, { sessionId: 'my-session-123', api });

    expect(treeStub).toHaveBeenCalledWith('my-session-123', '');
    expect(statusStub).toHaveBeenCalledWith('my-session-123');
  });
});
