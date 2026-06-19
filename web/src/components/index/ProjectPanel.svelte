<script>
  // Project detail panel — opens as a FullScreenSheet from the index page.
  // Shows project metadata, git status, open issues, and open PRs.
  import { t } from '../../shared/i18n.js';
  import FullScreenSheet from '../session/FullScreenSheet.svelte';
  import { icon, ExternalLink, FolderOpen, Pencil } from '../../shared/icons.js';
  import { fetchProjectData, updateProjectName } from '../../project/project-page-data.js';

  let { open = $bindable(false), projectPath = '' } = $props();

  let loading = $state(false);
  let error = $state('');
  let project = $state(null);
  let gitInfo = $state(null);
  let openIssues = $state([]);
  let openPRs = $state([]);
  let sessionCount = $state(0);
  let editingName = $state(false);
  let editName = $state('');

  $effect(() => {
    if (open && projectPath && !project) {
      loadData();
    } else if (!open) {
      project = null;
      gitInfo = null;
      openIssues = [];
      openPRs = [];
      sessionCount = 0;
      error = '';
      editingName = false;
    }
  });

  async function loadData() {
    loading = true;
    error = '';
    try {
      const data = await fetchProjectData(projectPath);
      project = data.project;
      gitInfo = data.gitInfo;
      openIssues = data.openIssues || [];
      openPRs = data.openPRs || [];
      sessionCount = data.sessionCount || 0;
      editName = data.project?.name || '';
    } catch (e) {
      error = e.message || t('project.loadFailed');
    } finally {
      loading = false;
    }
  }

  async function saveName() {
    const name = editName.trim();
    if (!name) return;
    try {
      await updateProjectName(projectPath, name);
      project = { ...project, name };
      editingName = false;
    } catch (e) {
      error = t('project.nameSaveFailed');
    }
  }
</script>

<!-- eslint-disable svelte/no-at-html-tags -- trusted: Lucide icon SVG -->
<FullScreenSheet
  bind:open
  title={t('project.pageTitle')}
  backdropClass="project-sheet-backdrop"
  panelClass="project-sheet-panel"
  bodyClass="project-sheet-body"
>
  {#if loading}
    <div class="project-loading">{t('project.loading')}</div>
  {:else if error && !project}
    <div class="project-error">
      <p>{error}</p>
    </div>
  {:else if project}
    <div class="project-content">
      <!-- Name (editable) -->
      <div class="project-title-row">
        {#if editingName}
          <div class="name-edit">
            <input
              type="text"
              bind:value={editName}
              class="name-input"
              onkeydown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') editingName = false;
              }}
            />
            <button class="btn-primary btn-sm" onclick={saveName}>{t('project.saveName')}</button>
            <button class="btn-secondary btn-sm" onclick={() => (editingName = false)}>{t('project.cancelEdit')}</button>
          </div>
        {:else}
          <h1 class="project-name">
            <span class="project-path" title={project.projectPath}>{project.name}</span>
            <button
              class="edit-name-btn"
              type="button"
              aria-label={t('project.editName')}
              onclick={() => {
                editName = project?.name || '';
                editingName = true;
              }}
            >{@html icon(Pencil, { size: 14 })}</button>
          </h1>
        {/if}
      </div>

      <!-- Meta: repo, description, sessions -->
      <div class="project-meta">
        {#if project.repo}
          <a
            class="meta-item repo-link"
            href={'https://github.com/' + project.repo}
            target="_blank"
            rel="noopener noreferrer"
          >
            {@html icon(ExternalLink, { size: 14 })}
            <span>{project.repo}</span>
          </a>
        {/if}
        {#if project.readmeDescription}
          <p class="meta-item description">
            <span class="meta-label">{t('project.description')}:</span> {project.readmeDescription}
          </p>
        {/if}
        <div class="meta-item sessions">
          {@html icon(FolderOpen, { size: 14 })}
          <span>{sessionCount} session{sessionCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <!-- Git status -->
      {#if gitInfo?.isRepo}
        <div class="project-git-section">
          <h2 class="section-title">{t('project.gitStatus')}</h2>
          <div class="git-info-row">
            <span class="git-branch">{gitInfo.branch}</span>
            {#if gitInfo.dirty}
              <span class="git-badge git-dirty">{t('project.gitDirty')}</span>
            {:else}
              <span class="git-badge git-clean">{t('project.gitClean')}</span>
            {/if}
            {#if gitInfo.ahead > 0}
              <span class="git-badge git-ahead">{t('project.gitAhead', { n: gitInfo.ahead })}</span>
            {/if}
            {#if gitInfo.behind > 0}
              <span class="git-badge git-behind">{t('project.gitBehind', { n: gitInfo.behind })}</span>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Open Issues -->
      <div class="project-section">
        <h2 class="section-title">{t('project.openIssues')}</h2>
        {#if openIssues.length === 0}
          <p class="empty-state">{t('project.noIssues')}</p>
        {:else}
          <ul class="item-list">
            {#each openIssues as issue (issue.number)}
              <li>
                <a href={issue.url} target="_blank" rel="noopener noreferrer" class="item-link">
                  <span class="item-number">#{issue.number}</span> {issue.title}
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <!-- Open PRs -->
      <div class="project-section">
        <h2 class="section-title">{t('project.openPRs')}</h2>
        {#if openPRs.length === 0}
          <p class="empty-state">{t('project.noPRs')}</p>
        {:else}
          <ul class="item-list">
            {#each openPRs as pr (pr.number)}
              <li>
                <a href={pr.url} target="_blank" rel="noopener noreferrer" class="item-link">
                  <span class="item-number">#{pr.number}</span> {pr.title}
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  {/if}
</FullScreenSheet>

<style>
  .project-loading,
  .project-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 2rem 1rem;
    color: var(--text-secondary);
  }

  .project-content {
    max-width: 600px;
    margin: 0 auto;
  }

  .project-title-row {
    margin-bottom: 1.5rem;
  }

  .project-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
  }

  .project-path {
    font-family: var(--font-mono);
    font-size: 1.1rem;
    word-break: break-all;
  }

  .edit-name-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    opacity: 0.5;
    padding: 2px;
    display: inline-flex;
    align-items: center;
  }

  .edit-name-btn:hover {
    opacity: 1;
    color: var(--text);
  }

  .name-edit {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .name-input {
    flex: 1;
    font-size: 1.1rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-mono);
  }

  .btn-sm {
    font-size: 0.8rem;
    padding: 0.25rem 0.5rem;
  }

  .project-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .meta-item {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .repo-link {
    color: var(--accent);
    text-decoration: none;
  }

  .repo-link:hover {
    text-decoration: underline;
  }

  .description {
    display: block;
    max-width: 100%;
  }

  .meta-label {
    font-weight: 500;
    color: var(--text);
  }

  .section-title {
    font-size: 0.8rem;
    font-weight: 600;
    margin: 0 0 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .project-git-section {
    margin-bottom: 2rem;
  }

  .git-info-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .git-branch {
    font-family: var(--font-mono);
    font-size: 0.875rem;
    color: var(--text);
  }

  .git-badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 10px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .git-clean {
    background: var(--success-bg, #1a3a2a);
    color: var(--success, #4ade80);
  }

  .git-dirty {
    background: var(--warning-bg, #3a2a1a);
    color: var(--warning, #fbbf24);
  }

  .git-ahead,
  .git-behind {
    background: var(--info-bg, #1a2a3a);
    color: var(--info, #60a5fa);
  }

  .project-section {
    margin-bottom: 2rem;
  }

  .empty-state {
    color: var(--text-secondary);
    font-style: italic;
    font-size: 0.875rem;
  }

  .item-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .item-list li {
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .item-link {
    color: var(--text);
    text-decoration: none;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .item-link:hover {
    color: var(--accent);
  }

  .item-number {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--text-secondary);
  }
</style>
