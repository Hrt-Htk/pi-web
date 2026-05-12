function closeOverlay(state) {
  if (state.shareOverlay) state.shareOverlay.remove();
  state.shareOverlay = null;
}

function createOverlay(state, { documentImpl }) {
  closeOverlay(state);
  const overlay = documentImpl.createElement('div');
  state.shareOverlay = overlay;
  overlay.className = 'share-overlay-backdrop';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay(state);
  });
  return overlay;
}

export function showShareCopiedNotice(label, text, state, { documentImpl = document, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout } = {}) {
  let notice = documentImpl.getElementById('share-copy-notice');
  if (!notice) {
    notice = documentImpl.createElement('div');
    notice.id = 'share-copy-notice';
    notice.className = 'toast-notice';
    documentImpl.body.appendChild(notice);
  }
  notice.textContent = label + ' copied';
  notice.title = text;
  clearTimeoutImpl(state.shareCopyHideTimer);
  notice.classList.add('visible');
  state.shareCopyHideTimer = setTimeoutImpl(() => { notice.classList.remove('visible'); }, 1200);
}

export function copyShareUrl(text, label, state, { documentImpl = document, navigatorImpl = navigator, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout } = {}) {
  function fallbackCopy() {
    const textarea = documentImpl.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    documentImpl.body.appendChild(textarea);
    textarea.select();
    const ok = documentImpl.execCommand('copy');
    documentImpl.body.removeChild(textarea);
    if (ok) showShareCopiedNotice(label, text, state, { documentImpl, setTimeoutImpl, clearTimeoutImpl });
  }
  if (navigatorImpl.clipboard && navigatorImpl.clipboard.writeText) {
    navigatorImpl.clipboard.writeText(text).then(() => showShareCopiedNotice(label, text, state, { documentImpl, setTimeoutImpl, clearTimeoutImpl })).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
}

export function showShareResult(gistUrl, previewUrl, state, { documentImpl = document, escapeHtml = String, navigatorImpl = navigator, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout } = {}) {
  const overlay = createOverlay(state, { documentImpl });
  const box = documentImpl.createElement('div');
  box.className = 'share-dialog';
  box.innerHTML = '<h3>Session Shared</h3>' +
    '<div class="share-field"><label>Gist URL</label>' +
    '<input readonly class="share-url-input" onclick="this.select()"></div>' +
    '<div class="share-field"><label>Preview URL</label>' +
    '<input readonly class="share-url-input" onclick="this.select()"></div>' +
    '<div class="share-actions">' +
    '<button id="share-copy-gist" class="share-btn-primary">Copy Gist</button>' +
    '<button id="share-copy-preview" class="share-btn-secondary">Copy Preview</button>' +
    '<button id="share-close" class="share-btn-secondary">Close</button></div>';
  box.querySelectorAll('.share-url-input')[0].value = gistUrl;
  box.querySelectorAll('.share-url-input')[1].value = previewUrl;
  overlay.appendChild(box);
  documentImpl.body.appendChild(overlay);
  documentImpl.getElementById('share-close').addEventListener('click', () => closeOverlay(state));
  documentImpl.getElementById('share-copy-gist').addEventListener('click', () => copyShareUrl(gistUrl, 'Gist', state, { documentImpl, navigatorImpl, setTimeoutImpl, clearTimeoutImpl }));
  documentImpl.getElementById('share-copy-preview').addEventListener('click', () => copyShareUrl(previewUrl, 'Preview', state, { documentImpl, navigatorImpl, setTimeoutImpl, clearTimeoutImpl }));
}

export function showShareError(message, state, { documentImpl = document, escapeHtml = String } = {}) {
  const overlay = createOverlay(state, { documentImpl });
  const box = documentImpl.createElement('div');
  box.className = 'share-dialog error';
  box.innerHTML = '<h3>Share Failed</h3>' +
    '<p class="share-error-message">' + escapeHtml(message) + '</p>' +
    '<div class="share-actions"><button id="share-close-err" class="share-btn-secondary">Close</button></div>';
  overlay.appendChild(box);
  documentImpl.body.appendChild(overlay);
  documentImpl.getElementById('share-close-err').addEventListener('click', () => closeOverlay(state));
}

export function setupShareButton({ documentImpl = document, fetchImpl = fetch, sessionId, state, escapeHtml = String, navigatorImpl = navigator } = {}) {
  const shareBtn = documentImpl.getElementById('share-btn');
  if (!shareBtn) return false;
  shareBtn.addEventListener('click', () => {
    shareBtn.textContent = '...';
    shareBtn.disabled = true;
    fetchImpl('/share?id=' + encodeURIComponent(sessionId), { method: 'POST' })
      .then((response) => response.json())
      .then((data) => {
        shareBtn.textContent = '↗ Share';
        shareBtn.disabled = false;
        if (data.error) showShareError(data.error + (data.stderr ? '\n\n' + data.stderr : ''), state, { documentImpl, escapeHtml });
        else showShareResult(data.gistUrl, data.previewUrl, state, { documentImpl, escapeHtml, navigatorImpl });
      })
      .catch((err) => {
        shareBtn.textContent = '↗ Share';
        shareBtn.disabled = false;
        showShareError(err.message || 'Network error', state, { documentImpl, escapeHtml });
      });
  });
  return true;
}
