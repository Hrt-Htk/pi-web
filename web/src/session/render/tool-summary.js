// Pure helpers for turning an actions-segment's items into compact chips.
// No Svelte, no DOM — fully unit-testable.

// Verb → { word, noun } map. Kept in English; i18n of verbs is out of scope.
const VERB_MAP = {
  read: { word: 'Read', noun: 'file' },
  edit: { word: 'Edited', noun: 'file' },
  write: { word: 'Created', noun: 'file' },
  bash: { word: 'Ran', noun: 'command' },
  grep: { word: 'Searched', noun: 'file' },
  find: { word: 'Searched', noun: 'file' },
  ls: { word: 'Searched', noun: 'file' },
};

/**
 * Split an actions segment's items into chips.
 * A new chip begins at each thinking item; subsequent toolCall items attach
 * to it until the next thinking. toolCall items before any thinking form a
 * leading tool-only chip.
 */
export function chipsFromItems(items) {
  const chips = [];
  let current = null;

  for (const item of items) {
    if (item.type === 'thinking') {
      // Flush previous chip
      if (current) chips.push(current);
      current = {
        thinking: item,
        tools: [],
        sourceIds: [item.sourceId].filter(Boolean),
        timestamp: item.timestamp,
      };
    } else if (item.type === 'toolCall') {
      if (!current) {
        // Leading tool-only chip
        current = { thinking: null, tools: [], sourceIds: [], timestamp: item.timestamp };
      }
      current.tools.push(item);
      if (item.sourceId && !current.sourceIds.includes(item.sourceId)) {
        current.sourceIds.push(item.sourceId);
      }
    }
  }

  if (current) chips.push(current);
  return chips;
}

/**
 * Aggregate toolCall items by verb and count.
 * Returns a human-readable summary string.
 */
export function summarizeTools(tools) {
  if (!tools.length) return '';

  const groups = []; // [{ verb, word, noun, count }]
  const groupMap = new Map(); // verb key → index in groups

  for (const tool of tools) {
    const name = tool.block?.name ?? tool.name ?? '';
    const info = VERB_MAP[name];
    const verbKey = info ? info.word : name; // group by display word

    if (!groupMap.has(verbKey)) {
      groupMap.set(verbKey, groups.length);
      groups.push({
        verbKey,
        word: info ? info.word : name,
        noun: info ? info.noun : null,
        count: 0,
      });
    }
    groups[groupMap.get(verbKey)].count++;
  }

  return groups
    .map((g) => {
      if (g.count === 1) {
        if (g.noun) return `${g.word} 1 ${g.noun}`;
        return g.word;
      }
      if (g.noun) return `${g.word} ${g.count} ${g.noun}s`;
      return `${g.word} ×${g.count}`;
    })
    .join(', ');
}

/**
 * Build the chip summary text: "Thought · Read 2 files, Ran 1 command".
 */
export function chipSummaryText(chip) {
  const parts = [];
  if (chip.thinking) parts.push('Thought');
  const toolSummary = summarizeTools(chip.tools);
  if (toolSummary) parts.push(toolSummary);
  return parts.join(' · ');
}

/**
 * Resolve the tool result message object for a given call id.
 * Returns the `message` object (with `.details`, `.isError`, `.content`) or `null`.
 */
export function resolveToolResult(model, callId) {
  if (!model?.entries) return null;
  for (const entry of model.entries) {
    if (
      entry.type === 'message' &&
      entry.message?.role === 'toolResult' &&
      entry.message.toolCallId === callId
    ) {
      return entry.message;
    }
  }
  return null;
}

/**
 * Count added/removed lines in a unified diff string.
 * Returns `{ added, removed }`. Lines starting with `+` (not `+++`) count as added;
 * lines starting with `-` (not `---`) count as removed.
 */
export function diffStat(diff) {
  if (!diff) return { added: 0, removed: 0 };
  let added = 0,
    removed = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      added++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removed++;
    }
  }
  return { added, removed };
}

/**
 * Resolve the status of a single tool call by scanning the model entries.
 * Returns 'success' | 'error' | 'pending'.
 */
export function resolveToolStatus(model, callId) {
  const result = resolveToolResult(model, callId);
  if (!result) return 'pending';
  return result.isError ? 'error' : 'success';
}

/**
 * Aggregate status across all tools in a chip.
 * error if any tool errors, else pending if any pending, else success.
 */
export function aggregateStatus(tools, model) {
  if (!tools.length) return 'pending';
  let hasError = false;
  let hasPending = false;

  for (const tool of tools) {
    const callId = tool.block?.id ?? tool.id;
    const status = resolveToolStatus(model, callId);
    if (status === 'error') hasError = true;
    if (status === 'pending') hasPending = true;
  }

  if (hasError) return 'error';
  if (hasPending) return 'pending';
  return 'success';
}
