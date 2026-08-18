import { resolveGitHubConflict, type ConflictResolution, type Decide } from './githubConflict';

export interface GitHubRemoteFile {
  sha: string;
  content: string;
}

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface GitHubBaselineStore {
  get(repo: string, path: string): string | undefined;
  set(repo: string, path: string, sha: string): void;
}

const BASELINE_STORAGE_KEY = 'duckdaw_github_baselines_v1';

function normalizeRepo(repo: string): string {
  const parts = repo.trim().split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('Repository must use owner/repo format');
  return `${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`;
}

function normalizePath(path: string): string {
  const normalized = path.split('/').filter(Boolean).join('/');
  if (!normalized) throw new Error('GitHub file path is required');
  return normalized;
}

function baselineKey(repo: string, path: string): string {
  return `${normalizeRepo(repo)}\n${normalizePath(path)}`;
}

export function createGitHubBaselineStore(storage: KeyValueStorage): GitHubBaselineStore {
  const read = (): Record<string, string> => {
    try {
      const value = storage.getItem(BASELINE_STORAGE_KEY);
      if (!value) return {};
      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    } catch {
      return {};
    }
  };
  return {
    get: (repo, path) => read()[baselineKey(repo, path)],
    set: (repo, path, sha) => {
      if (!sha) throw new Error('GitHub baseline SHA is required');
      storage.setItem(BASELINE_STORAGE_KEY, JSON.stringify({ ...read(), [baselineKey(repo, path)]: sha }));
    },
  };
}

export function buildGitHubContentsUrl(repo: string, path: string): string {
  const [owner, repository] = normalizeRepo(repo).split('/');
  const encodedPath = normalizePath(path).split('/').map(encodeURIComponent).join('/');
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodedPath}`;
}

export class GitHubApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(`GitHub API ${status}: ${message}`);
    this.name = 'GitHubApiError';
  }
}

async function readError(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null) as { message?: string } | null;
  return payload?.message ?? `${response.status} ${response.statusText}`;
}

export interface GitHubContentsClient {
  readonly repo: string;
  read(path: string): Promise<GitHubRemoteFile | null>;
  put(path: string, content: string, sha?: string): Promise<string>;
}

export function createGitHubContentsClient(input: {
  repo: string;
  token: string;
  fetcher?: typeof fetch;
}): GitHubContentsClient {
  const repo = normalizeRepo(input.repo);
  const fetcher = input.fetcher ?? fetch;
  const headers = {
    Authorization: `Bearer ${input.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  return {
    repo,
    async read(path) {
      const response = await fetcher(buildGitHubContentsUrl(repo, path), { headers });
      if (response.status === 404) return null;
      if (!response.ok) throw new GitHubApiError(response.status, await readError(response));
      const payload = await response.json() as Partial<GitHubRemoteFile>;
      if (!payload.sha || typeof payload.content !== 'string') throw new Error('GitHub response is missing file content or SHA');
      return { sha: payload.sha, content: payload.content };
    },
    async put(path, content, sha) {
      const body: { message: string; content: string; sha?: string } = {
        message: 'Update DuckDAW project via App',
        content,
      };
      if (sha) body.sha = sha;
      const response = await fetcher(buildGitHubContentsUrl(repo, path), {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new GitHubApiError(response.status, await readError(response));
      const payload = await response.json() as { content?: { sha?: string } };
      if (!payload.content?.sha) throw new Error('GitHub save response is missing content SHA');
      return payload.content.sha;
    },
  };
}

export interface GitHubSyncActions {
  saveRecovery(): Promise<void>;
  applyRemote(remote: GitHubRemoteFile): Promise<void>;
  onSaved(path: string): Promise<void>;
}

export async function saveGitHubProject(input: {
  client: GitHubContentsClient;
  baselines: GitHubBaselineStore;
  path: string;
  content: string;
  actions: GitHubSyncActions;
  decide?: Decide;
}): Promise<'saved' | ConflictResolution> {
  const { client, baselines, path, content, actions } = input;
  const baseline = baselines.get(client.repo, path);
  let observed: GitHubRemoteFile | null = null;

  if (!baseline) {
    observed = await client.read(path);
    if (!observed) {
      const sha = await client.put(path, content);
      baselines.set(client.repo, path, sha);
      await actions.onSaved(path);
      return 'saved';
    }
  } else {
    try {
      const sha = await client.put(path, content, baseline);
      baselines.set(client.repo, path, sha);
      await actions.onSaved(path);
      return 'saved';
    } catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 409) throw error;
      observed = await client.read(path);
      if (!observed) throw new Error('GitHub conflict target no longer exists');
    }
  }

  const frozenRemote = observed;
  if (!frozenRemote) throw new Error('GitHub conflict could not observe the remote file');
  return await resolveGitHubConflict(path, frozenRemote.sha, {
    saveCopy: async copyPath => {
      const copySha = await client.put(copyPath, content);
      baselines.set(client.repo, copyPath, copySha);
      await actions.onSaved(copyPath);
    },
    saveRecovery: actions.saveRecovery,
    reloadRemote: async () => {
      await actions.applyRemote(frozenRemote);
      baselines.set(client.repo, path, frozenRemote.sha);
    },
    forceOverwrite: async observedSha => {
      const sha = await client.put(path, content, observedSha);
      baselines.set(client.repo, path, sha);
      await actions.onSaved(path);
    },
  }, input.decide);
}
