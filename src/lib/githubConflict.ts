import { requestDecision, type DecisionDescriptor, type DecisionResult } from './decisionService';

export interface ConflictActions {
  saveCopy(path: string): Promise<void>;
  saveRecovery(): Promise<void>;
  reloadRemote(): Promise<void>;
  forceOverwrite(observedSha: string): Promise<void>;
}

export type ConflictResolution = 'cancelled' | 'saved-copy' | 'reloaded' | 'overwritten';
export type Decide = (descriptor: DecisionDescriptor) => Promise<DecisionResult | null>;

export function createConflictCopyPath(path: string, suffix = `conflict-${Date.now()}`): string {
  const extension = '.duckdaw';
  const base = path.toLowerCase().endsWith(extension) ? path.slice(0, -extension.length) : path;
  return `${base}-${suffix}${extension}`;
}

export async function resolveGitHubConflict(
  currentPath: string,
  observedSha: string,
  actions: ConflictActions,
  decide: Decide = requestDecision,
): Promise<ConflictResolution> {
  const decision = await decide({
    title: 'GitHub file changed',
    message: 'The remote project changed after it was read. Choose how to preserve your work.',
    options: [
      { id: 'cancel', label: 'Cancel', kind: 'secondary' },
      { id: 'save-copy', label: 'Save a copy', kind: 'secondary' },
      { id: 'reload', label: 'Reload remote', kind: 'secondary' },
      { id: 'force', label: 'Overwrite remote…', kind: 'danger' },
    ],
  });

  if (!decision || decision.choice === 'cancel') return 'cancelled';

  if (decision.choice === 'save-copy') {
    const copy = await decide({
      title: 'Save conflict copy',
      message: 'Choose another repository path for the local project.',
      input: {
        label: 'Repository path',
        defaultValue: createConflictCopyPath(currentPath),
        placeholder: 'projects/song-copy.duckdaw',
      },
      options: [
        { id: 'cancel', label: 'Cancel', kind: 'secondary' },
        { id: 'save', label: 'Save copy', kind: 'primary', requiresValue: true },
      ],
    });
    if (copy?.choice !== 'save' || !copy.value) return 'cancelled';
    if (!copy.value.toLowerCase().endsWith('.duckdaw')) {
      throw new Error('Conflict copy path must end with .duckdaw');
    }
    await actions.saveCopy(copy.value);
    return 'saved-copy';
  }

  if (decision.choice === 'reload') {
    await actions.saveRecovery();
    await actions.reloadRemote();
    return 'reloaded';
  }

  if (decision.choice === 'force') {
    const confirmation = await decide({
      title: 'Overwrite remote project?',
      message: `This replaces the latest GitHub version observed at ${observedSha}. A recovery snapshot will retain your current local project.`,
      options: [
        { id: 'cancel', label: 'Cancel', kind: 'secondary' },
        { id: 'overwrite', label: 'Force overwrite', kind: 'danger' },
      ],
      dismissible: false,
    });
    if (confirmation?.choice !== 'overwrite') return 'cancelled';
    await actions.saveRecovery();
    await actions.forceOverwrite(observedSha);
    return 'overwritten';
  }

  return 'cancelled';
}
