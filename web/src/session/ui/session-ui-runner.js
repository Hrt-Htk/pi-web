import { sessionRuntime } from '../session-runtime.js';

export function setupSessionUi({
  documentImpl = document,
  windowImpl = window,
  storage = localStorage,
  marked,
  hljs,
  escapeHtml,
  markdownApi,
  searchFiltersApi,
  sidebarApi,
  getLeafId,
  setSearchQuery,
  setFilterMode,
  forceTreeRerender,
  navigateTo,
} = {}) {
  markdownApi.configureSessionMarkdown({ marked, hljs, escapeHtml });
  const safeMarkedParse = (text) => markdownApi.safeMarkedParse(text, { marked });

  const searchFilterControls = searchFiltersApi.setupSessionSearchAndFilters({
    documentImpl,
    getLeafId,
    setSearchQuery,
    setFilterMode,
    forceTreeRerender,
    navigateTo,
  });

  const isMobileLayout = () => sidebarApi.isMobileLayout({ windowImpl });
  sidebarApi.setupSidebarResize({ documentImpl, windowImpl, storage });
  sidebarApi.setupSidebarCollapse({ documentImpl, windowImpl, storage });
  const closeSidebar = () => sidebarApi.setSidebarOpen(false, { documentImpl });
  const overlayEl = documentImpl.getElementById('sidebar-overlay');
  if (overlayEl) {
    overlayEl.addEventListener('click', closeSidebar);
    overlayEl.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        closeSidebar();
      },
      { passive: false },
    );
  }

  searchFiltersApi.setupSessionKeyboardShortcuts({
    documentImpl,
    clearSearch: () => searchFilterControls.clearAndNavigateBottom(),
  });

  return {
    safeMarkedParse,
    isMobileLayout,
    closeSidebar,
    // The right-sidebar chrome (scratchpad/resize/tabs) lives in <RightSidebar>,
    // which registers its controls in sessionRuntime.rightSidebar. Read lazily so
    // the calls resolve against the mounted component.
    toggleRightSidebar: () => sessionRuntime.rightSidebar?.toggle(),
    openRightSidebar: () => sessionRuntime.rightSidebar?.open(),
    collapseRightSidebar: () => sessionRuntime.rightSidebar?.collapse(),
    activateRightTab: (pane) => sessionRuntime.rightSidebar?.activateTab(pane),
  };
}
