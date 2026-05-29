import JSZip from 'jszip';
import * as idb from 'idb-keyval';
import { useDAWStore } from '../store/dawStore';

// A basic structure, matching the spec

export interface Manifest {
  format: 'duckdaw';
  version: string;
  generator: string;
  createdAt: string;
  updatedAt: string;
  projectId: string;
  name: string;
  author?: string;
  bpm: number;
  timeSignature: [number, number];
  sampleRate?: number;
  resources?: {
    samples?: string[];
    presets?: string[];
  };
  description?: string;
}

export interface ProjectPackage {
  manifest: Manifest;
  project: any; // Using the exported state structure
  samples: Map<string, ArrayBuffer>;
  presets: Map<string, object>;
}

export const DUCKDAW_FORMAT_VERSION = '1.1.0';

export async function createDuckDawPackage(name?: string, description?: string): Promise<Blob> {
  const store = useDAWStore.getState();
  const projectName = name || store.projectName;
  const zip = new JSZip();

  const projectId = crypto.randomUUID();

  // Clone clips so we don't mutate the active store
  const clips = JSON.parse(JSON.stringify(store.clips));
  const samplePaths: string[] = [];
  
  // Pack Audio Clips
  for (const clip of clips) {
    if (clip.type === 'audio' && clip.bufferUrl && clip.bufferUrl.startsWith('blob:')) {
      try {
        const response = await fetch(clip.bufferUrl);
        const arrayBuffer = await response.arrayBuffer();
        
        const filename = `${clip.id}.wav`;
        const path = `samples/${filename}`;
        
        zip.file(path, arrayBuffer);
        
        clip.bufferUrl = path;
        samplePaths.push(filename);
      } catch (err) {
        console.warn(`Failed to pack audio clip ${clip.id}`, err);
      }
    }
  }

  const manifest: Manifest = {
    format: 'duckdaw',
    version: DUCKDAW_FORMAT_VERSION,
    generator: 'duckdaw',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projectId,
    name: projectName,
    bpm: store.bpm,
    timeSignature: store.timeSignature,
    description,
    resources: {
      samples: samplePaths,
      presets: []
    }
  };

  const projectData = {
    meta: {
      version: DUCKDAW_FORMAT_VERSION,
      projectId: manifest.projectId
    },
    transport: {
      bpm: store.bpm,
      timeSignature: store.timeSignature,
      swing: 0,
      isLooping: store.isLooping,
      loopStart: store.loopStart,
      loopEnd: store.loopEnd,
      metronome: {
        enabled: store.metronomeOn,
        sound: store.metronomeSound,
        volume: store.metronomeVolume,
        subdivisions: store.metronomeSubdivisions
      }
    },
    tracks: store.tracks.map(t => ({
      ...t,
      insertEffects: [],
      sends: [],
      automationLanes: []
    })),
    clips: clips,
    markers: [],
    automation: [],
    tempoTrack: [{ position: 0, bpm: store.bpm, curve: 'linear' }],
    arrangements: [{ id: crypto.randomUUID(), name: 'Main', clips: clips.map(c => c.id) }]
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('project.json', JSON.stringify(projectData, null, 2));

  return await zip.generateAsync({ type: 'blob' });
}

export async function loadDuckDawPackage(file: File | Blob): Promise<ProjectPackage> {
  const zip = new JSZip();
  const buffer = await file.arrayBuffer();
  const loadedZip = await zip.loadAsync(buffer);

  const manifestStr = await loadedZip.file('manifest.json')?.async('text');
  if (!manifestStr) throw new Error('Invalid DuckDAW file: missing manifest.json');
  
  const manifest = JSON.parse(manifestStr) as Manifest;
  if (manifest.format !== 'duckdaw') throw new Error('Not a DuckDAW format');

  const projectStr = await loadedZip.file('project.json')?.async('text');
  if (!projectStr) throw new Error('Invalid DuckDAW file: missing project.json');

  const project = JSON.parse(projectStr);

  const samples = new Map<string, ArrayBuffer>();
  const presets = new Map<string, object>();

  // Extract samples
  if (manifest.resources?.samples) {
    for (const samplePath of manifest.resources.samples) {
      const fileData = await loadedZip.file(`samples/${samplePath}`)?.async('arraybuffer');
      if (fileData) samples.set(samplePath, fileData);
    }
  }

  // Restore audio blob URLs in projectData
  if (project.clips) {
    for (const clip of project.clips) {
      if (clip.type === 'audio' && clip.bufferUrl && clip.bufferUrl.startsWith('samples/')) {
        const sampleName = clip.bufferUrl.replace('samples/', '');
        const arrayBuffer = samples.get(sampleName);
        if (arrayBuffer) {
           const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
           clip.bufferUrl = URL.createObjectURL(blob);
        }
      }
    }
  }

  // Convert schema for `loadProject` compat
  const compatibleProject = {
     bpm: project.transport?.bpm || 120,
     tracks: project.tracks || [],
     clips: project.clips || []
  };

  return {
    manifest,
    project: compatibleProject,
    samples,
    presets
  };
}

export async function saveToFileSystemAsDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.endsWith('.duckdaw') ? name : `${name}.duckdaw`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// File System Access API wrappers
const FILE_HANDLE_KEY = 'duckdaw_current_file_handle';

export async function saveProject(forceDialog = false, isAutoSave = false) {
  const store = useDAWStore.getState();
  let handle: FileSystemFileHandle | undefined = await idb.get(FILE_HANDLE_KEY);
  
  if (forceDialog || !handle) {
    if (isAutoSave) return; // don't throw UI popups on autosave

    if (!('showSaveFilePicker' in window)) {
       // Fallback to blob download
       const blob = await createDuckDawPackage();
       await saveToFileSystemAsDownload(blob, store.projectName);
       store.setDirty(false);
       return;
    }
    
    try {
      handle = await (window as any).showSaveFilePicker({
        suggestedName: `${store.projectName}.duckdaw`,
        types: [{
          description: 'DuckDAW Project',
          accept: { 'application/zip': ['.duckdaw'] }
        }]
      });
      await idb.set(FILE_HANDLE_KEY, handle);
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      throw e;
    }
  }

  if (handle) {
    // Check permission
    if (await (handle as any).queryPermission({ mode: 'readwrite' }) !== 'granted') {
      if (isAutoSave) return; // Skip requesting permissions blocking autosave internally
      if (await (handle as any).requestPermission({ mode: 'readwrite' }) !== 'granted') {
         throw new Error('Permission denied to write to file.');
      }
    }
    const blob = await createDuckDawPackage();
    const writable = await (handle as any).createWritable();
    await writable.write(blob);
    await writable.close();
    store.setDirty(false);
  }
}

export async function openProject() {
  if (!('showOpenFilePicker' in window)) {
     // User has to use the old generic SettingsModal import
     throw new Error('File handling not supported in this browser. Please use Settings dialog.');
  }
  
  let handles;
  try {
    handles = await (window as any).showOpenFilePicker({
      types: [{
        description: 'DuckDAW Project',
        accept: { 'application/zip': ['.duckdaw', '.zip'], 'application/json': ['.json'] }
      }],
      multiple: false
    });
  } catch (e: any) {
    if (e.name === 'AbortError') return false;
    throw e;
  }
  
  if (!handles || handles.length === 0) return false;
  
  const file = await handles[0].getFile();
  let pkg;
  if (file.name.endsWith('.json')) {
    const text = await file.text();
    const legacyProject = JSON.parse(text);
    useDAWStore.getState().loadProject(legacyProject);
    useDAWStore.getState().setProjectName(file.name.replace('.json', ''));
  } else {
    pkg = await loadDuckDawPackage(file);
    useDAWStore.getState().loadProject(pkg.project);
    useDAWStore.getState().setProjectName(pkg.manifest.name || file.name.replace('.duckdaw', ''));
  }
  
  await idb.set(FILE_HANDLE_KEY, handles[0]);
  useDAWStore.getState().setDirty(false);
  return true;
}
