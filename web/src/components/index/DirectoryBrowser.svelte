<script>
  import { t } from '../../shared/i18n.js';
  import { icon, Folder, FileText, ChevronRight, Search } from '../../shared/icons.js';
  import { defaultBrowseDirectory } from '../../index/sessions.js';

  let { selectedPath = $bindable('') } = $props();

  let currentPath = $state('');
  let entries = $state([]);
  let loading = $state(false);
  let error = $state('');
  let query = $state('');
  let highlightedIndex = $state(-1);

  const filteredEntries = $derived(entries);

  $effect(() => {
    if (currentPath) {
      loadDirectory(currentPath);
    }
  });

  async function loadDirectory(path) {
    loading = true;
    error = '';
    query = '';
    highlightedIndex = -1;
    try {
      const response = await defaultBrowseDirectory(path, query);
      entries = response.entries || [];
      currentPath = response.path || path;
      // Auto-select if no path set yet
      if (!selectedPath) {
        selectedPath = currentPath;
      }
    } catch (e) {
      error = e.message || t('index.folderNotFound');
      entries = [];
    } finally {
      loading = false;
    }
  }

  function navigateTo(path) {
    currentPath = path;
  }

  function selectEntry(entry) {
    selectedPath = entry.isDir ? entry.path : getParentPath(entry.path);
  }

  function enterEntry(entry) {
    if (entry.isDir) {
      navigateTo(entry.path);
    } else {
      selectEntry(entry);
    }
  }

  function getParentPath(path) {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    return parts.length > 0 ? parts.join('/') : path;
  }

  function getBreadcrumbParts() {
    if (!currentPath) return [];
    const parts = currentPath.split('/').filter(Boolean);
    return parts.map((part, i) => ({
      label: part,
      path: parts.slice(0, i + 1).join('/'),
    }));
  }

  function handleKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, filteredEntries.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
    } else if (e.key === 'Enter' && highlightedIndex >= 0 && highlightedIndex < filteredEntries.length) {
      e.preventDefault();
      enterEntry(filteredEntries[highlightedIndex]);
    }
  }

  function handleSearch(e) {
    query = e.target.value;
    highlightedIndex = -1;
  }
</script>

<div class="directory-browser" role="listbox" tabindex="0" onkeydown={handleKeydown}>
  {#if error}
    <div class="browser-error">{error}</div>
  {:else}
    <div class="browser-search">
      <span class="search-icon">{@html icon(Search, { size: 14 })}</span>
      <input
        type="text"
        class="search-input"
        placeholder={t('index.browsePlaceholder')}
        bind:value={query}
        oninput={handleSearch}
      />
    </div>

    {#if currentPath}
      <div class="browser-breadcrumbs">
        {#each getBreadcrumbParts() as part (part.path)}
          <button
            type="button"
            class="breadcrumb-item"
            onclick={() => navigateTo(part.path)}
          >
            {part.label}
          </button>
          <span class="breadcrumb-sep">{@html icon(ChevronRight, { size: 10 })}</span>
        {/each}
      </div>
    {/if}

    {#if loading}
      <div class="browser-loading">{t('index.loadingFolders')}</div>
    {:else if filteredEntries.length === 0}
      <div class="browser-empty">No entries found</div>
    {:else}
      <div class="browser-list">
        {#each filteredEntries as entry, i (entry.path)}
          <div
            role="option"
            tabindex="-1"
            aria-selected={selectedPath === (entry.isDir ? entry.path : getParentPath(entry.path))}
            class="browser-entry"
            class:dir={entry.isDir}
            class:highlighted={i === highlightedIndex}
            class:selected={selectedPath === (entry.isDir ? entry.path : getParentPath(entry.path))}
            onclick={() => selectEntry(entry)}
            ondblclick={() => enterEntry(entry)}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                enterEntry(entry);
              }
            }}
          >
            {#if entry.isDir}
              <span class="entry-icon">{@html icon(Folder, { size: 16 })}</span>
            {:else}
              <span class="entry-icon entry-icon--file">{@html icon(FileText, { size: 16 })}</span>
            {/if}
            <span class="entry-name">{entry.name}</span>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .directory-browser {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 320px;
  }

  .browser-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: 1px solid var(--border-color, #444);
    border-radius: 6px;
    background: var(--surface-secondary, #1a1a2e);
  }

  .search-icon {
    flex-shrink: 0;
    color: var(--text-secondary, #888);
    display: flex;
    align-items: center;
  }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 13px;
    color: var(--text-primary, #e0e0e0);
    outline: none;
    font-family: inherit;
  }

  .search-input::placeholder {
    color: var(--text-secondary, #666);
  }

  .browser-breadcrumbs {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;
    padding: 4px 0;
    font-size: 12px;
  }

  .breadcrumb-item {
    background: none;
    border: none;
    color: var(--text-secondary, #aaa);
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 12px;
    font-family: inherit;
  }

  .breadcrumb-item:hover {
    background: var(--surface-tertiary, #2a2a3e);
    color: var(--text-primary, #e0e0e0);
  }

  .breadcrumb-sep {
    color: var(--text-secondary, #555);
    display: flex;
    align-items: center;
    padding: 0 1px;
  }

  .browser-list {
    flex: 1;
    overflow-y: auto;
    border: 1px solid var(--border-color, #333);
    border-radius: 6px;
    min-height: 120px;
    max-height: 240px;
  }

  .browser-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-primary, #e0e0e0);
    border-bottom: 1px solid var(--border-color, #222);
  }

  .browser-entry:last-child {
    border-bottom: none;
  }

  .browser-entry:hover {
    background: var(--surface-tertiary, #2a2a3e);
  }

  .browser-entry.highlighted {
    background: var(--accent-bg, #1a3a5a);
  }

  .browser-entry.selected {
    background: var(--accent-bg, #1a3a5a);
    outline: 1px solid var(--accent-color, #4a9eff);
  }

  .browser-entry.dir {
    font-weight: 500;
  }

  .entry-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    color: var(--accent-color, #4a9eff);
  }

  .entry-icon--file {
    color: var(--text-secondary, #888);
  }

  .entry-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .browser-loading,
  .browser-empty,
  .browser-error {
    padding: 20px;
    text-align: center;
    color: var(--text-secondary, #888);
    font-size: 13px;
  }

  .browser-error {
    color: var(--error-color, #ff6b6b);
  }
</style>
