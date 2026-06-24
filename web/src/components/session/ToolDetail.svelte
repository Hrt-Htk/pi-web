<!-- Tool detail bottom-sheet overlay. Renders nothing when closed (lazy). -->
<script>
  import { icon, X, ChevronRight, Lightbulb } from '../../shared/icons.js';
  import { t } from '../../shared/i18n.js';
  import { fly, fade } from 'svelte/transition';
  import { getToolSheet, closeToolSheet } from '../../session/ui/tool-sheet.svelte.js';
  import {
    resolveToolStatus,
    resolveToolResult,
    diffStat,
    aggregateStatus,
  } from '../../session/render/tool-summary.js';
  import { str } from '../../session/render/entry-format.js';
  import { shortenPath } from '../../session/render/session-format.js';
  import { iconForTool } from './tool-icons.js';
  import ToolCall from './ToolCall.svelte';

  const sheet = $derived(getToolSheet());

  // ── Drag-resize state ──
  let dragHeight = $state(null);
  let sheetEl = $state(null);
  let dragging = $state(false);
  let armed = $state(false);
  let didDrag = $state(false);
  let startY = 0;
  let startHeight = 0;
  let pointerId = -1;

  $effect(() => {
    // Reset dragHeight whenever the sheet closes so the next open uses the CSS default.
    if (!sheet.open) {
      dragHeight = null;
    }
  });

  function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  function handlePointerDown(e) {
    if (e.target.closest('.tool-sheet-close')) return;
    startY = e.clientY;
    startHeight = sheetEl.getBoundingClientRect().height;
    pointerId = e.pointerId;
    armed = true;
    dragging = false;
    didDrag = false;
  }

  function handlePointerMove(e) {
    if (!armed) return;
    if (!dragging && Math.abs(e.clientY - startY) < 8) return;
    if (!dragging) {
      dragging = true;
      didDrag = true;
      sheetEl.setPointerCapture(pointerId);
    }
    e.preventDefault();
    const MAX = window.innerHeight * 0.96;
    dragHeight = clamp(startHeight + (startY - e.clientY), 80, MAX);
  }

  function handlePointerUp(_e) {
    if (dragging) {
      sheetEl.releasePointerCapture(pointerId);
      if (dragHeight < 140) {
        dragHeight = null;
        closeToolSheet();
      }
    }
    armed = false;
    dragging = false;
  }

  function handleClickCapture(e) {
    if (didDrag) {
      e.preventDefault();
      e.stopPropagation();
      didDrag = false;
    }
  }

  $effect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && sheet.open) {
        closeToolSheet();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  $effect(() => {
    document.body.classList.toggle('pi-tool-sheet-open', sheet.open);
    return () => {
      document.body.classList.remove('pi-tool-sheet-open');
    };
  });

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) {
      closeToolSheet();
    }
  }

  const VERB_LABELS = {
    read: 'Read',
    edit: 'Edited',
    write: 'Created',
    bash: 'Ran',
    grep: 'Searched',
    find: 'Searched',
    ls: 'Searched',
  };

  function getVerbLabel(name) {
    return VERB_LABELS[name] ?? name;
  }

  function getToolDisplayPath(call) {
    const args = call.arguments || {};
    const path = str(args.file_path ?? args.path);
    if (path) return shortenPath(path);
    const command = str(args.command);
    if (command) return command.length > 40 ? command.slice(0, 40) + '…' : command;
    return null;
  }
</script>

<!-- eslint-disable svelte/no-at-html-tags -- trusted: Lucide icon SVG -->
{#if sheet.open}
  <div
    class="tool-sheet-backdrop"
    role="presentation"
    onclick={handleBackdropClick}
    transition:fade={{ duration: 150 }}
  >
    <div
      class="tool-sheet"
      role="presentation"
      bind:this={sheetEl}
      style:height={dragHeight != null ? dragHeight + 'px' : null}
      style:max-height={dragHeight != null ? '96vh' : null}
      transition:fly={{ y: 320, duration: 260, opacity: 1 }}
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointercancel={handlePointerUp}
      onclickcapture={handleClickCapture}
    >
      <div class="tool-sheet-handle" role="presentation"></div>
      <div class="tool-sheet-header">
        <div class="tool-sheet-header-center">
          <div class="tool-sheet-title">{sheet.summary}</div>
          <div class="tool-sheet-subtitle">
            {#if aggregateStatus(sheet.chip.tools, sheet.model) === 'success'}
              Completed
            {:else if aggregateStatus(sheet.chip.tools, sheet.model) === 'pending'}
              Running
            {:else}
              Failed
            {/if}
          </div>
        </div>
        <button
          class="tool-sheet-close"
          aria-label={t('session.toolSheetClose')}
          onclick={() => closeToolSheet()}
        >
          {@html icon(X, { size: 14 })}
        </button>
      </div>
      <div class="tool-sheet-body">
        {#if sheet.chip?.thinking}
          <details class="tool-sheet-row">
            <summary class="tool-sheet-row-summary">
              {@html icon(Lightbulb, { size: 14, class: 'tool-sheet-row-icon' })}
              <span class="tool-sheet-row-label">Thought</span>
              {@html icon(ChevronRight, { size: 14, class: 'tool-sheet-row-chevron' })}
            </summary>
            <div class="tool-sheet-row-body">
              <pre class="tool-sheet-thinking">{sheet.chip.thinking.text}</pre>
            </div>
          </details>
        {/if}
        {#each sheet.chip?.tools ?? [] as tool (tool.block?.id ?? tool)}
          {@const displayPath = getToolDisplayPath(tool.block)}
          <details class="tool-sheet-row">
            <summary class="tool-sheet-row-summary">
              {@html icon(iconForTool(tool.block?.name ?? ''), {
                size: 14,
                class: 'tool-sheet-row-icon',
              })}
              <span class="tool-sheet-row-label">
                {getVerbLabel(tool.block?.name ?? '')}
                {#if displayPath}
                  <span class="tool-sheet-row-path">{displayPath}</span>
                {/if}
                {#if tool.block?.id}
                  {@const status = resolveToolStatus(sheet.model, tool.block.id)}
                  {#if status === 'success'}
                    <span class="status-badge status-badge--success">OK</span>
                  {:else if status === 'error'}
                    <span class="status-badge status-badge--error">ERR</span>
                  {/if}
                  {@const result = resolveToolResult(sheet.model, tool.block.id)}
                  {#if result?.details?.diff && (tool.block?.name === 'edit' || tool.block?.name === 'write')}
                    {@const stat = diffStat(result.details.diff)}
                    {#if stat.added > 0}<span class="diff-stat-added">+{stat.added}</span>{/if}
                    {#if stat.removed > 0}<span class="diff-stat-removed">-{stat.removed}</span
                      >{/if}
                  {/if}
                {/if}
              </span>
              {@html icon(ChevronRight, { size: 14, class: 'tool-sheet-row-chevron' })}
            </summary>
            <div class="tool-sheet-row-body">
              <ToolCall call={tool.block} model={sheet.model} fullOutput={true} />
            </div>
          </details>
        {/each}
      </div>
    </div>
  </div>
{/if}
