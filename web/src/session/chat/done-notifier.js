export const DONE_NOTIFY_STORAGE_KEY = 'pi-share:v1:notify-on-done';

export function isDoneNotifyEnabled({ storage = globalThis.localStorage } = {}) {
  try {
    return storage?.getItem(DONE_NOTIFY_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setDoneNotifyEnabled(enabled, { storage = globalThis.localStorage } = {}) {
  try {
    storage?.setItem(DONE_NOTIFY_STORAGE_KEY, String(!!enabled));
  } catch {
    // ignore
  }
}

export function playDoneSound({ windowImpl = window, audioSrc = '/done.mp3' } = {}) {
  try {
    const AudioCtor = windowImpl.Audio;
    if (!AudioCtor) return;
    const audio = new AudioCtor(audioSrc);
    audio.volume = 0.7;
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {
    // ignore
  }
}

export function showDoneNotification({ windowImpl = window, documentImpl = document, title = 'pi session', body = 'Response ready' } = {}) {
  try {
    const N = windowImpl.Notification;
    if (!N || N.permission !== 'granted') return;
    if (!documentImpl.hidden) return;
    const n = new N(title, { body, icon: '/icon.svg', tag: 'pi-session-done' });
    n.onclick = () => {
      try { windowImpl.focus(); } catch (_) {}
      n.close();
    };
  } catch {
    // ignore
  }
}

export async function requestNotifyPermission({ windowImpl = window } = {}) {
  try {
    const N = windowImpl.Notification;
    if (!N) return 'denied';
    if (N.permission === 'granted' || N.permission === 'denied') return N.permission;
    const result = await N.requestPermission();
    return result;
  } catch {
    return 'denied';
  }
}

// Decodes the URL-safe base64 VAPID key the server returns into the
// Uint8Array PushManager.subscribe expects.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerPushSubscription({ windowImpl = window, fetchImpl = fetch } = {}) {
  try {
    const navImpl = windowImpl.navigator;
    if (!navImpl || !navImpl.serviceWorker || !windowImpl.PushManager) return false;
    const reg = await navImpl.serviceWorker.ready;
    const keyResp = await fetchImpl('/api/push/vapid');
    if (!keyResp.ok) return false;
    const { publicKey } = await keyResp.json();
    if (!publicKey) return false;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }
    const body = sub.toJSON ? sub.toJSON() : sub;
    await fetchImpl('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return true;
  } catch (err) {
    try { windowImpl.console?.warn('push subscribe failed', err); } catch (_) {}
    return false;
  }
}

export async function unregisterPushSubscription({ windowImpl = window, fetchImpl = fetch } = {}) {
  try {
    const navImpl = windowImpl.navigator;
    if (!navImpl || !navImpl.serviceWorker) return;
    const reg = await navImpl.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await fetchImpl('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint })
    });
  } catch {
    // ignore
  }
}

export function setupDoneNotifyToggle({ documentImpl = document, windowImpl = window, storage = globalThis.localStorage, fetchImpl = (typeof fetch !== 'undefined' ? fetch : null) } = {}) {
  const btn = documentImpl.getElementById('notify-toggle');
  if (!btn) return;

  const render = () => {
    const enabled = isDoneNotifyEnabled({ storage });
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    btn.classList.toggle('active', enabled);
    btn.title = enabled ? 'Disable done notifications' : 'Notify when response is ready';
  };

  render();

  // If the user previously enabled notifications, make sure the push
  // subscription is registered on this device (it may be a new browser,
  // or the SW may have been reset). Cheap to call when already subscribed.
  if (isDoneNotifyEnabled({ storage }) && fetchImpl) {
    registerPushSubscription({ windowImpl, fetchImpl });
  }

  btn.addEventListener('click', async () => {
    const enabled = isDoneNotifyEnabled({ storage });
    if (enabled) {
      setDoneNotifyEnabled(false, { storage });
      if (fetchImpl) unregisterPushSubscription({ windowImpl, fetchImpl });
      render();
      return;
    }
    const permission = await requestNotifyPermission({ windowImpl });
    const granted = permission === 'granted';
    setDoneNotifyEnabled(granted, { storage });
    if (granted && fetchImpl) {
      await registerPushSubscription({ windowImpl, fetchImpl });
    }
    render();
  });
}

export function notifyDone({ windowImpl = window, documentImpl = document, storage = globalThis.localStorage } = {}) {
  if (!isDoneNotifyEnabled({ storage })) return;
  playDoneSound({ windowImpl });
  showDoneNotification({ windowImpl, documentImpl });
}
