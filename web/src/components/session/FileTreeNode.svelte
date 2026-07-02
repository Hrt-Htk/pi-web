<script>
  import {
    icon,
    ChevronDown,
    ChevronRight,
    FileText,
    Folder,
    FolderOpen,
  } from '../../shared/icons.js';
  import { fileStatusKind, folderStatusKind } from '../../session/chat/file-status.js';
  import { getFileTree as defaultGetFileTree } from '../../session/chat/files-api.js';
  import FileTreeNode from './FileTreeNode.svelte';

  let {
    entry,
    depth = 0,
    statusMap = {},
    sessionId,
    api = { getFileTree: defaultGetFileTree },
  } = $props();

  let expanded = $state(false);
  let children = $state(null); // null = not loaded yet, [] = empty, array = loaded
  let loading = $state(false);

  const basename = $derived(entry.path.split('/').pop());

  // Files reflect their own status; folders aggregate their descendants so you
  // can see which folders contain changes without expanding them.
  const statusKind = $derived(
    entry.isDir ? folderStatusKind(statusMap, entry.path) : fileStatusKind(statusMap[entry.path]),
  );

  async function toggle() {
    if (!entry.isDir) return;

    if (expanded) {
      expanded = false;
      return;
    }

    expanded = true;

    // Load children on first expand
    if (children === null) {
      loading = true;
      try {
        const data = await api.getFileTree(sessionId, entry.path);
        children = data.files || [];
      } catch {
        children = [];
      } finally {
        loading = false;
      }
    }
  }
</script>

<!-- eslint-disable svelte/no-at-html-tags -- trusted: Lucide icon SVG -->
<div class="ft-node" style="padding-left: {depth * 16}px">
  {#if entry.isDir}
    <button class="ft-node-folder" onclick={toggle} aria-expanded={expanded}>
      <span class="ft-chevron"
        >{@html icon(expanded ? ChevronDown : ChevronRight, { size: 14 })}</span
      >
      <span class="ft-folder-icon">
        {@html icon(expanded ? FolderOpen : Folder, { size: 16 })}
      </span>
      <span class="ft-name {statusKind ?? ''}">{basename}</span>
      {#if statusKind}
        <span class="ft-status-dot {statusKind}"></span>
      {/if}
    </button>
  {:else}
    <div class="ft-node-file">
      <span class="ft-file-icon">{@html icon(FileText, { size: 16 })}</span>
      <span class="ft-name {statusKind ?? ''}">{basename}</span>
      {#if statusKind}
        <span class="ft-status-dot {statusKind}"></span>
      {/if}
    </div>
  {/if}

  {#if expanded && entry.isDir}
    {#if loading}
      <div class="ft-node-loading">loading…</div>
    {:else}
      {#each children as child (child.path)}
        <FileTreeNode entry={child} depth={depth + 1} {statusMap} {sessionId} {api} />
      {/each}
    {/if}
  {/if}
</div>
