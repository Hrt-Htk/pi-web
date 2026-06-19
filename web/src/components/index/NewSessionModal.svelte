<script>
  import { onMount } from 'svelte';
  import { t } from '../../shared/i18n.js';
  import DirectoryBrowser from './DirectoryBrowser.svelte';

  let {
    open = false,
    recent = [],
    path = $bindable(''),
    creating = false,
    error = '',
    onClose = () => {},
    onCreate = () => {},
  } = $props();

  let browserPath = $state('');

  // Keep browserPath in sync with the bindable path prop
  $effect(() => {
    browserPath = path;
  });

  $effect(() => {
    if (browserPath) {
      path = browserPath;
    }
  });

  function chooseRecent(loc) {
    browserPath = loc;
    path = loc;
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Don't intercept if focus is on the search input inside the browser
      if (e.target.tagName === 'INPUT') return;
      e.preventDefault();
      onCreate();
    }
  }

  onMount(() => {
    if (open && !browserPath) {
      // DirectoryBrowser will auto-load home directory
    }
  });
</script>

<div
  class="modal-overlay"
  id="modalOverlay"
  class:visible={open}
  class:open
  role="presentation"
  onclick={(e) => {
    if (e.currentTarget === e.target) onClose();
  }}
  onkeydown={handleKeydown}
>
  <div class="modal">
    <div class="modal-sheet-header">
      <button
        class="modal-sheet-back"
        id="modalBackBtn"
        type="button"
        aria-label={t('index.closeNewSession')}
        onclick={onClose}
      >
        <span aria-hidden="true">←</span>
        <span>{t('index.startNewSession')}</span>
      </button>
    </div>
    <h2>{t('index.startNewSession')}</h2>
    <div class="recent-locations" id="recentLocations">
      {#each recent as loc (loc)}
        <button type="button" class="recent-chip" onclick={() => chooseRecent(loc)}>{loc}</button>
      {/each}
    </div>
    <DirectoryBrowser bind:selectedPath={browserPath} />
    <div class="modal-path-display" id="selectedPath">
      {#if browserPath}
        <span class="path-label">{t('index.selectedPath')}:</span>
        <span class="path-value" title={browserPath}>{browserPath}</span>
      {/if}
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" id="cancelBtn" type="button" onclick={onClose}
        >{t('common.cancel')}</button
      >
      <button
        class="btn-primary"
        id="createBtn"
        type="button"
        disabled={creating || !browserPath}
        onclick={onCreate}>{t('common.create')}</button
      >
    </div>
    <div class="modal-error" id="modalError">{error}</div>
  </div>
</div>
