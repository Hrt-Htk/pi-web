import { describe, expect, it } from 'vitest';
import { legacySessionSources, liveReloadSource, sessionDataPrelude, sessionEntrypointLoaded } from './session.js';

describe('session entrypoint', () => {
  it('exports a load marker for smoke testing', () => {
    expect(sessionEntrypointLoaded).toBe(true);
  });

  it('owns the ordered legacy viewer sources in the Vite module without legacy data boot', () => {
    expect(legacySessionSources).toHaveLength(4);
    expect(legacySessionSources.join('\n')).toContain('function renderEntry(');
    expect(legacySessionSources.join('\n')).not.toContain("document.getElementById('session-data').textContent");
    expect(legacySessionSources.join('\n')).not.toContain('function buildTree()');
    expect(legacySessionSources.join('\n')).not.toContain('function filterNodes(');
    expect(legacySessionSources.join('\n')).not.toContain('function getTreeNodeDisplayHtml(');
    expect(legacySessionSources.join('\n')).not.toContain('function renderTree()');
    expect(legacySessionSources.join('\n')).not.toContain('function navigateTo(');
  });

  it('keeps remaining compatibility sources under web/src session ownership', () => {
    expect(legacySessionSources.join('\n')).toContain('function renderEntry(');
    expect(legacySessionSources.join('\n')).toContain('function renderHeader(');
    expect(legacySessionSources.join('\n')).toContain('function setupPiChatComposer(');
  });

  it('provides legacy-compatible data globals from the modular data loader', () => {
    expect(sessionDataPrelude).toContain('const entries = __piSessionData.entries');
    expect(sessionDataPrelude).toContain('const byId = __piSessionData.byId');
    expect(sessionDataPrelude).toContain('const toolCallMap = __piSessionData.toolCallMap');
    expect(sessionDataPrelude).toContain('const labelMap = __piSessionData.labelMap');
    expect(sessionDataPrelude).toContain('function buildTree() { return window.__piSessionTree.buildTree(); }');
    expect(sessionDataPrelude).toContain('const flattenTree = window.__piSessionTree.flattenTree');
    expect(sessionDataPrelude).toContain("let filterMode = 'default'");
    expect(sessionDataPrelude).toContain('function filterNodes(flatNodes, currentLeafId)');
    expect(sessionDataPrelude).toContain('const formatToolCall = window.__piSessionFormat.formatToolCall');
    expect(sessionDataPrelude).toContain('function getTreeNodeDisplayHtml(entry, label)');
    expect(sessionDataPrelude).toContain('function renderTree()');
    expect(sessionDataPrelude).toContain('function navigateTo(targetId');
  });

  it('owns live reload behavior in the Vite module', () => {
    expect(liveReloadSource).toContain('new EventSource(');
    expect(liveReloadSource).toContain('share-btn');
    expect(liveReloadSource).toContain('resume-btn');
  });
});
