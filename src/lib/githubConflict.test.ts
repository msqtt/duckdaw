import { describe, expect, it, vi } from 'vitest';
import { createConflictCopyPath, resolveGitHubConflict, type ConflictActions } from './githubConflict';

function actions(): ConflictActions {
  return {
    saveCopy: vi.fn(async () => undefined),
    saveRecovery: vi.fn(async () => undefined),
    reloadRemote: vi.fn(async () => undefined),
    forceOverwrite: vi.fn(async (_observedSha: string) => undefined),
  };
}

describe('GitHub conflict resolution', () => {
  it('builds a sibling .duckdaw copy path', () => {
    expect(createConflictCopyPath('projects/song.duckdaw', 'conflict-copy'))
      .toBe('projects/song-conflict-copy.duckdaw');
  });

  it('saves a copy to the path entered by the user', async () => {
    const conflictActions = actions();
    const decide = vi.fn()
      .mockResolvedValueOnce({ choice: 'save-copy' })
      .mockResolvedValueOnce({ choice: 'save', value: 'projects/copy.duckdaw' });

    expect(await resolveGitHubConflict('projects/song.duckdaw', 'sha-latest', conflictActions, decide)).toBe('saved-copy');
    expect(conflictActions.saveCopy).toHaveBeenCalledWith('projects/copy.duckdaw');
  });

  it('creates a recovery snapshot before replacing local state with remote state', async () => {
    const order: string[] = [];
    const conflictActions = actions();
    conflictActions.saveRecovery = vi.fn(async () => { order.push('recovery'); });
    conflictActions.reloadRemote = vi.fn(async () => { order.push('reload'); });
    const decide = vi.fn().mockResolvedValue({ choice: 'reload' });

    expect(await resolveGitHubConflict('song.duckdaw', 'sha-latest', conflictActions, decide)).toBe('reloaded');
    expect(order).toEqual(['recovery', 'reload']);
  });

  it('requires a second danger confirmation before force overwrite', async () => {
    const conflictActions = actions();
    const cancel = vi.fn()
      .mockResolvedValueOnce({ choice: 'force' })
      .mockResolvedValueOnce({ choice: 'cancel' });
    expect(await resolveGitHubConflict('song.duckdaw', 'sha-latest', conflictActions, cancel)).toBe('cancelled');
    expect(conflictActions.forceOverwrite).not.toHaveBeenCalled();

    const confirm = vi.fn()
      .mockResolvedValueOnce({ choice: 'force' })
      .mockResolvedValueOnce({ choice: 'overwrite' });
    expect(await resolveGitHubConflict('song.duckdaw', 'sha-latest', conflictActions, confirm)).toBe('overwritten');
    expect(confirm.mock.calls[1][0].message).toContain('sha-latest');
    expect(conflictActions.forceOverwrite).toHaveBeenCalledWith('sha-latest');
  });
});
