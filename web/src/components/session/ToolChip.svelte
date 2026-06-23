<!-- Compact action chip row. Click opens the tool detail overlay. -->
<script>
  import { icon, Check, CircleAlert, Loader2, ChevronRight } from '../../shared/icons.js';
  import { t } from '../../shared/i18n.js';
  import {
    chipSummaryText,
    aggregateStatus,
    resolveToolResult,
    diffStat,
  } from '../../session/render/tool-summary.js';
  import { openToolSheet } from '../../session/ui/tool-sheet.svelte.js';

  let { chip, model } = $props();

  const summary = $derived(chipSummaryText(chip));
  const status = $derived(aggregateStatus(chip.tools, model));

  const chipDiffStat = $derived.by(() => {
    let added = 0,
      removed = 0;
    for (const tool of chip.tools) {
      const name = tool.block?.name ?? '';
      if (name === 'edit' || name === 'write') {
        const callId = tool.block?.id ?? tool.id;
        const result = resolveToolResult(model, callId);
        if (result?.details?.diff) {
          const stat = diffStat(result.details.diff);
          added += stat.added;
          removed += stat.removed;
        }
      }
    }
    return { added, removed };
  });

  function handleClick() {
    openToolSheet({ chip, summary, model });
  }
</script>

<!-- eslint-disable svelte/no-at-html-tags -- trusted: Lucide icon SVG -->
<button
  class="tool-chip"
  aria-haspopup="dialog"
  aria-label={t('session.toolChipOpen')}
  onclick={handleClick}
>
  <span class="tool-chip-label">{summary}</span>
  {#if chip.tools.length > 0}
    {#if chipDiffStat.added > 0 || chipDiffStat.removed > 0}
      {#if chipDiffStat.added > 0}<span class="diff-stat-added">+{chipDiffStat.added}</span>{/if}
      {#if chipDiffStat.removed > 0}<span class="diff-stat-removed">-{chipDiffStat.removed}</span
        >{/if}
    {/if}
    {#if status === 'success'}
      {@html icon(Check, { size: 14, class: 'tool-chip-status tool-chip-status--success' })}
    {:else if status === 'error'}
      {@html icon(CircleAlert, { size: 14, class: 'tool-chip-status tool-chip-status--error' })}
    {:else}
      {@html icon(Loader2, { size: 14, class: 'tool-chip-status tool-chip-status--pending' })}
    {/if}
  {/if}
  {@html icon(ChevronRight, { size: 12, class: 'tool-chip-chevron' })}
</button>
