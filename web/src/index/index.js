import Alpine from 'alpinejs';
import { getJSON, postJSON } from '../shared/api.js';

export function createSessionsPage() {
  return {
    query: '',
    modal: false,
    path: '',
    recent: [],
    creating: false,
    error: '',
    runningSessionIds: new Set(),
    _es: null,
    _unloadHandler: null,

    sessionCards() {
      return Array.from(document.querySelectorAll('.session-card[data-session-id]'));
    },

    syncRunningCardClasses() {
      this.sessionCards().forEach((card) => {
        const id = card.dataset.sessionId;
        card.classList.toggle('session-card--running', !!id && this.runningSessionIds.has(id));
      });
    },

    applySnapshot(data) {
      try {
        const payload = JSON.parse(data);
        const ids = Array.isArray(payload?.running) ? payload.running : [];
        this.runningSessionIds = new Set(ids);
        this.syncRunningCardClasses();
      } catch {
        /* malformed snapshot — ignore */
      }
    },

    applyDelta(data) {
      try {
        const payload = JSON.parse(data);
        if (!payload || typeof payload.id !== 'string') return;
        if (payload.running) this.runningSessionIds.add(payload.id);
        else this.runningSessionIds.delete(payload.id);
        this.syncRunningCardClasses();
      } catch {
        /* malformed delta — ignore */
      }
    },

    cleanup() {
      if (this._es) {
        this._es.close();
        this._es = null;
      }
      if (this._unloadHandler) {
        window.removeEventListener('beforeunload', this._unloadHandler);
        this._unloadHandler = null;
      }
    },

    subscribe() {
      try {
        this.cleanup();
        const es = new EventSource('/events?id=__all__');
        this._es = es;
        es.onmessage = (e) => {
          if (e.data === 'new-session') window.location.reload();
        };
        es.addEventListener('status-snapshot', (e) => this.applySnapshot(e.data));
        es.addEventListener('status-delta', (e) => this.applyDelta(e.data));
        this._unloadHandler = () => this.cleanup();
        window.addEventListener('beforeunload', this._unloadHandler);
      } catch {
        /* EventSource unavailable — page degrades to no live status */
      }
    },

    filter() {
      const q = this.query.toLowerCase();
      document.querySelectorAll('.session-card').forEach((card) => {
        const match = card.dataset.search.toLowerCase().includes(q);
        card.classList.toggle('hidden', !match);
      });
      document.querySelectorAll('.project-group').forEach((group) => {
        const anyVisible = group.querySelector('.session-card:not(.hidden)') !== null;
        group.style.display = anyVisible ? '' : 'none';
      });
    },

    async openModal() {
      this.modal = true;
      this.path = '';
      this.error = '';
      this.recent = [];
      this.$nextTick(() => this.$refs.sessionPath.focus());
      try {
        const response = await getJSON('/api/recent-locations');
        this.recent = (response.locations || []).slice(0, 10);
      } catch {
        // Intentional no-op: recent locations are optional.
      }
    },

    async create() {
      const p = this.path.trim();
      if (!p) {
        this.error = 'Please enter a path';
        return;
      }
      this.creating = true;
      this.error = '';
      try {
        const response = await postJSON('/api/new-session', { path: p });
        if (response.ok && response.id) {
          window.location = '/session?id=' + encodeURIComponent(response.id);
          return;
        }
        this.error = response.error || 'Failed to create session';
      } catch (error) {
        this.error = error.message || 'Network error';
      } finally {
        this.creating = false;
      }
    }
  };
}

if (typeof window !== 'undefined') {
  window.sessionsPage = createSessionsPage;
  if (!window.Alpine) {
    window.Alpine = Alpine;
    Alpine.start();
  }
}
