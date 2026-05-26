/**
 * Fork Modal — shows user messages from the current session so the user
 * can pick one to fork a new session from.
 */

import { showSheet } from './full-screen-sheet.js';

function truncateText(text, maxLength = 120) {
  if (!text) return '(empty)';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '…';
}

function extractUserMessageText(entry) {
  if (entry?.type !== 'message') return '';
  const msg = entry.message;
  if (!msg || msg.role !== 'user') return '';
  const content = msg.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b?.type === 'text')
      .map((b) => b.text)
      .join(' ');
  }
  return '';
}

function buildUserMessageList(entries = []) {
  const messages = [];
  for (const entry of entries) {
    const text = extractUserMessageText(entry);
    if (text) {
      messages.push({ entryId: entry.id, text });
    }
  }
  return messages;
}

export function showForkModal({
  entries = [],
  escapeHtml = String,
  documentImpl = document,
  windowImpl = window,
  onSelect = null,
} = {}) {
  const userMessages = buildUserMessageList(entries);
  if (userMessages.length === 0) {
    return null;
  }

  const sheet = showSheet({
    title: 'Fork from message',
    showBack: true,
    showClose: false,
    closeOnEscape: true,
    closeOnBackdrop: true,
    documentImpl,
    windowImpl,
    renderBody: ({ close }) => {
      const container = documentImpl.createElement('div');
      container.className = 'fork-modal-body';

      const list = documentImpl.createElement('div');
      list.className = 'fork-message-list';

      userMessages.forEach((msg, index) => {
        const btn = documentImpl.createElement('button');
        btn.className = 'fork-message-item';
        btn.type = 'button';

        const numberSpan = documentImpl.createElement('span');
        numberSpan.className = 'fork-message-number';
        numberSpan.textContent = `#${index + 1}`;

        const textSpan = documentImpl.createElement('span');
        textSpan.className = 'fork-message-text';
        textSpan.textContent = truncateText(msg.text);

        btn.appendChild(numberSpan);
        btn.appendChild(textSpan);

        btn.addEventListener('click', () => {
          close();
          if (onSelect) onSelect(msg.entryId);
        });

        list.appendChild(btn);
      });

      container.appendChild(list);
      return container;
    },
  });

  return sheet;
}
