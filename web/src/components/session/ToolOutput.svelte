<script module>
  // Click-to-expand tool output. Mirrors the former formatExpandableOutput():
  // a preview of the first `maxLines`, click to reveal the full text. Code output
  // (with a `lang`) renders <code class="hljs" data-highlight-pending> so the
  // post-render highlight pass (live: applyLazyHighlighting; export: afterRender)
  // colours it. Plain output renders one <div> per line.
  export function toggleExpanded(e) {
    if (window.getSelection && window.getSelection().toString()) return;
    e.currentTarget.classList.toggle('expanded');
  }

  export function cycleOutput(e) {
    if (window.getSelection && window.getSelection().toString()) return;
    const el = e.currentTarget;
    const next = { collapsed: 'preview', preview: 'expanded', expanded: 'collapsed' };
    el.dataset.state = next[el.dataset.state] || 'preview';
  }
</script>

<script>
  import { splitOutputLines } from '../../session/render/entry-format.js';

  let { text = '', maxLines = 10, lang = null } = $props();

  const split = $derived(splitOutputLines(text, maxLines));
  const expandable = $derived(split.remaining > 0);
  const collapsedRemaining = $derived(split.lines.length - 1);
</script>

{#if lang}
  {#if expandable}
    <div class="tool-output expandable" data-state="collapsed" onclick={cycleOutput} role="presentation">
      <div class="output-collapsed">
        <pre><code class="hljs" data-highlight-pending data-lang={lang}
            >{split.collapsed.join('\n')}</code
          ></pre>
        <div class="expand-hint">... ({collapsedRemaining} more lines)</div>
      </div>
      <div class="output-preview">
        <pre><code class="hljs" data-highlight-pending data-lang={lang}
            >{split.preview.join('\n')}</code
          ></pre>
        <div class="expand-hint">... ({split.remaining} more lines)</div>
      </div>
      <div class="output-full">
        <pre><code class="hljs" data-highlight-pending data-lang={lang}
            >{split.lines.join('\n')}</code
          ></pre>
      </div>
    </div>
  {:else}
    <div class="tool-output">
      <pre><code class="hljs" data-highlight-pending data-lang={lang}>{split.lines.join('\n')}</code
        ></pre>
    </div>
  {/if}
{:else if expandable}
  <div class="tool-output expandable" data-state="collapsed" onclick={cycleOutput} role="presentation">
    <div class="output-collapsed">
      {#each split.collapsed as line, lineIndex (lineIndex)}<div>{line}</div>{/each}
      <div class="expand-hint">... ({collapsedRemaining} more lines)</div>
    </div>
    <div class="output-preview">
      {#each split.preview as line, lineIndex (lineIndex)}<div>{line}</div>{/each}
      <div class="expand-hint">... ({split.remaining} more lines)</div>
    </div>
    <div class="output-full">
      {#each split.lines as line, lineIndex (lineIndex)}<div>{line}</div>{/each}
    </div>
  </div>
{:else}
  <div class="tool-output">
    {#each split.preview as line, lineIndex (lineIndex)}<div>{line}</div>{/each}
  </div>
{/if}
