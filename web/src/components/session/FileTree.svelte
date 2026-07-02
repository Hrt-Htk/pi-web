<script>
  import { t } from '../../shared/i18n.js';
  import FileTreeNode from './FileTreeNode.svelte';
  import {
    getFileTree as defaultGetFileTree,
    getFilesGitStatus as defaultGetFilesGitStatus,
  } from '../../session/chat/files-api.js';

  let {
    sessionId,
    api = {
      getFileTree: defaultGetFileTree,
      getFilesGitStatus: defaultGetFilesGitStatus,
    },
  } = $props();

  let files = $state([]);
  let loading = $state(true);
  let error = $state(false);
  let statusMap = $state({});

  $effect(() => {
    loading = true;
    error = false;
    files = [];
    statusMap = {};

    Promise.all([api.getFileTree(sessionId, ''), api.getFilesGitStatus(sessionId)])
      .then(([treeData, statusData]) => {
        let tree = treeData.files || [];
        // Sort: directories first, then alphabetical
        tree = [...tree].sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.path.localeCompare(b.path);
        });
        files = tree;

        // Build statusMap from git status response
        const map = {};
        for (const entry of statusData.files || []) {
          map[entry.path] = entry.status;
        }
        statusMap = map;
      })
      .catch(() => {
        error = true;
        files = [];
      })
      .finally(() => {
        loading = false;
      });
  });
</script>

<div class="file-tree">
  {#if loading}
    <div class="file-tree-state">{t('files.loading')}</div>
  {:else if error}
    <div class="file-tree-state file-tree-error">{t('files.error')}</div>
  {:else if files.length === 0}
    <div class="file-tree-state">{t('files.empty')}</div>
  {:else}
    {#each files as entry (entry.path)}
      <FileTreeNode {entry} depth={0} {statusMap} {sessionId} {api} />
    {/each}
  {/if}
</div>
