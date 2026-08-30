import { describe, expect, it, vi } from 'vitest';

vi.mock('./api-client', () => ({
  apiClient: { get: vi.fn().mockResolvedValue({ ok: true }) },
  buildQuery: () => '',
}));

import { fetchDataSource, UnknownDataSourceError } from './data-source-registry';

describe('fetchDataSource', () => {
  it('resolves a known source through the approved API', async () => {
    const result = await fetchDataSource('todo.task');
    expect(result).toEqual({ ok: true });
  });

  it('rejects an unknown source instead of guessing a URL', async () => {
    await expect(fetchDataSource('arbitrary.remote.source')).rejects.toBeInstanceOf(UnknownDataSourceError);
  });
});
