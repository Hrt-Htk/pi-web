<script>
  import { onMount } from 'svelte';
  import { t } from '../../shared/i18n.js';
  import { icon, Folder, FileText, ChevronRight, Search } from '../../shared/icons.js';
  import { defaultBrowseDirectory, defaultFetchDrives } from '../../index/sessions.js';

  let { selectedPath = $bindable('') } = $props();

  let currentPath = $state('');
  let entries = $state([]);
  let loading = $state(false);
  let error = $state('');
  let query = $state('');
  let highlightedIndex = $state(-1);
  let drives = $state([]);

  const filteredEntries = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => entry.name.toLowerCase().includes(q));
  });

  onMount(() => {
    loadDrives();
    loadDirectory(currentPath);
  });

  async function loadDrives() {
    try {
      const response = await defaultFetchDrives();
      drives = response.drives || [];
    } catch {
      drives = [];
    }
  }

  function isActiveDrive(d) {
    return currentPath.toLowerCase().startsWith(d.toLowerCase());
  }

  async function loadDirectory(path) {
    if (loading) return;
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
    loadDirectory(path);
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

  function getPathSep(path) {
    return path.includes('\\') ? '\\' : '/';
  }

  function getParentPath(path) {
    const sep = getPathSep(path);
    const trimmed = path.replace(/[\\/]+$/, '');
    const idx = trimmed.lastIndexOf(sep);
    if (idx < 0) return path;
    const parent = trimmed.slice(0, idx);
    return parent || sep;
  }

  function getBreadcrumbParts() {
    if (!currentPath) return [];
    const sep = getPathSep(currentPath);
    const isUnixAbsolute = currentPath.startsWith('/');
    const parts = currentPath.split(/[\\/]+/).filter(Boolean);
    return parts.map((part, i) => {
      let path = parts.slice(0, i + 1).join(sep);
      if (isUnixAbsolute) path = '/' + path;
      return { label: part, path };
    });
  }

  function handleKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, filteredEntries.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
    } else if (
      e.key === 'Enter' &&
      highlightedIndex >= 0 &&
      highlightedIndex < filteredEntries.length
    ) {
      e.preventDefault();
      enterEntry(filteredEntries[highlightedIndex]);
    }
  }

  function handleSearch(e) {
    query = e.target.value;
    highlightedIndex = -1;
  }
</script>

<!-- eslint-disable svelte/no-at-html-tags -- trusted: Lucide icon SVG -->
<div class="directory-browser" role="listbox" tabindex="0" onkeydown={handleKeydown}>
  {#if error}
    <div class="browser-error">{error}</div>
  {:else}
    {#if drives.length > 1}
      <div class="browser-drives">
        {#each drives as d (d)}
          <button
            type="button"
            class="drive-chip"
            class:active={isActiveDrive(d)}
            onclick={() => navigateTo(d)}>{d}</button
          >
        {/each}
      </div>
    {/if}
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
          <button type="button" class="breadcrumb-item" onclick={() => navigateTo(part.path)}>
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
