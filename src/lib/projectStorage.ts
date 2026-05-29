import JSZip from 'jszip';
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

export async function createDuckDawPackage(name: string, description?: string): Promise<Blob> {
  const store = useDAWStore.getState();
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
    name: name,
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
