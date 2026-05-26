function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatRelativeTime(timestamp, now = Date.now()) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  const units = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60]
  ];
  for (const [name, size] of units) {
    const count = Math.floor(seconds / size);
    if (count >= 1) return `${count} ${name}${count === 1 ? '' : 's'} ago`;
  }
  return 'just now';
}

export function sessionModelLabel(session = {}) {
  if (!session.model) return '';
  return session.modelProvider ? `${session.modelProvider}/${session.model}` : session.model;
}

export function sessionSearchText(session = {}) {
  return `${session.name || ''} ${session.project || ''} ${sessionModelLabel(session)} ${session.sessionUUID || ''}`.trim();
}

export function renderSessionCard(session = {}) {
  const id = session.id || session.ID || '';
  const name = session.name || session.Name || id;
  const project = session.project || session.Project || '';
  const lastActivity = session.lastActivity || session.LastActivity || '';
  const chatAvailable = session.chatAvailable ?? session.ChatAvailable ?? true;
  const modelLabel = sessionModelLabel({ model: session.model || session.Model, modelProvider: session.modelProvider || session.ModelProvider });
  const search = sessionSearchText({ ...session, id, name, project, model: session.model || session.Model, modelProvider: session.modelProvider || session.ModelProvider });
  return `
    <a class="session-card" href="/session?id=${encodeURIComponent(id)}" data-id="${escapeHtml(id)}" data-session-id="${escapeHtml(id)}" data-search="${escapeHtml(search)}">
      <div class="session-title-row">
        <div class="session-title">${escapeHtml(name)}</div>
        <div class="session-card-flags">
          ${chatAvailable ? '' : '<span class="session-card-badge" title="This session can be viewed, but chat is disabled because its working directory no longer exists.">View only</span>'}
        </div>
      </div>
      <div class="session-project">${escapeHtml(project)}</div>
      <div class="session-model" data-session-model>${escapeHtml(modelLabel)}</div>
      <div class="session-meta">
        <span class="session-active-status" data-running-status><span aria-hidden="true">●</span> active</span>
        <span class="session-time" data-timestamp="${escapeHtml(lastActivity)}" title="${escapeHtml(lastActivity)}">${escapeHtml(formatRelativeTime(lastActivity))}</span>
        <span class="session-run-model" data-running-model></span>
      </div>
    </a>`;
}
