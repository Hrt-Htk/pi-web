import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRightSidebarTabs } from './right-sidebar-tabs.js';

function renderTabs() {
  document.body.innerHTML = `
    <aside id="right-sidebar">
      <button class="right-sidebar-tab active" data-pane="scratchpad" aria-selected="true"></button>
      <button class="right-sidebar-tab" data-pane="artifacts" aria-selected="false"></button>
      <section id="right-pane-scratchpad" class="right-sidebar-pane active"></section>
      <section id="right-pane-artifacts" class="right-sidebar-pane" hidden></section>
    </aside>
  `;
  return {
    sidebar: document.getElementById('right-sidebar'),
    scratchpadTab: document.querySelector('[data-pane="scratchpad"]'),
    artifactsTab: document.querySelector('[data-pane="artifacts"]'),
    scratchpadPane: document.getElementById('right-pane-scratchpad'),
    artifactsPane: document.getElementById('right-pane-artifacts'),
  };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('createRightSidebarTabs', () => {
  it('activates a pane and persists the selected tab', () => {
    const elements = renderTabs();
    const storage = { setItem: vi.fn(), getItem: vi.fn() };
    const tabs = createRightSidebarTabs({
      documentImpl: document,
      sidebar: elements.sidebar,
      storage,
      storageKey: 'tab-key',
    });

    tabs.activateTab('artifacts');

    expect(elements.artifactsTab.classList.contains('active')).toBe(true);
    expect(elements.artifactsTab.getAttribute('aria-selected')).toBe('true');
    expect(elements.scratchpadTab.getAttribute('aria-selected')).toBe('false');
    expect(elements.artifactsPane.hasAttribute('hidden')).toBe(false);
    expect(elements.scratchpadPane.hasAttribute('hidden')).toBe(true);
    expect(elements.sidebar.dataset.activeTab).toBe('artifacts');
    expect(storage.setItem).toHaveBeenCalledWith('tab-key', 'artifacts');
  });

  it('restores the saved non-default tab', () => {
    const elements = renderTabs();
    const storage = { getItem: vi.fn(() => 'artifacts'), setItem: vi.fn() };
    const tabs = createRightSidebarTabs({
      documentImpl: document,
      sidebar: elements.sidebar,
      storage,
      storageKey: 'tab-key',
    });

    tabs.restoreInitialTab();

    expect(elements.artifactsTab.classList.contains('active')).toBe(true);
    expect(elements.sidebar.dataset.activeTab).toBe('artifacts');
  });

  it('keeps the default tab when storage is empty or invalid panes are requested', () => {
    const elements = renderTabs();
    const storage = { getItem: vi.fn(() => ''), setItem: vi.fn() };
    const tabs = createRightSidebarTabs({
      documentImpl: document,
      sidebar: elements.sidebar,
      storage,
      storageKey: 'tab-key',
    });

    tabs.restoreInitialTab();
    tabs.activateTab('missing');

    expect(elements.scratchpadTab.classList.contains('active')).toBe(true);
    expect(elements.sidebar.dataset.activeTab).toBe('scratchpad');
    expect(storage.setItem).not.toHaveBeenCalledWith('tab-key', 'missing');
  });

  it('binds click handlers and removes them during cleanup', () => {
    const elements = renderTabs();
    const storage = { getItem: vi.fn(() => ''), setItem: vi.fn() };
    const tabs = createRightSidebarTabs({
      documentImpl: document,
      sidebar: elements.sidebar,
      storage,
      storageKey: 'tab-key',
    });

    const cleanup = tabs.bind();
    elements.artifactsTab.click();
    expect(elements.sidebar.dataset.activeTab).toBe('artifacts');

    cleanup();
    elements.scratchpadTab.click();
    expect(elements.sidebar.dataset.activeTab).toBe('artifacts');
  });
});
