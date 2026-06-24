<script module>
  // Click-to-toggle expandable tool output (used by ANSI-rendered custom tools
  // in ToolCall.svelte). Plain click-to-expand; does nothing if text is selected.
  export function toggleExpanded(e) {
    if (window.getSelection && window.getSelection().toString()) return;
    e.currentTarget.classList.toggle('expanded');
  }
</script>

<script>
  import { splitOutputLines } from '../../session/render/entry-format.js';

  let { text = '', lang = null } = $props();

  const split = $derived(splitOutputLines(text));
</script>

{#if lang}
  <div class="tool-output">
    <div class="code-with-gutter">
      <div class="code-gutter">
        {#each split.lines as _line, i (i)}<span>{i + 1}</span>{/each}
      </div>
      <pre><code class="hljs" data-highlight-pending data-lang={lang}
          >{split.lines.join('\n')}</code
        ></pre>
    </div>
  </div>
{:else}
  <div class="tool-output">
    {#each split.lines as line, lineIndex (lineIndex)}<div>{line}</div>{/each}
  </div>
{/if}
