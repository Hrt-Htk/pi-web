export function clearChatPreview(state) {
  if (state.pendingUserEl && state.pendingUserEl.parentNode) {
    state.pendingUserEl.parentNode.removeChild(state.pendingUserEl);
  }
  if (state.chatPreviewEl && state.chatPreviewEl.parentNode) {
    state.chatPreviewEl.parentNode.removeChild(state.chatPreviewEl);
  }
  state.pendingUserEl = null;
  state.chatPreviewEl = null;
}

export function finishChatPreview(state) {
  if (!state?.chatPreviewEl) return false;
  state.chatPreviewEl.classList.remove('chat-preview-waiting');
  state.chatPreviewEl.classList.add('done');
  const label = state.chatPreviewEl.querySelector('.preview-label');
  if (label && label.parentNode) label.parentNode.removeChild(label);
  return true;
}

export function renderPendingChat(message, state, {
  documentImpl = document,
  renderMarkdown,
  shouldFollow = () => false,
  forceFollowToBottom = () => {},
  scrollAfterLayout = () => {}
} = {}) {
  const text = String(message || '').trim();
  if (!text) return false;
  const container = documentImpl.getElementById('messages') || documentImpl.getElementById('content') || documentImpl.body;
  clearChatPreview(state);

  state.pendingUserEl = documentImpl.createElement('div');
  state.pendingUserEl.id = 'chat-pending-user';
  state.pendingUserEl.className = 'user-message chat-pending-user';
  state.pendingUserEl.innerHTML = '<div class="markdown-content"></div>';
  const userContent = state.pendingUserEl.querySelector('.markdown-content');
  if (userContent) userContent.innerHTML = renderMarkdown(text);
  container.appendChild(state.pendingUserEl);

  state.chatPreviewEl = documentImpl.createElement('div');
  state.chatPreviewEl.id = 'chat-preview-stream';
  state.chatPreviewEl.className = 'assistant-message chat-preview-stream chat-preview-waiting';
  state.chatPreviewEl.innerHTML = '<div class="message-content assistant-text markdown-content"></div><div class="preview-label">working<span class="working-dots" aria-hidden="true"></span></div>';
  container.appendChild(state.chatPreviewEl);

  if (shouldFollow()) {
    forceFollowToBottom(false);
    scrollAfterLayout(false, state.chatPreviewEl);
  }
  return true;
}

export function renderChatPreview(payload, state, {
  documentImpl = document,
  renderMarkdown,
  shouldFollow = () => false,
  forceFollowToBottom = () => {},
  scrollAfterLayout = () => {}
} = {}) {
  if (!payload || typeof payload.content !== 'string') return false;
  const container = documentImpl.getElementById('messages') || documentImpl.getElementById('content') || documentImpl.body;
  if (!state.chatPreviewEl) {
    state.chatPreviewEl = documentImpl.createElement('div');
    state.chatPreviewEl.id = 'chat-preview-stream';
    state.chatPreviewEl.className = 'assistant-message chat-preview-stream';
    state.chatPreviewEl.innerHTML = '<div class="message-content assistant-text markdown-content"></div><div class="preview-label">working<span class="working-dots" aria-hidden="true"></span></div>';
    container.appendChild(state.chatPreviewEl);
  }
  state.chatPreviewEl.classList.remove('chat-preview-waiting');
  const content = state.chatPreviewEl.querySelector('.message-content');
  if (content) content.innerHTML = renderMarkdown(payload.content);
  if (payload.done) finishChatPreview(state);
  else state.chatPreviewEl.classList.remove('done');
  if (shouldFollow()) {
    forceFollowToBottom(false);
    scrollAfterLayout(false, state.chatPreviewEl);
  }
  return true;
}
