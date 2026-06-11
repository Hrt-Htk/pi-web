<script>
  import { onMount } from 'svelte';
  import { icon, ChevronDown } from '../../shared/icons.js';
  import { t } from '../../shared/i18n.js';
  import {
    activityMs,
    collapsedProjectsStorageKey,
    filterSessions,
    groupSessionsByProject,
    sessionsCountLabel,
  } from '../../index/sessions.js';
  import SessionCard from './SessionCard.svelte';

  let {
    sessions = [],
    layout = 'timeline',
    query = '',
    runningSessionIds = new Set(),
    runningStatuses = new Map(),
    loading = false,
    layoutReady = false,
    onArchive = null,
  } = $props();

  let now = $state(Date.now());
  let collapsed = $state({});
  let archivedOpen = $state({});
  let timelineArchivedOpen = $state(false);

  const visibleSessions = $derived(filterSessions(sessions, query));
  const isTimeline = $derived(layout === 'timeline');
  const searching = $derived(String(query || '').trim() !== '');

  const groups = $derived(isTimeline ? [] : groupSessionsByProject(visibleSessions));

  const timelineSorted = $derived(
    [...visibleSessions].sort((a, b) => activityMs(b) - activityMs(a)),
  );
  const timelineActive = $derived(
    searching ? timelineSorted : timelineSorted.filter((session) => !session.archived),
  );
  const timelineArchived = $derived(
    searching ? [] : timelineSorted.filter((session) => session.archived),
  );

  function toggleTimelineArchived() {
    timelineArchivedOpen = !timelineArchivedOpen;
  }

  function splitArchived(sessionList) {
    const active = [];
    const archived = [];
    for (const session of sessionList) {
      if (session.archived) archived.push(session);
      else active.push(session);
    }
    return { active, archived };
  }

  function readCollapsed() {
    try {
      const raw = localStorage.getItem(collapsedProjectsStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeCollapsed(state) {
    try {
      localStorage.setItem(collapsedProjectsStorageKey, JSON.stringify(state));
    } catch {}
  }

  function toggleProject(project) {
    collapsed = { ...collapsed, [project]: collapsed[project] ? undefined : 1 };
    if (!collapsed[project]) {
      const next = { ...collapsed };
      delete next[project];
      collapsed = next;
    }
    writeCollapsed(collapsed);
  }

  function toggleArchived(project) {
    archivedOpen = { ...archivedOpen, [project]: !archivedOpen[project] };
  }

  function runningCountFor(group) {
    return group.sessions.filter((session) => runningSessionIds.has(session.id)).length;
  }

  onMount(() => {
    collapsed = readCollapsed();
    const timer = setInterval(() => {
      now = Date.now();
    }, 60000);
    return () => clearInterval(timer);
  });
</script>

<!-- eslint-disable svelte/no-at-html-tags -- trusted: Lucide icon SVG and rendered session markdown -->

<div
  class="content"
  class:content--timeline={isTimeline}
  class:index-layout-ready={layoutReady}
  data-sessions-content
>
  {#if loading && sessions.length === 0}
    <div class="empty-state">
      <h3>{t('index.loadingSessions')}</h3>
      <p>{t('index.loadingSessionsHint')}</p>
    </div>
  {:else if sessions.length === 0}
    <div class="empty-state">
      <h3>{t('index.noSessionsYet')}</h3>
      <p>{t('index.noSessionsYetHint')}</p>
    </div>
  {:else if visibleSessions.length === 0}
    <div class="empty-state">
      <h3>{t('index.noSessions')}</h3>
      <p>{t('index.noSessionsHint')}</p>
    </div>
  {:else if isTimeline}
    <div class="session-grid session-grid--timeline session-grid--flat">
      {#each timelineActive as session (session.id)}
        <SessionCard
          {session}
          running={runningSessionIds.has(session.id)}
          runningStatus={runningStatuses.get(session.id)}
          {now}
          {onArchive}
          showProject
        />
      {/each}
    </div>
    {#if timelineArchived.length > 0}
      <button
        class="archived-toggle"
        type="button"
        aria-expanded={String(timelineArchivedOpen)}
        onclick={toggleTimelineArchived}
      >
        <span class="project-chevron" aria-hidden="true"
          >{@html icon(ChevronDown, { size: 12 })}</span
        >
        {t('index.archivedCount', { count: timelineArchived.length })}
      </button>
      {#if timelineArchivedOpen}
        <div class="session-grid session-grid--timeline session-grid--flat archived-grid">
          {#each timelineArchived as session (session.id)}
            <SessionCard
              {session}
              running={runningSessionIds.has(session.id)}
              runningStatus={runningStatuses.get(session.id)}
              {now}
              {onArchive}
              showProject
            />
          {/each}
        </div>
      {/if}
    {/if}
  {:else}
    {#each groups as group (group.project + ':' + group.sessions[0]?.id)}
      {@const runningCount = runningCountFor(group)}
      {@const isCollapsed = !!collapsed[group.project]}
      {@const split = splitArchived(group.sessions)}
      {@const cards = searching ? group.sessions : split.active}
      {@const archOpen = !!archivedOpen[group.project]}
      <div class="project-group" class:collapsed={isCollapsed} data-project={group.project}>
        <button
          class="project-toggle"
          type="button"
          aria-expanded={String(!isCollapsed)}
          onclick={() => toggleProject(group.project)}
        >
          <span class="project-chevron" aria-hidden="true"
            >{@html icon(ChevronDown, { size: 12 })}</span
          >
          <span class="project-name">{group.project}</span>
          <span
            class="project-count"
            data-project-count
            data-running={runningCount}
            data-total={cards.length}
          >
            {runningCount > 0
              ? t('index.activeCount', { count: runningCount })
              : sessionsCountLabel(cards.length)}
          </span>
        </button>
        <div class="session-grid">
          {#each cards as session (session.id)}
            <SessionCard
              {session}
              running={runningSessionIds.has(session.id)}
              runningStatus={runningStatuses.get(session.id)}
              {now}
              {onArchive}
            />
          {/each}
        </div>
        {#if !searching && split.archived.length > 0}
          <button
            class="archived-toggle"
            type="button"
            aria-expanded={String(archOpen)}
            onclick={() => toggleArchived(group.project)}
          >
            <span class="project-chevron" aria-hidden="true"
              >{@html icon(ChevronDown, { size: 12 })}</span
            >
            {t('index.archivedCount', { count: split.archived.length })}
          </button>
          {#if archOpen}
            <div class="session-grid archived-grid">
              {#each split.archived as session (session.id)}
                <SessionCard
                  {session}
                  running={runningSessionIds.has(session.id)}
                  runningStatus={runningStatuses.get(session.id)}
                  {now}
                  {onArchive}
                />
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    {/each}
  {/if}
</div>
