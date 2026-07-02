/**
 * Maps a git porcelain status code to a display kind for the file tree.
 * Returns null when the path has no changes.
 *
 * Mapping (VS Code colours):
 *   '??'         → 'untracked'  (yellow)
 *   contains 'A' → 'added'      (green)
 *   contains 'D' → 'deleted'    (red)
 *   contains 'U' → 'updated'    (orange — updated but unmerged)
 *   otherwise    → 'modified'   (blue — M, R, C, etc.)
 *   falsy/empty  → null
 */
export function fileStatusKind(status) {
  if (!status) return null;
  if (status === '??') return 'untracked';
  if (status.includes('A')) return 'added';
  if (status.includes('D')) return 'deleted';
  if (status.includes('U')) return 'updated';
  return 'modified';
}

/**
 * Aggregates the git status of a folder's descendants so the tree can flag which
 * folders contain changes without expanding them. `statusMap` maps repo-relative
 * paths to porcelain status codes; `folderPath` is the folder's repo-relative
 * path. Returns the single kind when all changed descendants share one kind,
 * 'modified' when they are mixed, or null when the folder contains no changes.
 */
export function folderStatusKind(statusMap, folderPath) {
  const prefix = folderPath + '/';
  const kinds = new Set();
  for (const path in statusMap) {
    if (path.startsWith(prefix)) {
      const kind = fileStatusKind(statusMap[path]);
      if (kind) kinds.add(kind);
    }
  }
  if (kinds.size === 0) return null;
  if (kinds.size === 1) return [...kinds][0];
  return 'modified';
}
