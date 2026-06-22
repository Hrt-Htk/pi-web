/**
 * Find the single newest element to flash for a set of new entry ids.
 *
 * Returns at most one element — the last matching candidate in document order —
 * so that a streamed step producing multiple segments (actions + text) flashes
 * only the newest group, not every matching element.
 */
export function findNewEntryHighlightTargets(newIds, documentImpl) {
  const list = documentImpl.getElementById('messages-list');
  if (!list) return [];

  const newIdSet = new Set(newIds);
  const candidates = list.querySelectorAll(
    '.assistant-group[data-entry-ids], [id^="entry-"]:not(.assistant-message)',
  );

  let newest = null;
  for (const el of candidates) {
    const ids = el.classList.contains('assistant-group')
      ? (el.getAttribute('data-entry-ids') || '').split(/\s+/)
      : [el.id.replace('entry-', '')];

    if (ids.some((id) => newIdSet.has(id))) {
      newest = el;
    }
  }

  return newest ? [newest] : [];
}
