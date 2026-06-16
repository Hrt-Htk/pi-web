import { getJSON } from '../../shared/api.js';

export function getGitInfo(sessionId, { getImpl = getJSON } = {}) {
  return getImpl(`/api/git/info?id=${encodeURIComponent(sessionId)}`);
}

export function getGitInfoByPath(path, { getImpl = getJSON } = {}) {
  return getImpl(`/api/git/info?path=${encodeURIComponent(path)}`);
}

export function getDirtyFiles(sessionId, { getImpl = getJSON } = {}) {
  return getImpl(`/api/git/dirty-files?id=${encodeURIComponent(sessionId)}`);
}

export function getDirtyFilesByPath(path, { getImpl = getJSON } = {}) {
  return getImpl(`/api/git/dirty-files?path=${encodeURIComponent(path)}`);
}
