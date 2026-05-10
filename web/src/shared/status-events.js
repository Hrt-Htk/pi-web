function parseJSON(data) {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function normalizeRunning(payload) {
  return Array.isArray(payload?.running) ? payload.running : null;
}

function normalizeDelta(payload) {
  if (!payload || typeof payload.id !== 'string') return null;
  return { id: payload.id, running: !!payload.running };
}

export function createStatusEvents({
  topic = '__all__',
  EventSourceImpl = globalThis.EventSource,
  windowImpl = globalThis.window,
  onSnapshot = () => {},
  onDelta = () => {},
  onMessage = () => {}
} = {}) {
  let stream = null;
  let unloadHandler = null;

  function cleanup() {
    if (stream) {
      stream.close();
      stream = null;
    }
    if (unloadHandler && windowImpl?.removeEventListener) {
      windowImpl.removeEventListener('beforeunload', unloadHandler);
      unloadHandler = null;
    }
  }

  function connect() {
    if (!EventSourceImpl) return;
    cleanup();
    const es = new EventSourceImpl(`/events?id=${encodeURIComponent(topic)}`);
    stream = es;

    es.onmessage = (event) => onMessage(event.data);
    es.addEventListener('status-snapshot', (event) => {
      const running = normalizeRunning(parseJSON(event.data));
      if (running) onSnapshot(running);
    });
    es.addEventListener('status-delta', (event) => {
      const delta = normalizeDelta(parseJSON(event.data));
      if (delta) onDelta(delta);
    });

    if (windowImpl?.addEventListener) {
      unloadHandler = () => cleanup();
      windowImpl.addEventListener('beforeunload', unloadHandler);
    }
  }

  return { connect, cleanup };
}
