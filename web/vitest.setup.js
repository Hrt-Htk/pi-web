// Global vitest setup. Registers @testing-library/jest-dom matchers and
// auto-cleans rendered components between tests. Also installs a real
// in-memory localStorage/sessionStorage: this vitest+jsdom combo exposes
// `localStorage` as a bare `{}` with no Storage methods, which breaks tests
// and components that use the global store.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';

class MemoryStorage {
  #store = new Map();
  get length() {
    return this.#store.size;
  }
  key(index) {
    return Array.from(this.#store.keys())[index] ?? null;
  }
  getItem(key) {
    const k = String(key);
    return this.#store.has(k) ? this.#store.get(k) : null;
  }
  setItem(key, value) {
    this.#store.set(String(key), String(value));
  }
  removeItem(key) {
    this.#store.delete(String(key));
  }
  clear() {
    this.#store.clear();
  }
}

function installStorage(name) {
  const storage = new MemoryStorage();
  for (const target of [globalThis, globalThis.window].filter(Boolean)) {
    Object.defineProperty(target, name, {
      value: storage,
      writable: true,
      configurable: true,
    });
  }
  return storage;
}

let localStorageImpl = installStorage('localStorage');
let sessionStorageImpl = installStorage('sessionStorage');

beforeEach(() => {
  localStorageImpl.clear();
  sessionStorageImpl.clear();
});

afterEach(() => {
  cleanup();
});
