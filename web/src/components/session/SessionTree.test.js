import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/svelte';
import SessionTree from './SessionTree.svelte';

// Mock the files-api module so FileTree does not make real network calls
vi.mock('../../session/chat/files-api.js', () => ({
  getFileTree: vi.fn(() => Promise.resolve({ files: [] })),
  getFilesGitStatus: vi.fn(() => Promise.resolve({ files: [] })),
}));

// Toolchain smoke test for @testing-library/svelte + jest-dom (added in
// Phase 1 of the Svelte migration). SessionTree is still a static shell; this
// just proves component rendering + matchers work so later phases can lean on
// them. Behavioural tests arrive when the component owns real state.
describe('SessionTree (shell)', () => {
  it('renders the sidebar scaffold with search and filter controls', () => {
    render(SessionTree);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    // the five tree filter buttons (default/no-tools/user/labeled/all)
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(5);
    expect(document.getElementById('tree-container')).toBeInTheDocument();
  });
});

describe('SessionTree tab toggle', () => {
  it('renders both tabs, Session is active by default, file tree NOT in DOM', () => {
    render(SessionTree, { props: { sessionId: 'test-session' } });

    const tablist = document.querySelector('[role="tablist"]');
    expect(tablist).toBeInTheDocument();

    const sessionTab = tablist.querySelector('[data-tab="session"]');
    const filesTab = tablist.querySelector('[data-tab="files"]');

    expect(sessionTab).toBeInTheDocument();
    expect(filesTab).toBeInTheDocument();
    expect(sessionTab.getAttribute('aria-selected')).toBe('true');
    expect(filesTab.getAttribute('aria-selected')).toBe('false');

    // File tree should NOT be in DOM when Session tab is active
    expect(document.querySelector('.file-tree')).not.toBeInTheDocument();
  });

  it('clicking Files tab mounts file tree and hides session view', async () => {
    render(SessionTree, { props: { sessionId: 'test-session' } });

    const filesTab = document.querySelector('[data-tab="files"]');
    await fireEvent.click(filesTab);

    // Session view wrapper should be hidden (display: none or hidden class)
    const sessionWrapper = document.querySelector('.session-view-wrapper');
    expect(sessionWrapper).toBeInTheDocument(); // still in DOM
    expect(sessionWrapper.style.display).toBe('none');

    // File tree should be in DOM
    expect(document.querySelector('.file-tree')).toBeInTheDocument();

    // Session tab should no longer be selected
    const sessionTab = document.querySelector('[data-tab="session"]');
    expect(sessionTab.getAttribute('aria-selected')).toBe('false');
    expect(filesTab.getAttribute('aria-selected')).toBe('true');
  });

  it('clicking Session tab re-shows session view and unmounts file tree', async () => {
    render(SessionTree, { props: { sessionId: 'test-session' } });

    // Switch to Files first
    const filesTab = document.querySelector('[data-tab="files"]');
    await fireEvent.click(filesTab);
    expect(document.querySelector('.file-tree')).toBeInTheDocument();

    // Switch back to Session
    const sessionTab = document.querySelector('[data-tab="session"]');
    await fireEvent.click(sessionTab);

    // Session view should be visible again
    const sessionWrapper = document.querySelector('.session-view-wrapper');
    expect(sessionWrapper.style.display).toBe('');

    // File tree should be unmounted
    expect(document.querySelector('.file-tree')).not.toBeInTheDocument();

    expect(sessionTab.getAttribute('aria-selected')).toBe('true');
    expect(filesTab.getAttribute('aria-selected')).toBe('false');
  });
});
