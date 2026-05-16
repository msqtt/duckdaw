import React, { useState } from 'react';
import { useDAWStore } from '../../store/dawStore';
import { Github, FileDown, FileUp, Moon, Sun, X } from 'lucide-react';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { theme, toggleTheme, getProjectData, loadProject } = useDAWStore();
  const [githubToken, setGithubToken] = useState(localStorage.getItem('github_token') || '');
  const [githubRepo, setGithubRepo] = useState(localStorage.getItem('github_repo') || '');
  const [githubPath, setGithubPath] = useState(localStorage.getItem('github_path') || 'webdaw_project.json');

  const handleExportLocal = () => {
    const data = getProjectData();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "webdaw_project.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportLocal = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        loadProject(json);
        alert("Project loaded successfully!");
        onClose();
      } catch(err) {
        alert("Failed to parse project file");
      }
    };
    reader.readAsText(file);
  };

  const saveGithubSettings = () => {
    localStorage.setItem('github_token', githubToken);
    localStorage.setItem('github_repo', githubRepo);
    localStorage.setItem('github_path', githubPath);
  };

  const handleGithubSave = async () => {
    if (!githubToken || !githubRepo || !githubPath) {
      alert("Please fill in token, repo (owner/repo), and path");
      return;
    }
    saveGithubSettings();

    try {
      const data = getProjectData();
      const content = btoa(JSON.stringify(data, null, 2));

      // Get current SHA if file exists to update it
      let sha;
      const getRes = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${githubPath}`, {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (getRes.ok) {
        const json = await getRes.json();
        sha = json.sha;
      }

      const res = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${githubPath}`, {
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
        alert("Project saved to GitHub successfully!");
      } else {
        const error = await res.json();
        alert(`Failed: ${error.message}`);
      }
    } catch(err: any) {
      alert(`Error saving to GitHub: ${err.message}`);
    }
  };

  const handleGithubLoad = async () => {
    if (!githubToken || !githubRepo || !githubPath) {
      alert("Please fill in token, repo (owner/repo), and path");
      return;
    }
    saveGithubSettings();

    try {
      const res = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${githubPath}`, {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (res.ok) {
        const json = await res.json();
        const content = atob(json.content);
        const data = JSON.parse(content);
        loadProject(data);
        alert("Project loaded from GitHub successfully!");
        onClose();
      } else {
        const error = await res.json();
        alert(`Failed: ${error.message}`);
      }
    } catch(err: any) {
      alert(`Error loading from GitHub: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 rounded-lg shadow-xl w-full max-w-md flex flex-col overflow-hidden text-neutral-800 dark:text-neutral-200">
        <div className="flex items-center justify-between p-4 border-b border-neutral-300 dark:border-neutral-800">
          <h2 className="text-lg font-bold">Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-6 overflow-y-auto">
          {/* Appearance Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase text-neutral-500">Appearance</h3>
            <div className="flex items-center justify-between bg-neutral-200 dark:bg-neutral-800 p-3 rounded-lg">
              <span>Theme</span>
              <button 
                onClick={toggleTheme}
                className="flex items-center gap-2 px-3 py-1.5 bg-neutral-300 dark:bg-neutral-700 hover:bg-neutral-400 dark:hover:bg-neutral-600 rounded text-sm transition-colors"
              >
                {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                {theme === 'dark' ? 'Dark' : 'Light'}
              </button>
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
                <input type="file" accept=".json" className="hidden" onChange={handleImportLocal} />
              </label>
            </div>
          </div>

          {/* GitHub Sync Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase text-neutral-500">GitHub Sync</h3>
            <div className="space-y-2">
              <input 
                type="password" 
                placeholder="Personal Access Token" 
                value={githubToken} 
                onChange={(e) => setGithubToken(e.target.value)}
                className="w-full bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded px-3 py-2 outline-none focus:border-emerald-500"
              />
              <input 
                type="text" 
                placeholder="Repository (e.g. user/repo)" 
                value={githubRepo} 
                onChange={(e) => setGithubRepo(e.target.value)}
                className="w-full bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded px-3 py-2 outline-none focus:border-emerald-500"
              />
              <input 
                type="text" 
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
                You need a <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" className="text-emerald-500 hover:underline">Classic PAT</a> with `repo` scope to use GitHub sync. Your token is stored locally in your browser.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
