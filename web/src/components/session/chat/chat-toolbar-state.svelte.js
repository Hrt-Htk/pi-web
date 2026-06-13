import { writable } from 'svelte/store';

export function isRunningStatus(text, cls) {
  return (
    cls === 'running' ||
    text === 'running' ||
    text === 'sending' ||
    text === 'queued' ||
    text === 'accepted' ||
    text === 'cancelling'
  );
}

// Reactive toolbar state shared between the live runtime (chat-composer-runtime.js)
// and the declarative <ChatToolbar>. The runtime mutates these fields; the
// component reads them through bindings. Replaces the former imperative
// getElementById/textContent DOM mutation. Live-only.
// Bridges the composer's worker-running state to the live streaming spinner in
// <LiveReload>. ChatToolbarState is instantiated per-component, so this module-level
// store is the shared channel between the two components. Live-only.
export const chatRunningStore = writable(false);

export class ChatToolbarState {
  statusText = $state('');
  statusClass = $state('');
  modelLabel = $state('');
  thinkingLevel = $state('');
  knownModelLabel = $state('');
  knownThinkingLevel = $state('');

  // Injected by the runtime once the context-usage controller exists.
  updateContextUsage = () => {};

  isRunning = $derived(isRunningStatus(this.statusText, this.statusClass));

  setStatus = (text, cls = '') => {
    this.statusText = text;
    this.statusClass = cls;
  };

  setModelLabel = (label) => {
    if (label) this.modelLabel = label;
    this.updateContextUsage();
  };

  setThinkingLabel = (level) => {
    this.thinkingLevel = level || '';
  };

  getKnownModelLabel = () => this.knownModelLabel;
  setKnownModelLabel = (label) => {
    this.knownModelLabel = label;
  };
  getKnownThinkingLevel = () => this.knownThinkingLevel;
  setKnownThinkingLevel = (level) => {
    this.knownThinkingLevel = level;
  };
}
