export function closeSidebarForUpdateIndicator({ documentImpl = document } = {}) {
  documentImpl.getElementById('sidebar')?.classList.remove('open');
  documentImpl.getElementById('sidebar-overlay')?.classList.remove('open');
  documentImpl.body.classList.remove('sidebar-open');
  const hamburger = documentImpl.getElementById('hamburger');
  if (hamburger) hamburger.style.display = '';
}

export function showUpdateIndicator(state, {
  documentImpl = document,
  requestAnimationFrameImpl = requestAnimationFrame,
  setTimeoutImpl = setTimeout,
  closeSidebar = () => closeSidebarForUpdateIndicator({ documentImpl }),
  scrollToBottom = () => {}
} = {}) {
  if (state.indicator) return state.indicator;
  const indicator = documentImpl.createElement('div');
  state.indicator = indicator;
  indicator.textContent = 'updated - tap to view';
  indicator.className = 'update-indicator';
  indicator.addEventListener('click', () => {
    closeSidebar();
    scrollToBottom(true);
  });
  documentImpl.body.appendChild(indicator);
  requestAnimationFrameImpl(() => { indicator.classList.add('visible'); });
  setTimeoutImpl(() => {
    indicator.classList.remove('visible');
    setTimeoutImpl(() => {
      if (state.indicator && state.indicator.parentNode) state.indicator.parentNode.removeChild(state.indicator);
      state.indicator = null;
    }, 300);
  }, 1200);
  return indicator;
}
