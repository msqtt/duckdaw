import React, { useState, useEffect } from 'react';
import { dawStore, useDAWStore } from '../../store/dawStore';
import { Github, FileDown, FileUp, Moon, Sun, X } from 'lucide-react';
import { Dropdown } from '../ui/Dropdown';
import { clearRecoverySnapshot, createDuckDawPackage, loadDuckDawPackage, saveRecoverySnapshot, saveToFileSystemAsDownload, confirmDiscardChanges, validatePersistedProjectState } from '../../lib/projectStorage';
import { createGitHubBaselineStore, createGitHubContentsClient, saveGitHubProject, type GitHubRemoteFile } from '../../lib/githubSync';
import { listMidiInputs, listAudioInputs, checkMidiSupport, checkAudioInputSupport, type InputDevice } from '../../lib/inputDevices';
import { importMidi, exportMidi } from '../../lib/midiIo';
import { useShallow } from 'zustand/react/shallow';
import toast from 'react-hot-toast';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const titleId = React.useId();
  const { theme, toggleTheme, loadProject, tracks, clips } = useDAWStore(useShallow(state => ({
    theme: state.theme,
    toggleTheme: state.toggleTheme,
    loadProject: state.loadProject,
    tracks: state.tracks,
    clips: state.clips,
  })));
  const [githubToken, setGithubToken] = useState(sessionStorage.getItem('github_token') || '');
  const [githubRepo, setGithubRepo] = useState(localStorage.getItem('github_repo') || '');
  const [githubPath, setGithubPath] = useState(localStorage.getItem('github_path') || 'webdaw_project.duckdaw');
  const [githubBaselines] = useState(() => createGitHubBaselineStore(localStorage));

  // Input device state
  const [midiDevices, setMidiDevices] = useState<InputDevice[]>([]);
  const [audioDevices, setAudioDevices] = useState<InputDevice[]>([]);
  const [selectedMidiId, setSelectedMidiId] = useState<string>(localStorage.getItem('duckdaw_midi_device') || '');
  const [selectedAudioId, setSelectedAudioId] = useState<string>(localStorage.getItem('duckdaw_audio_device') || '');
  const [midiSupported] = useState(checkMidiSupport());
  const [audioSupported] = useState(checkAudioInputSupport());
  const [deviceError, setDeviceError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (midiSupported) {
          const midi = await listMidiInputs();
          if (active) setMidiDevices(midi);
        }
        if (audioSupported) {
          const audio = await listAudioInputs();
          if (active) setAudioDevices(audio);
        }
      } catch (err) {
        if (active) setDeviceError(err instanceof Error ? err.message : 'Device enumeration failed');
      }
    })();
    return () => { active = false; };
  }, [midiSupported, audioSupported]);

  const handleMidiDeviceChange = (deviceId: string) => {
    setSelectedMidiId(deviceId);
    localStorage.setItem('duckdaw_midi_device', deviceId);
  };

  const handleAudioDeviceChange = async (deviceId: string) => {
    setSelectedAudioId(deviceId);
    localStorage.setItem('duckdaw_audio_device', deviceId);
    // Test if device is accessible
    if (deviceId && audioSupported) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
        stream.getTracks().forEach(t => t.stop());
      } catch (err) {
        setDeviceError(`Audio device denied: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const handleSmfImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const result = importMidi(buffer);
      if (result.tracks.length === 0) {
        toast.error('No MIDI tracks found in file');
        return;
      }
      // Build tracks and clips from imported data
      const importedTracks = result.tracks.map((t, i) => ({
        id: `imp-${Date.now()}-${i}`,
        name: `MIDI ${i + 1}`,
        type: 'midi' as const,
        volume: 0.8,
        pan: 0,
        isMuted: false,
        isSolo: false,
        instrument: 'synth' as const,
        color: ['#0ea5e9', '#ef4444', '#f59e0b', '#22c55e', '#8b5cf6'][i % 5],
        reverb: 0,
        delay: 0,
        automationLanes: [],
        env: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.5 },
      }));
      const maxDuration = Math.max(4, ...result.tracks.flatMap(t => t.notes.map(n => n.start + n.duration)));
      const importedClips = result.tracks.map((t, i) => ({
        id: `imp-clip-${Date.now()}-${i}`,
        trackId: importedTracks[i].id,
        arrangementId: 'main',
        start: 0,
        duration: Math.ceil(maxDuration),
        type: 'midi' as const,
        notes: t.notes,
        color: importedTracks[i].color,
      }));
      loadProject({
        projectName: file.name.replace(/\.(mid|midi|smf)$/i, ''),
        bpm: result.tempo,
        timeSignature: result.timeSignature,
        tracks: importedTracks,
        clips: importedClips,
        arrangements: [{ id: 'main', name: 'Main Arrangement' }],
        activeArrangementId: 'main',
      });
      dawStore.temporal.getState().clear();
      toast.success(`Imported ${result.tracks.length} MIDI track(s)`);
      onClose();
    } catch (err) {
      toast.error(`SMF import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSmfExport = () => {
    try {
      const state = useDAWStore.getState();
      const midiTracks = state.tracks
        .filter(t => t.type === 'midi')
        .map((t, i) => {
          const trackClips = state.clips.filter(c => c.trackId === t.id && c.type === 'midi');
          const allNotes = trackClips.flatMap(c => c.notes.map(n => ({ ...n, start: n.start + c.start })));
          return { notes: allNotes, channel: i };
        })
        .filter(t => t.notes.length > 0);
      if (midiTracks.length === 0) {
        toast.error('No MIDI notes to export');
        return;
      }
      const smfBytes = exportMidi(midiTracks, {
        format: 1,
        ppq: 480,
        tempo: state.bpm,
        timeSignature: state.timeSignature,
      });
      const blob = new Blob([smfBytes], { type: 'audio/midi' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.projectName || 'project'}.mid`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('MIDI exported');
    } catch (err) {
      toast.error(`SMF export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

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
    if (!file || !(await confirmDiscardChanges())) return;
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

  const createGithubClient = () => createGitHubContentsClient({
    repo: githubRepo,
    token: githubToken,
  });

  const applyRemoteProject = async (path: string, remote: GitHubRemoteFile, confirmDiscard: boolean) => {
    if (confirmDiscard && !(await confirmDiscardChanges())) return false;
    const base64Content = remote.content.replace(/\s/g, '');

    if (path.endsWith('.json')) {
      const data = JSON.parse(atob(base64Content));
      validatePersistedProjectState(data);
      loadProject(data);
    } else {
      const binaryString = atob(base64Content);
      const bytes = Uint8Array.from(binaryString, value => value.charCodeAt(0));
      const pkg = await loadDuckDawPackage(new Blob([bytes], { type: 'application/zip' }));
      loadProject(pkg.project);
    }

    dawStore.temporal.getState().clear();
    toast.success('Project loaded from GitHub successfully');
    onClose();
    return true;
  };

  const encodeCurrentProject = async (): Promise<string> => {
    const arrayBuffer = await (await createDuckDawPackage()).arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
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
      const content = await encodeCurrentProject();
      const client = createGithubClient();
      const resolution = await saveGitHubProject({
        client,
        baselines: githubBaselines,
        path: githubPath,
        content,
        actions: {
          saveRecovery: async () => { await saveRecoverySnapshot(); },
          applyRemote: async remote => { await applyRemoteProject(githubPath, remote, false); },
          onSaved: async savedPath => {
            if (savedPath !== githubPath) {
              setGithubPath(savedPath);
              localStorage.setItem('github_path', savedPath);
            }
            useDAWStore.getState().setDirty(false);
          },
        },
      });
      if (resolution === 'cancelled') {
        toast('GitHub save cancelled');
      } else if (resolution === 'reloaded') {
        // applyRemote owns success feedback and closes the modal.
      } else {
        if (resolution === 'saved' || resolution === 'saved-copy') await clearRecoverySnapshot();
        toast.success(resolution === 'saved-copy'
          ? 'Conflict copy saved to GitHub'
          : resolution === 'overwritten'
            ? 'Latest remote project overwritten'
            : 'Project saved to GitHub successfully');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `GitHub save failed: ${String(error)}`);
    }
  };

  const handleGithubLoad = async () => {
    if (!githubToken || !githubRepo || !githubPath) {
      toast.error('Please fill in token, repo (owner/repo), and path');
      return;
    }
    saveGithubSettings();
    try {
      const client = createGithubClient();
      const remote = await client.read(githubPath);
      if (!remote) throw new Error('GitHub project file was not found');
      if (await applyRemoteProject(githubPath, remote, true)) {
        githubBaselines.set(client.repo, githubPath, remote.sha);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `GitHub load failed: ${String(error)}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 rounded-lg shadow-xl w-full max-w-md max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden text-neutral-800 dark:text-neutral-200">
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



          {/* Input Devices Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase text-neutral-500">Input Devices</h3>
            {deviceError && (
              <p className="text-xs text-red-500" role="alert">{deviceError}</p>
            )}
            <div className="space-y-2">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">MIDI Input</label>
                {!midiSupported ? (
                  <p className="text-xs text-amber-500" role="status">Web MIDI API not supported by this browser</p>
                ) : (
                  <select
                    aria-label="Select MIDI input device"
                    value={selectedMidiId}
                    onChange={(e) => handleMidiDeviceChange(e.target.value)}
                    className="w-full bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded px-3 py-2 outline-none focus:border-emerald-500 text-sm"
                  >
                    <option value="">All MIDI inputs</option>
                    {midiDevices.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                    {midiDevices.length === 0 && <option disabled>No MIDI devices found</option>}
                  </select>
                )}
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Audio Input</label>
                {!audioSupported ? (
                  <p className="text-xs text-amber-500" role="status">getUserMedia not supported</p>
                ) : (
                  <select
                    aria-label="Select audio input device"
                    value={selectedAudioId}
                    onChange={(e) => handleAudioDeviceChange(e.target.value)}
                    className="w-full bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded px-3 py-2 outline-none focus:border-emerald-500 text-sm"
                  >
                    <option value="">Default microphone</option>
                    {audioDevices.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                    {audioDevices.length === 0 && <option disabled>No audio inputs found</option>}
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* SMF Import/Export Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase text-neutral-500">MIDI File (SMF)</h3>
            <div className="flex gap-2">
              <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded transition-colors cursor-pointer">
                <FileUp size={16} /> Import .mid
                <input type="file" accept=".mid,.midi,.smf" className="hidden" onChange={handleSmfImport} />
              </label>
              <button
                onClick={handleSmfExport}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 rounded transition-colors"
              >
                <FileDown size={16} /> Export .mid
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
          <div className="pt-3 border-t border-neutral-300 dark:border-neutral-800">
            <a
              href="/THIRD_PARTY_NOTICES.txt"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-emerald-500 hover:underline"
            >
              Third-party software notices
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
