import { getJSON } from '../../shared/api.js';

/**
 * Fetch the file tree for a session.
 * @param {string} sessionId
 * @param {string} [scope] - relative subdir under the session cwd; "" = repo root
 * @param {{ getImpl }} [opts]
 * @returns {Promise<{ files: Array<{ path: string, isDir: boolean }> }>}
 */
export function getFileTree(sessionId, scope = '', { getImpl = getJSON } = {}) {
  const q = scope
    ? `?id=${encodeURIComponent(sessionId)}&scope=${encodeURIComponent(scope)}`
    : `?id=${encodeURIComponent(sessionId)}`;
  return getImpl(`/api/files/tree${q}`);
}

/**
 * Fetch the git status for a session.
 * @param {string} sessionId
 * @param {{ getImpl }} [opts]
 * @returns {Promise<{ files: Array<{ status: string, path: string }>, summary: object }>}
 */
export function getFilesGitStatus(sessionId, { getImpl = getJSON } = {}) {
  return getImpl(`/api/files/git-status?id=${encodeURIComponent(sessionId)}`);
}
