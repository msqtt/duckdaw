import React, { useState } from 'react';
import { dawStore, useDAWStore } from '../../store/dawStore';
import { Github, FileDown, FileUp, Moon, Sun, X } from 'lucide-react';
import { Dropdown } from '../ui/Dropdown';
import { createDuckDawPackage, loadDuckDawPackage, saveToFileSystemAsDownload, confirmDiscardChanges, validatePersistedProjectState } from '../../lib/projectStorage';
import toast from 'react-hot-toast';


function buildGitHubContentsUrl(repo: string, path: string): string {
  const [owner, repository, ...extra] = repo.split('/');
  if (!owner || !repository || extra.length > 0) throw new Error('Repository must use owner/repo format');
  const encodedPath = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  if (!encodedPath) throw new Error('GitHub file path is required');
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodedPath}`;
}
export function SettingsModal({ onClose }: { onClose: () => void }) {
  const titleId = React.useId();
  const { 
    theme, toggleTheme, getProjectData, loadProject
  } = useDAWStore();
  const [githubToken, setGithubToken] = useState(sessionStorage.getItem('github_token') || '');
  const [githubRepo, setGithubRepo] = useState(localStorage.getItem('github_repo') || '');
  const [githubPath, setGithubPath] = useState(localStorage.getItem('github_path') || 'webdaw_project.duckdaw');

  const handleExportLocal = async () => {
    try {
      const blob = await createDuckDawPackage();
      await saveToFileSystemAsDownload(blob, 'project.duckdaw');
    } catch(error) {
      toast.error(`Failed to export project: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleImportLocal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !confirmDiscardChanges()) return;
    try {
      if (file.name.endsWith('.duckdaw') || file.name.endsWith('.zip')) {
        const pkg = await loadDuckDawPackage(file);
        loadProject(pkg.project); 
      } else {
        const text = await file.text();
        const json = JSON.parse(text);
        validatePersistedProjectState(json);
        loadProject(json);
        useDAWStore.getState().setDirty(true);
      }
      dawStore.temporal.getState().clear();
      toast.success('Project loaded successfully');
      onClose();
    } catch(error) {
      toast.error(`Failed to load project: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const saveGithubSettings = () => {
    sessionStorage.setItem('github_token', githubToken);
    localStorage.setItem('github_repo', githubRepo);
    localStorage.setItem('github_path', githubPath);
  };

  const handleGithubSave = async () => {
    if (!githubToken || !githubRepo || !githubPath) {
      toast.error('Please fill in token, repo (owner/repo), and path');
      return;
    }
    if (!githubPath.endsWith('.duckdaw')) {
      toast.error('Path must end with .duckdaw for packaging format');
      return;
    }
    saveGithubSettings();

    try {
      const githubUrl = buildGitHubContentsUrl(githubRepo, githubPath);
      const blob = await createDuckDawPackage();
      const arrayBuffer = await blob.arrayBuffer();
      // base64 encode the ArrayBuffer
      const uint8Array = new Uint8Array(arrayBuffer);
      let binaryString = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binaryString += String.fromCharCode(uint8Array[i]);
      }
      const content = btoa(binaryString);

      // Get current SHA if file exists to update it
      let sha;
      const getRes = await fetch(githubUrl, {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (getRes.ok) {
        const json = await getRes.json();
        sha = json.sha;
      }

      const res = await fetch(githubUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: "Update WebDAW project via App",
          content,
          sha
        })
      });

      if (res.ok) {
        toast.success('Project saved to GitHub successfully');
      } else {
        const error = await res.json();
        if (res.status === 409) {
          toast.error('GitHub conflict: the remote file changed. Reload it or save to a different path.');
        } else {
          toast.error(`GitHub save failed: ${error.message}`);
        }
      }
    } catch(error) {
      toast.error(`GitHub save failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleGithubLoad = async () => {
    if (!githubToken || !githubRepo || !githubPath) {
      toast.error('Please fill in token, repo (owner/repo), and path');
      return;
    }
    saveGithubSettings();

    try {
      const githubUrl = buildGitHubContentsUrl(githubRepo, githubPath);
      const res = await fetch(githubUrl, {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (res.ok) {
        if (!confirmDiscardChanges()) return;
        const json = await res.json();
        const base64Content = json.content;
        
        if (githubPath.endsWith('.json')) {
           // Legacy load
           const content = atob(base64Content);
           const data = JSON.parse(content);
           loadProject(data);
        } else {
           // DuckDAW load
           const binaryString = atob(base64Content);
           const len = binaryString.length;
           const bytes = new Uint8Array(len);
           for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
           }
           const fileBlob = new Blob([bytes], { type: 'application/zip' });
           const pkg = await loadDuckDawPackage(fileBlob);
           loadProject(pkg.project);
        }

        dawStore.temporal.getState().clear();
        toast.success('Project loaded from GitHub successfully');
        onClose();
      } else {
        const error = await res.json();
        toast.error(`GitHub load failed: ${error.message}`);
      }
    } catch(error) {
      toast.error(`GitHub load failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 rounded-lg shadow-xl w-full max-w-md flex flex-col overflow-hidden text-neutral-800 dark:text-neutral-200">
        <div className="flex items-center justify-between p-4 border-b border-neutral-300 dark:border-neutral-800">
          <h2 id={titleId} className="text-lg font-bold">Settings</h2>
          <button aria-label="Close settings" onClick={onClose} className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-6 overflow-y-auto">
          {/* Appearance Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase text-neutral-500">Appearance</h3>
            <div className="flex items-center justify-between bg-neutral-200 dark:bg-neutral-800 p-3 rounded-lg">
              <span>Theme</span>
              <div className="flex items-center gap-1">
                 <button 
                    title="System Theme"
                    className={`w-8 h-8 rounded flex flex-col items-center justify-center transition-colors ${theme === 'system' ? 'bg-emerald-500 text-white' : 'bg-neutral-300 dark:bg-neutral-700 text-neutral-500 hover:bg-neutral-400 dark:hover:bg-neutral-600'}`}
                    onClick={() => toggleTheme('system')}
                 >
                    <div className="text-[12px] font-bold leading-none select-none">A</div>
                 </button>
                 <button 
                    title="Light Theme"
                    className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${theme === 'light' ? 'bg-emerald-500 text-white' : 'bg-neutral-300 dark:bg-neutral-700 text-neutral-500 hover:bg-neutral-400 dark:hover:bg-neutral-600'}`}
                    onClick={() => toggleTheme('light')}
                 >
                    <div className="w-4 h-4 rounded-full border-[3px] border-current bg-white" />
                 </button>
                 <button 
                    title="Dark Theme"
                    className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${theme === 'dark' ? 'bg-emerald-500 text-white' : 'bg-neutral-300 dark:bg-neutral-700 text-neutral-500 hover:bg-neutral-400 dark:hover:bg-neutral-600'}`}
                    onClick={() => toggleTheme('dark')}
                 >
                    <div className="w-4 h-4 rounded-full border-[3px] border-current bg-black" />
                 </button>
              </div>
            </div>
          </div>



          {/* Local Project Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase text-neutral-500">Local Project</h3>
            <div className="flex gap-2">
              <button 
                onClick={handleExportLocal}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded transition-colors"
              >
                <FileDown size={16} /> Save File
              </button>
              <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded transition-colors cursor-pointer">
                <FileUp size={16} /> Load File
                <input type="file" accept=".json,.duckdaw,.zip" className="hidden" onChange={handleImportLocal} />
              </label>
            </div>
          </div>

          {/* GitHub Sync Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase text-neutral-500">GitHub Sync</h3>
            <div className="space-y-2">
              <input 
                type="password" 
                aria-label="GitHub personal access token"
                placeholder="Personal Access Token" 
                value={githubToken} 
                onChange={(e) => setGithubToken(e.target.value)}
                className="w-full bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded px-3 py-2 outline-none focus:border-emerald-500"
              />
              <input 
                type="text" 
                aria-label="GitHub repository"
                placeholder="Repository (e.g. user/repo)" 
                value={githubRepo} 
                onChange={(e) => setGithubRepo(e.target.value)}
                className="w-full bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded px-3 py-2 outline-none focus:border-emerald-500"
              />
              <input 
                type="text" 
                aria-label="GitHub project file path"
                placeholder="File Path (e.g. project.json)" 
                value={githubPath} 
                onChange={(e) => setGithubPath(e.target.value)}
                className="w-full bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded px-3 py-2 outline-none focus:border-emerald-500"
              />
              <div className="flex gap-2 pt-2">
                <button 
                  onClick={handleGithubSave}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-neutral-800 text-white dark:bg-neutral-200 dark:text-black hover:bg-neutral-700 dark:hover:bg-neutral-300 rounded transition-colors"
                >
                  <Github size={16} /> Save to GitHub
                </button>
                <button 
                  onClick={handleGithubLoad}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded transition-colors"
                >
                  <Github size={16} /> Load from GitHub
                </button>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                You need a <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="text-emerald-500 hover:underline">Classic PAT</a> with `repo` scope. The token is kept only for this browser session; avoid using it on untrusted pages.
              </p>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem('github_token');
                  setGithubToken('');
                  toast.success('GitHub token cleared');
                }}
                className="text-xs text-red-500 hover:underline"
              >
                Clear GitHub token
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
