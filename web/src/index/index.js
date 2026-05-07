import Alpine from 'alpinejs';
import { getJSON, postJSON } from '../shared/api.js';

export function createSessionsPage({ fetchImpl = globalThis.fetch?.bind(globalThis), pollIntervalMs = 1500 } = {}) {
  return {
    query: '',
    modal: false,
    path: '',
    recent: [],
    creating: false,
    error: '',
    runningSessionIds: new Set(),
    _es: null,
    _statusEs: null,
    _pollTimer: null,
    _unloadHandler: null,

    sessionCards() {
      return Array.from(document.querySelectorAll('.session-card[data-session-id]'));
    },

    visibleSessionCards() {
      return this.sessionCards().filter((card) => !card.classList.contains('hidden'));
    },

    syncRunningCardClasses() {
      this.sessionCards().forEach((card) => {
        const id = card.dataset.sessionId;
        card.classList.toggle('session-card--running', !!id && this.runningSessionIds.has(id));
      });
    },

    updateRunningFromStatusMap(statusMap) {
      const nextRunning = new Set();
      for (const [id, payload] of Object.entries(statusMap)) {
        if (payload && payload.state === 'running') {
          nextRunning.add(id);
        }
      }
      this.runningSessionIds = nextRunning;
      this.syncRunningCardClasses();
    },

    async refreshRunningStatuses() {
      const cards = this.visibleSessionCards();
      const nextRunning = new Set();
      if (typeof fetchImpl !== 'function' || cards.length === 0) {
        this.runningSessionIds = nextRunning;
        this.syncRunningCardClasses();
        return;
      }

      await Promise.all(cards.map(async (card) => {
        const id = card.dataset.sessionId;
        if (!id) return;
        try {
          const response = await fetchImpl('/api/worker-status?id=' + encodeURIComponent(id));
          if (!response.ok) return;
          const payload = await response.json();
          if (payload && payload.state === 'running') nextRunning.add(id);
        } catch {
          // Intentional no-op: unavailable status falls back to non-running.
        }
      }));

      this.runningSessionIds = nextRunning;
      this.syncRunningCardClasses();
    },

    startStatusPolling() {
      this.stopStatusPolling();
      const refresh = () => {
        if (document.visibilityState === 'hidden') return;
        void this.refreshRunningStatuses();
      };
      refresh();
      this._pollTimer = window.setInterval(refresh, pollIntervalMs);
    },

    stopStatusPolling() {
      if (this._pollTimer) {
        window.clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
    },

    cleanup() {
      this.stopStatusPolling();
      if (this._es) {
        this._es.close();
        this._es = null;
      }
      if (this._statusEs) {
        this._statusEs.close();
        this._statusEs = null;
      }
      if (this._unloadHandler) {
        window.removeEventListener('beforeunload', this._unloadHandler);
        this._unloadHandler = null;
      }
    },

    connectStatusStream() {
      this.stopStatusPolling();
      if (this._statusEs) {
        this._statusEs.close();
        this._statusEs = null;
      }
      const cards = this.visibleSessionCards();
      const ids = cards.map((c) => c.dataset.sessionId).filter(Boolean);
      if (ids.length === 0) {
        this.runningSessionIds = new Set();
        this.syncRunningCardClasses();
        return;
      }
      try {
        const es = new EventSource('/events?ids=' + encodeURIComponent(ids.join(',')));
        this._statusEs = es;
        es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            this.updateRunningFromStatusMap(data);
          } catch {
            // ignore non-JSON events
          }
        };
        es.onerror = () => {
          // EventSource auto-reconnects; if it fails permanently,
          // fall back to polling after a delay
          window.setTimeout(() => {
            if (!this._statusEs || this._statusEs.readyState === EventSource.CLOSED) {
              this.startStatusPolling();
            }
          }, 5000);
        };
      } catch {
        this.startStatusPolling();
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
        this._unloadHandler = () => this.cleanup();
        window.addEventListener('beforeunload', this._unloadHandler);
        this.connectStatusStream();
      } catch {
        this.startStatusPolling();
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
      // Reconnect status stream with new visible set
      this.connectStatusStream();
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
