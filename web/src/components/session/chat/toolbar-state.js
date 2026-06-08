export function isRunningStatus(text, cls) {
  return cls === 'running'
    || text === 'running'
    || text === 'sending'
    || text === 'queued'
    || text === 'accepted'
    || text === 'cancelling';
}

export function createChatToolbarState({
  documentImpl = document,
  isMobileTextInputMode = () => false,
  updateContextUsage = () => {},
} = {}) {
  function setStatus(text, cls) {
    const status = documentImpl.getElementById('pi-chat-status');
    const cancelButton = documentImpl.getElementById('pi-chat-cancel');
    const isRunning = isRunningStatus(text, cls);
    if (status) {
      status.textContent = text;
      status.className = 'pi-chat-status' + (cls ? ' ' + cls : '');
    }
    if (cancelButton) {
      cancelButton.style.display = isRunning ? '' : 'none';
      cancelButton.disabled = text === 'cancelling';
    }
  }

  function setModelLabel(label) {
    const btn = documentImpl.getElementById('pi-chat-model-label');
    if (!btn) return;
    if (label) {
      btn.textContent = label;
      btn.style.display = '';
    } else if (!btn.textContent || btn.textContent.trim() === '') {
      // Show a placeholder so the button is always visible and clickable.
      btn.textContent = 'Model';
      btn.style.display = '';
    }
    btn.setAttribute('title', isMobileTextInputMode() ? 'Switch model' : 'Switch model (Ctrl+I)');
    updateContextUsage();
  }

  function setThinkingLabel(level) {
    const btn = documentImpl.getElementById('pi-chat-thinking-label');
    if (!btn) return;
    if (level) {
      btn.textContent = level;
      btn.style.display = '';
      btn.className = 'pi-chat-thinking-label thinking-' + level;
    } else {
      btn.style.display = 'none';
    }
    btn.setAttribute('title', isMobileTextInputMode() ? 'Switch effort' : 'Switch effort (Shift+Tab)');
  }

  function updateInitialTooltips() {
    const modelBtn = documentImpl.getElementById('pi-chat-model-label');
    if (modelBtn) {
      modelBtn.setAttribute('title', isMobileTextInputMode() ? 'Switch model' : 'Switch model (Ctrl+I)');
    }
    const thinkingBtn = documentImpl.getElementById('pi-chat-thinking-label');
    if (thinkingBtn) {
      thinkingBtn.setAttribute('title', isMobileTextInputMode() ? 'Switch effort' : 'Switch effort (Shift+Tab)');
    }
  }

  return {
    setStatus,
    setModelLabel,
    setThinkingLabel,
    updateInitialTooltips,
  };
}
