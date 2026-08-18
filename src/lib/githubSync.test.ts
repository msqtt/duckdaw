import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  GitHubApiError,
  createGitHubBaselineStore,
  createGitHubContentsClient,
  saveGitHubProject,
} from './githubSync';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 409 ? 'Conflict' : 'Response',
    headers: { 'Content-Type': 'application/json' },
  });
}

function setup(fetcher: Mock) {
  const baselines = createGitHubBaselineStore(memoryStorage());
  const client = createGitHubContentsClient({ repo: 'Owner/Repo', token: 'secret', fetcher: fetcher as unknown as typeof fetch });
  const calls: string[] = [];
  const actions = {
    saveRecovery: vi.fn(async () => { calls.push('recovery'); }),
    applyRemote: vi.fn(async () => { calls.push('apply'); }),
    onSaved: vi.fn(async (path: string) => { calls.push(`saved:${path}`); }),
  };
  return { baselines, client, calls, actions };
}

function requestInit(fetcher: Mock, index: number): RequestInit | undefined {
  return (fetcher.mock.calls as unknown[][])[index]?.[1] as RequestInit | undefined;
}

describe('GitHub sync baseline and conflict workflow', () => {
  it('persists baselines by normalized repository and exact path', () => {
    const storage = memoryStorage();
    const first = createGitHubBaselineStore(storage);
    first.set('Owner/Repo', '/projects/song.duckdaw', 'sha-1');
    const restored = createGitHubBaselineStore(storage);
    expect(restored.get('owner/repo', 'projects/song.duckdaw')).toBe('sha-1');
    expect(restored.get('owner/repo', 'projects/Other.duckdaw')).toBeUndefined();
  });

  it('sends the persisted baseline in PUT and advances it only after HTTP 200', async () => {
    const fetcher = vi.fn(async () => response(200, { content: { sha: 'sha-2' } }));
    const { baselines, client, actions } = setup(fetcher);
    baselines.set('owner/repo', 'song.duckdaw', 'sha-1');

    await expect(saveGitHubProject({ client, baselines, path: 'song.duckdaw', content: 'base64', actions })).resolves.toBe('saved');
    const request = requestInit(fetcher, 0)!;
    expect(JSON.parse(request.body as string)).toMatchObject({ content: 'base64', sha: 'sha-1' });
    expect(baselines.get('owner/repo', 'song.duckdaw')).toBe('sha-2');
    expect(actions.onSaved).toHaveBeenCalledWith('song.duckdaw');
  });

  it('keeps baseline and local callbacks untouched when a 409 decision is cancelled', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(409, { message: 'sha does not match' }))
      .mockResolvedValueOnce(response(200, { sha: 'sha-latest', content: 'remote' }));
    const { baselines, client, actions } = setup(fetcher);
    baselines.set('owner/repo', 'song.duckdaw', 'sha-old');

    const result = await saveGitHubProject({
      client, baselines, path: 'song.duckdaw', content: 'local', actions,
      decide: vi.fn(async () => ({ choice: 'cancel' })),
    });
    expect(result).toBe('cancelled');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(actions.saveRecovery).not.toHaveBeenCalled();
    expect(actions.applyRemote).not.toHaveBeenCalled();
    expect(actions.onSaved).not.toHaveBeenCalled();
    expect(baselines.get('owner/repo', 'song.duckdaw')).toBe('sha-old');
  });

  it('saves a conflict copy without SHA and commits only the copy baseline/path', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(409, { message: 'conflict' }))
      .mockResolvedValueOnce(response(200, { sha: 'sha-latest', content: 'remote' }))
      .mockResolvedValueOnce(response(201, { content: { sha: 'sha-copy' } }));
    const { baselines, client, actions } = setup(fetcher);
    baselines.set('owner/repo', 'song.duckdaw', 'sha-old');
    const decide = vi.fn()
      .mockResolvedValueOnce({ choice: 'save-copy' })
      .mockResolvedValueOnce({ choice: 'save', value: 'song-copy.duckdaw' });

    expect(await saveGitHubProject({ client, baselines, path: 'song.duckdaw', content: 'local', actions, decide })).toBe('saved-copy');
    const copyBody = JSON.parse(requestInit(fetcher, 2)!.body as string);
    expect(copyBody).not.toHaveProperty('sha');
    expect(baselines.get('owner/repo', 'song.duckdaw')).toBe('sha-old');
    expect(baselines.get('owner/repo', 'song-copy.duckdaw')).toBe('sha-copy');
    expect(actions.onSaved).toHaveBeenCalledWith('song-copy.duckdaw');
  });

  it('writes recovery before applying frozen remote and commits its SHA after apply succeeds', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(409, { message: 'conflict' }))
      .mockResolvedValueOnce(response(200, { sha: 'sha-latest', content: 'remote-package' }));
    const { baselines, client, calls, actions } = setup(fetcher);
    baselines.set('owner/repo', 'song.duckdaw', 'sha-old');

    expect(await saveGitHubProject({
      client, baselines, path: 'song.duckdaw', content: 'local', actions,
      decide: vi.fn(async () => ({ choice: 'reload' })),
    })).toBe('reloaded');
    expect(calls).toEqual(['recovery', 'apply']);
    expect(actions.applyRemote).toHaveBeenCalledWith({ sha: 'sha-latest', content: 'remote-package' });
    expect(baselines.get('owner/repo', 'song.duckdaw')).toBe('sha-latest');
  });

  it('force-overwrites with the frozen observed SHA after recovery and does not auto-retry', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(409, { message: 'conflict' }))
      .mockResolvedValueOnce(response(200, { sha: 'sha-latest', content: 'remote' }))
      .mockResolvedValueOnce(response(200, { content: { sha: 'sha-forced' } }));
    const { baselines, client, calls, actions } = setup(fetcher);
    baselines.set('owner/repo', 'song.duckdaw', 'sha-old');
    const decide = vi.fn()
      .mockResolvedValueOnce({ choice: 'force' })
      .mockResolvedValueOnce({ choice: 'overwrite' });

    expect(await saveGitHubProject({ client, baselines, path: 'song.duckdaw', content: 'local', actions, decide })).toBe('overwritten');
    expect(calls).toEqual(['recovery', 'saved:song.duckdaw']);
    expect(JSON.parse(requestInit(fetcher, 2)!.body as string).sha).toBe('sha-latest');
    expect(baselines.get('owner/repo', 'song.duckdaw')).toBe('sha-forced');
  });


  it('keeps the prior baseline when remote apply fails after recovery', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(409, { message: 'conflict' }))
      .mockResolvedValueOnce(response(200, { sha: 'sha-latest', content: 'invalid-package' }));
    const { baselines, client, calls, actions } = setup(fetcher);
    baselines.set('owner/repo', 'song.duckdaw', 'sha-old');
    actions.applyRemote.mockRejectedValueOnce(new Error('invalid package'));
    await expect(saveGitHubProject({
      client, baselines, path: 'song.duckdaw', content: 'local', actions,
      decide: vi.fn(async () => ({ choice: 'reload' })),
    })).rejects.toThrow(/invalid package/i);
    expect(calls).toEqual(['recovery']);
    expect(baselines.get('owner/repo', 'song.duckdaw')).toBe('sha-old');
  });

  it('does not retry or advance baseline when force overwrite conflicts again', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(409, { message: 'conflict' }))
      .mockResolvedValueOnce(response(200, { sha: 'sha-latest', content: 'remote' }))
      .mockResolvedValueOnce(response(409, { message: 'changed again' }));
    const { baselines, client, actions } = setup(fetcher);
    baselines.set('owner/repo', 'song.duckdaw', 'sha-old');
    const decide = vi.fn()
      .mockResolvedValueOnce({ choice: 'force' })
      .mockResolvedValueOnce({ choice: 'overwrite' });
    await expect(saveGitHubProject({ client, baselines, path: 'song.duckdaw', content: 'local', actions, decide }))
      .rejects.toEqual(expect.objectContaining({ status: 409 }));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(actions.saveRecovery).toHaveBeenCalledTimes(1);
    expect(actions.onSaved).not.toHaveBeenCalled();
    expect(baselines.get('owner/repo', 'song.duckdaw')).toBe('sha-old');
  });
  it('does not silently overwrite an existing path when no baseline is known', async () => {
    const fetcher = vi.fn(async () => response(200, { sha: 'sha-existing', content: 'remote' }));
    const { baselines, client, actions } = setup(fetcher);
    const decide = vi.fn(async () => ({ choice: 'cancel' }));
    expect(await saveGitHubProject({ client, baselines, path: 'song.duckdaw', content: 'local', actions, decide })).toBe('cancelled');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(requestInit(fetcher, 0)?.method).toBeUndefined();
  });

  it('surfaces non-conflict GitHub messages without advancing baseline', async () => {
    const fetcher = vi.fn(async () => response(403, { message: 'Resource not accessible' }));
    const { baselines, client, actions } = setup(fetcher);
    baselines.set('owner/repo', 'song.duckdaw', 'sha-old');
    await expect(saveGitHubProject({ client, baselines, path: 'song.duckdaw', content: 'local', actions }))
      .rejects.toEqual(expect.objectContaining<Partial<GitHubApiError>>({ status: 403, message: expect.stringContaining('Resource not accessible') }));
    expect(baselines.get('owner/repo', 'song.duckdaw')).toBe('sha-old');
  });
});
