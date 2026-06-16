<script>
  import { t } from '../../shared/i18n.js';
  import FullScreenSheet from './FullScreenSheet.svelte';
  import { getDirtyFiles } from '../../session/chat/git-api.js';

  let { open = $bindable(false), sessionId = '' } = $props();

  let files = $state([]);
  let loading = $state(false);

  $effect(() => {
    if (open && sessionId) {
      loading = true;
      files = [];
      getDirtyFiles(sessionId)
        .then((data) => {
          files = data.files || [];
        })
        .catch(() => {
          files = [];
        })
        .finally(() => {
          loading = false;
        });
    }
  });

  const groups = $derived.by(() => {
    const modified = [], newFiles = [], deleted = [];
    for (const f of files) {
      const s = f.status;
      if (s === '??' || s.includes('A')) {
        newFiles.push(f);
      } else if (s.includes('D')) {
        deleted.push(f);
      } else {
        modified.push(f);
      }
    }
    return [
      { label: t('git.groupModified'), kind: 'modified', items: modified },
      { label: t('git.groupNew'), kind: 'new', items: newFiles },
      { label: t('git.groupDeleted'), kind: 'deleted', items: deleted },
    ].filter((g) => g.items.length > 0);
  });

  const kindClass = (kind) => {
    if (kind === 'modified') return 'pi-modified';
    if (kind === 'new') return 'pi-new';
    return 'pi-deleted';
  };
</script>

<FullScreenSheet
  bind:open
  title={t('git.dirtyFilesTitle')}
  backdropClass="dirty-sheet-backdrop"
  panelClass="dirty-sheet-panel"
  bodyClass="dirty-sheet-body"
>
  <div class="dirty-files-palette">
    <div class="dirty-files-content">
      {#if loading}
        <div class="dirty-files-loading">{t('git.loading')}</div>
      {:else if files.length === 0}
        <div class="dirty-files-empty">{t('git.noChanges')}</div>
      {:else}
        {#each groups as g}
          <div class="dirty-files-group">
            <div class="dirty-files-group-title {kindClass(g.kind)}">
              {g.label}<span class="dirty-files-group-count">{g.items.length}</span>
            </div>
            <div class="dirty-files-list">
              {#each g.items as f (f.path)}
                <div class="dirty-files-item" title={f.path}>
                  <span class="dirty-files-path">{f.path}</span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</FullScreenSheet>
