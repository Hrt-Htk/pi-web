export function showNewSessionToast(message, state, { documentImpl = document, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout } = {}) {
  let notice = documentImpl.getElementById('new-session-toast');
  if (!notice) {
    notice = documentImpl.createElement('div');
    notice.id = 'new-session-toast';
    notice.className = 'toast-notice';
    documentImpl.body.appendChild(notice);
  }
  notice.textContent = message;
  clearTimeoutImpl(state.toastHideTimer);
  notice.classList.add('visible');
  state.toastHideTimer = setTimeoutImpl(() => {
    notice.classList.remove('visible');
  }, 2500);
}

export function setupNewSessionButton({
  documentImpl = document,
  fetchImpl = fetch,
  locationImpl = location,
  cwd = '',
  sessionId = '',
  state = {},
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout
} = {}) {
  const newBtn = documentImpl.getElementById('new-btn');
  if (!newBtn) return false;

  newBtn.addEventListener('click', async () => {
    if (!cwd) {
      showNewSessionToast('No working directory available for this session', state, { documentImpl, setTimeoutImpl, clearTimeoutImpl });
      return;
    }

    const originalHTML = newBtn.innerHTML;
    newBtn.innerHTML = '<span class="working-dots"></span>';
    newBtn.disabled = true;

    try {
      const response = await fetchImpl('/api/new-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: cwd, sourceSessionId: sessionId })
      });
      const data = await response.json();
      if (data.error) {
        showNewSessionToast(data.error || 'Failed to create session', state, { documentImpl, setTimeoutImpl, clearTimeoutImpl });
      } else if (data.id) {
        locationImpl.href = '/session?id=' + encodeURIComponent(data.id);
        return;
      } else {
        showNewSessionToast('Failed to create session', state, { documentImpl, setTimeoutImpl, clearTimeoutImpl });
      }
    } catch (err) {
      showNewSessionToast(err.message || 'Network error', state, { documentImpl, setTimeoutImpl, clearTimeoutImpl });
    }

    newBtn.innerHTML = originalHTML;
    newBtn.disabled = false;
  });

  return true;
}
