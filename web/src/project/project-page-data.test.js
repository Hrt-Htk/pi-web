import { describe, it, expect } from 'vitest';
import { fetchProjectData, updateProjectName } from './project-page-data.js';

function createMockResponse(ok, status, jsonBody) {
  return {
    ok,
    status,
    json: async () => jsonBody,
  };
}

describe('fetchProjectData', () => {
  it('fetches and returns JSON on success', async () => {
    const mockData = { name: 'test-project', path: '/some/path' };
    let capturedUrl = '';
    const mockFetch = async (url) => {
      capturedUrl = url;
      return createMockResponse(true, 200, mockData);
    };

    const result = await fetchProjectData('my project', { fetch: mockFetch });
    expect(capturedUrl).toBe('/api/project/my%20project');
    expect(result).toEqual(mockData);
  });

  it('encodes paths with special characters', async () => {
    let capturedUrl = '';
    const mockFetch = async (url) => {
      capturedUrl = url;
      return createMockResponse(true, 200, {});
    };

    await fetchProjectData('foo/bar baz', { fetch: mockFetch });
    expect(capturedUrl).toBe('/api/project/foo%2Fbar%20baz');
  });

  it('throws on non-ok response', async () => {
    const mockFetch = async () => createMockResponse(false, 500, null);

    await expect(fetchProjectData('some-path', { fetch: mockFetch }))
      .rejects.toThrow('Failed to load project: 500');
  });
});

describe('updateProjectName', () => {
  it('sends POST with correct body and returns JSON', async () => {
    const mockData = { name: 'new-name' };
    let capturedUrl = '';
    let capturedOptions = {};
    const mockFetch = async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return createMockResponse(true, 200, mockData);
    };

    const result = await updateProjectName('my project', 'New Name', { fetch: mockFetch });
    expect(capturedUrl).toBe('/api/project/update');
    expect(capturedOptions.method).toBe('POST');
    expect(JSON.parse(capturedOptions.body)).toEqual({
      path: 'my project',
      name: 'New Name',
    });
    expect(result).toEqual(mockData);
  });

  it('throws on non-ok response', async () => {
    const mockFetch = async () => createMockResponse(false, 400, null);

    await expect(
      updateProjectName('some-path', 'New Name', { fetch: mockFetch })
    ).rejects.toThrow('Failed to update project name: 400');
  });
});
