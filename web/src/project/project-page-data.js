// API helpers for the project page.

const API_BASE = '';

export async function fetchProjectData(projectPath, { fetch: customFetch } = {}) {
  const fetchFn = customFetch ?? fetch;
  const encoded = encodeURIComponent(projectPath);
  const resp = await fetchFn(`${API_BASE}/api/project/${encoded}`);
  if (!resp.ok) {
    throw new Error(`Failed to load project: ${resp.status}`);
  }
  return resp.json();
}

export async function updateProjectName(projectPath, name, { fetch: customFetch } = {}) {
  const fetchFn = customFetch ?? fetch;
  const resp = await fetchFn(`${API_BASE}/api/project/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: projectPath, name }),
  });
  if (!resp.ok) {
    throw new Error(`Failed to update project name: ${resp.status}`);
  }
  return resp.json();
}
