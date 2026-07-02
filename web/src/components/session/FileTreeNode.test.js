import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import FileTreeNode from './FileTreeNode.svelte';

const defaultApi = {
  getFileTree: vi.fn().mockResolvedValue({ files: [] }),
};

describe('FileTreeNode', () => {
  describe('file node', () => {
    it('renders a file with its basename', async () => {
      render(FileTreeNode, {
        entry: { path: 'src/app.js', isDir: false },
        depth: 0,
        statusMap: {},
        sessionId: 'test',
        api: defaultApi,
      });
      expect(screen.getByText('app.js')).toBeTruthy();
    });

    it('renders a file with modified status dot', async () => {
      render(FileTreeNode, {
        entry: { path: 'src/app.js', isDir: false },
        depth: 0,
        statusMap: { 'src/app.js': 'M' },
        sessionId: 'test',
        api: defaultApi,
      });
      const dot = document.querySelector('.ft-status-dot.modified');
      expect(dot).toBeTruthy();
    });

    it('colours the filename text by status', async () => {
      render(FileTreeNode, {
        entry: { path: 'src/app.js', isDir: false },
        depth: 0,
        statusMap: { 'src/app.js': 'M' },
        sessionId: 'test',
        api: defaultApi,
      });
      const name = document.querySelector('.ft-name.modified');
      expect(name).toBeTruthy();
      expect(name.textContent).toBe('app.js');
    });

    it('renders no status dot when file has no status', async () => {
      render(FileTreeNode, {
        entry: { path: 'src/clean.js', isDir: false },
        depth: 0,
        statusMap: {},
        sessionId: 'test',
        api: defaultApi,
      });
      const dot = document.querySelector('.ft-status-dot');
      expect(dot).toBeFalsy();
    });

    it('renders untracked status dot', async () => {
      render(FileTreeNode, {
        entry: { path: 'new-file.txt', isDir: false },
        depth: 0,
        statusMap: { 'new-file.txt': '??' },
        sessionId: 'test',
        api: defaultApi,
      });
      const dot = document.querySelector('.ft-status-dot.untracked');
      expect(dot).toBeTruthy();
    });
  });

  describe('folder node', () => {
    it('renders a folder with its basename', async () => {
      render(FileTreeNode, {
        entry: { path: 'src', isDir: true },
        depth: 0,
        statusMap: {},
        sessionId: 'test',
        api: defaultApi,
      });
      expect(screen.getByText('src')).toBeTruthy();
    });

    it('flags a folder that contains changed descendants (aggregate dot + name colour)', async () => {
      render(FileTreeNode, {
        entry: { path: 'internal', isDir: true },
        depth: 0,
        statusMap: { 'internal/git/git.go': 'M' },
        sessionId: 'test',
        api: defaultApi,
      });
      expect(document.querySelector('.ft-node-folder .ft-status-dot.modified')).toBeTruthy();
      expect(document.querySelector('.ft-node-folder .ft-name.modified')).toBeTruthy();
    });

    it('shows no indicator on a folder with no changed descendants', async () => {
      render(FileTreeNode, {
        entry: { path: 'internal', isDir: true },
        depth: 0,
        statusMap: { 'other/x.go': 'M' },
        sessionId: 'test',
        api: defaultApi,
      });
      expect(document.querySelector('.ft-node-folder .ft-status-dot')).toBeFalsy();
    });

    it('lazy-loads children on first expand', async () => {
      const user = userEvent.setup();
      const loadChildren = vi.fn().mockResolvedValue({
        files: [
          { path: 'src/a.js', isDir: false },
          { path: 'src/b.js', isDir: false },
        ],
      });

      render(FileTreeNode, {
        entry: { path: 'src', isDir: true },
        depth: 0,
        statusMap: {},
        sessionId: 'test',
        api: { getFileTree: loadChildren },
      });

      // Children should not be loaded initially
      expect(loadChildren).not.toHaveBeenCalled();

      // Click to expand
      const folderRow = document.querySelector('.ft-node-folder');
      await user.click(folderRow);

      // Should have called getFileTree with the folder path
      expect(loadChildren).toHaveBeenCalledWith('test', 'src');

      // Children should now be visible
      expect(screen.getByText('a.js')).toBeTruthy();
      expect(screen.getByText('b.js')).toBeTruthy();
    });

    it('does not refetch on re-expand', async () => {
      const user = userEvent.setup();
      const loadChildren = vi.fn().mockResolvedValue({
        files: [{ path: 'src/a.js', isDir: false }],
      });

      render(FileTreeNode, {
        entry: { path: 'src', isDir: true },
        depth: 0,
        statusMap: {},
        sessionId: 'test',
        api: { getFileTree: loadChildren },
      });

      // Expand
      const folderRow = document.querySelector('.ft-node-folder');
      await user.click(folderRow);
      expect(loadChildren).toHaveBeenCalledTimes(1);

      // Collapse
      await user.click(folderRow);
      // Should not have called again
      expect(loadChildren).toHaveBeenCalledTimes(1);

      // Re-expand
      await user.click(folderRow);
      // Still only once — cached
      expect(loadChildren).toHaveBeenCalledTimes(1);
    });
  });
});
