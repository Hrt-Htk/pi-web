export function createRightSidebarTabs({
  documentImpl = document,
  sidebar = null,
  storage = globalThis.localStorage,
  storageKey,
} = {}) {
  const tabs = Array.from(documentImpl.querySelectorAll('.right-sidebar-tab'));
  const panes = Array.from(documentImpl.querySelectorAll('.right-sidebar-pane'));

  function activateTab(pane) {
    if (!tabs.some((tab) => tab.dataset.pane === pane)) return;
    for (const tab of tabs) {
      const isActive = tab.dataset.pane === pane;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    }
    for (const p of panes) {
      const isActive = p.id === `right-pane-${pane}`;
      p.classList.toggle('active', isActive);
      if (isActive) p.removeAttribute('hidden');
      else p.setAttribute('hidden', '');
    }
    if (sidebar) sidebar.dataset.activeTab = pane;
    try {
      storage?.setItem(storageKey, pane);
    } catch {}
  }

  function bind() {
    const cleanups = [];
    for (const tab of tabs) {
      const onClick = () => activateTab(tab.dataset.pane);
      tab.addEventListener('click', onClick);
      cleanups.push(() => tab.removeEventListener('click', onClick));
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }

  function restoreInitialTab() {
    let initialTab = '';
    try {
      initialTab = storage?.getItem(storageKey) || '';
    } catch {}
    if (initialTab && initialTab !== 'scratchpad') activateTab(initialTab);
    if (sidebar && !sidebar.dataset.activeTab) sidebar.dataset.activeTab = 'scratchpad';
  }

  return {
    activateTab,
    bind,
    restoreInitialTab,
  };
}
