import JSZip from 'jszip';
import * as idb from 'idb-keyval';
import {
  dawStore,
  useDAWStore,
  type Clip,
  type MetronomeSound,
  type PersistedProjectState,
} from '../store/dawStore';

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
  project: PersistedProjectState;
  samples: Map<string, ArrayBuffer>;
  presets: Map<string, object>;
}

const METRONOME_SOUNDS: MetronomeSound[] = ['cute', 'click', 'woodblock', 'electronic'];

function getMetronomeSound(value: unknown): MetronomeSound {
  return METRONOME_SOUNDS.includes(value as MetronomeSound)
    ? value as MetronomeSound
    : 'cute';
}

function getMajorVersion(version: unknown): number {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('Invalid DuckDAW version');
  }
  return Number(version.split('.')[0]);
}

const MAX_PACKAGE_BYTES = 512 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 5_000;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_PROJECT_BYTES = 50 * 1024 * 1024;
const MAX_SAMPLE_BYTES = 256 * 1024 * 1024;
const MAX_TOTAL_SAMPLE_BYTES = 1024 * 1024 * 1024;

function getUncompressedSize(entry: JSZip.JSZipObject | null | undefined): number {
  return Number((entry as any)?._data?.uncompressedSize ?? 0);
}

function assertSafeZipEntry(entry: JSZip.JSZipObject): void {
  const originalName = (entry as any).unsafeOriginalName ?? entry.name;
  if (typeof originalName !== 'string' || originalName.includes('\0') || originalName.includes('\\')
    || originalName.startsWith('/') || originalName.split('/').includes('..')) {
    throw new Error('Invalid DuckDAW ZIP entry path');
  }
}

function assertSafeResourceName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || name.length === 0 || name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new Error('Invalid DuckDAW resource path');
  }
}

export const DUCKDAW_FORMAT_VERSION = '1.1.0';

function extensionForAudioMime(mimeType: unknown): string {
  switch (typeof mimeType === 'string' ? mimeType.split(';')[0].toLowerCase() : '') {
    case 'audio/mpeg': return 'mp3';
    case 'audio/ogg': return 'ogg';
    case 'audio/webm': return 'webm';
    case 'audio/mp4': return 'm4a';
    case 'audio/aac': return 'aac';
    case 'audio/flac': return 'flac';
    case 'audio/wav':
    case 'audio/x-wav':
    case 'audio/wave': return 'wav';
    default: return 'wav';
  }
}

function audioMimeForResource(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase();
  const byExtension: Record<string, string> = {
    mp3: 'audio/mpeg', ogg: 'audio/ogg', webm: 'audio/webm', m4a: 'audio/mp4',
    aac: 'audio/aac', flac: 'audio/flac', wav: 'audio/wav',
  };
  return byExtension[extension ?? ''] ?? 'audio/wav';
}

function validateProjectData(project: any): void {
  if (!Array.isArray(project.tracks) || !Array.isArray(project.clips)) {
    throw new Error('Invalid DuckDAW project collections');
  }

  const arrangements = Array.isArray(project.arrangements) && project.arrangements.length > 0
    ? project.arrangements
    : [{ id: 'main', name: 'Main Arrangement' }];
  const arrangementIds = new Set<string>();
  for (const arrangement of arrangements) {
    if (typeof arrangement?.id !== 'string' || arrangement.id.length === 0 || arrangementIds.has(arrangement.id)) {
      throw new Error('Invalid or duplicate DuckDAW arrangement');
    }
    arrangementIds.add(arrangement.id);
  }
  if (project.activeArrangementId != null && !arrangementIds.has(project.activeArrangementId)) {
    throw new Error('Invalid DuckDAW active arrangement');
  }

  const trackIds = new Set<string>();
  for (const track of project.tracks) {
    if (typeof track?.id !== 'string' || track.id.length === 0 || trackIds.has(track.id)
      || (track.type !== 'midi' && track.type !== 'audio')
      || !Number.isFinite(track.volume) || track.volume < 0 || track.volume > 1
      || !Number.isFinite(track.pan) || track.pan < -1 || track.pan > 1) {
      throw new Error('Invalid or duplicate DuckDAW track');
    }
    trackIds.add(track.id);
  }

  const clipIds = new Set<string>();
  for (const clip of project.clips) {
    const track = project.tracks.find((candidate: any) => candidate.id === clip?.trackId);
    if (typeof clip?.id !== 'string' || clip.id.length === 0 || clipIds.has(clip.id) || !track || track.type !== clip.type
      || (clip.arrangementId != null && !arrangementIds.has(clip.arrangementId))
      || (clip.type === 'audio' && clip.mimeType != null
        && (typeof clip.mimeType !== 'string' || !clip.mimeType.startsWith('audio/')))
      || !Number.isFinite(clip.start) || clip.start < 0
      || !Number.isFinite(clip.duration) || clip.duration <= 0) {
      throw new Error('Invalid DuckDAW clip or track reference');
    }
    if (clip.type === 'midi') {
      if (!Array.isArray(clip.notes)) throw new Error('Invalid DuckDAW MIDI notes');
      const noteIds = new Set<string>();
      for (const note of clip.notes) {
        if (typeof note?.id !== 'string' || note.id.length === 0 || noteIds.has(note.id)
          || typeof note.note !== 'string'
          || !Number.isFinite(note.start) || note.start < 0
          || !Number.isFinite(note.duration) || note.duration <= 0
          || !Number.isFinite(note.velocity) || note.velocity < 0 || note.velocity > 1) {
          throw new Error('Invalid DuckDAW MIDI note');
        }
        noteIds.add(note.id);
      }
    }
    clipIds.add(clip.id);
  }

  const markerIds = new Set<string>();
  for (const marker of Array.isArray(project.markers) ? project.markers : []) {
    if (typeof marker?.id !== 'string' || marker.id.length === 0 || markerIds.has(marker.id)
      || !Number.isFinite(marker.position) || marker.position < 0) {
      throw new Error('Invalid or duplicate DuckDAW marker');
    }
    markerIds.add(marker.id);
  }

  const bpm = project.transport?.bpm;
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) throw new Error('Invalid DuckDAW BPM');
  const signature = project.transport?.timeSignature;
  if (!Array.isArray(signature) || signature.length !== 2 || signature.some((value: unknown) => !Number.isFinite(value) || Number(value) <= 0)) {
    throw new Error('Invalid DuckDAW time signature');
  }
  const loopStart = project.transport?.loopStart;
  const loopEnd = project.transport?.loopEnd;
  if ((loopStart != null && (!Number.isFinite(loopStart) || loopStart < 0))
    || (loopEnd != null && (!Number.isFinite(loopEnd) || loopEnd <= (loopStart ?? 0)))) {
    throw new Error('Invalid DuckDAW loop region');
  }
  const masterVolume = project.master?.volume ?? project.masterVolume;
  if (masterVolume != null && (!Number.isFinite(masterVolume) || masterVolume < 0 || masterVolume > 1)) {
    throw new Error('Invalid DuckDAW master volume');
  }
}

export function validatePersistedProjectState(project: Partial<PersistedProjectState>): void {
  validateProjectData({
    tracks: project.tracks,
    clips: project.clips,
    markers: project.markers ?? [],
    arrangements: project.arrangements,
    activeArrangementId: project.activeArrangementId,
    transport: {
      bpm: project.bpm ?? 120,
      timeSignature: project.timeSignature ?? [4, 4],
      loopStart: project.loopStart,
      loopEnd: project.loopEnd,
    },
    master: { volume: project.masterVolume ?? 0.8 },
  });
}

export async function createDuckDawPackage(
  name?: string,
  description?: string,
  projectState?: PersistedProjectState,
): Promise<Blob> {
  const store = projectState ?? useDAWStore.getState();
  const projectName = name || store.projectName;
  const zip = new JSZip();

  const projectId = store.projectId;
  const createdAt = store.createdAt;

  // Clone clips so we don't mutate the active store
  const clips = JSON.parse(JSON.stringify(store.clips));
  const samplePaths: string[] = [];
  
  // Pack Audio Clips
  for (const clip of clips) {
    if (clip.type === 'audio' && clip.bufferUrl && clip.bufferUrl.startsWith('blob:')) {
      try {
        const response = await fetch(clip.bufferUrl);
        const arrayBuffer = await response.arrayBuffer();
        
        const filename = `${clip.id}.${extensionForAudioMime(clip.mimeType)}`;
        const path = `samples/${filename}`;
        
        zip.file(path, arrayBuffer);
        
        clip.bufferUrl = path;
        samplePaths.push(filename);
      } catch (error) {
        throw new Error(`Failed to package audio resource for clip ${clip.id}`, { cause: error });
      }
    }
  }

  const manifest: Manifest = {
    format: 'duckdaw',
    version: DUCKDAW_FORMAT_VERSION,
    generator: 'duckdaw',
    createdAt,
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

  const arrangements = store.arrangements.length > 0
    ? store.arrangements
    : [{ id: 'main', name: 'Main Arrangement' }];
  const activeArrangementId = store.activeArrangementId != null
    && arrangements.some(arrangement => arrangement.id === store.activeArrangementId)
    ? store.activeArrangementId
    : arrangements[0].id;

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
    master: {
      volume: store.masterVolume
    },
    tracks: store.tracks.map(t => ({
      ...t,
      insertEffects: [],
      sends: [],
      automationLanes: []
    })),
    clips: clips,
    markers: store.markers,
    automation: [],
    tempoTrack: [{ position: 0, bpm: store.bpm, curve: 'linear' }],
    arrangements,
    activeArrangementId
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('project.json', JSON.stringify(projectData, null, 2));

  return await zip.generateAsync({ type: 'blob' });
}

export async function loadDuckDawPackage(file: File | Blob): Promise<ProjectPackage> {
  if (file.size > MAX_PACKAGE_BYTES) throw new Error('DuckDAW package exceeds the size limit');
  const zip = new JSZip();
  const buffer = await file.arrayBuffer();
  const loadedZip = await zip.loadAsync(buffer);
  const entries = Object.values(loadedZip.files);
  if (entries.length > MAX_ZIP_ENTRIES) throw new Error('DuckDAW package contains too many files');
  entries.forEach(assertSafeZipEntry);

  const manifestEntry = loadedZip.file('manifest.json');
  if (getUncompressedSize(manifestEntry) > MAX_MANIFEST_BYTES) throw new Error('DuckDAW manifest exceeds the size limit');
  const manifestStr = await manifestEntry?.async('text');
  if (!manifestStr) throw new Error('Invalid DuckDAW file: missing manifest.json');
  
  const manifest = JSON.parse(manifestStr) as Manifest;
  if (manifest.format !== 'duckdaw') throw new Error('Not a DuckDAW format');
  if (getMajorVersion(manifest.version) > getMajorVersion(DUCKDAW_FORMAT_VERSION)) {
    throw new Error(`Unsupported DuckDAW version: ${manifest.version}`);
  }
  if (!manifest.projectId) throw new Error('Invalid DuckDAW project ID');
  const declaredSamples = manifest.resources?.samples ?? [];
  if (declaredSamples.length > MAX_ZIP_ENTRIES) throw new Error('DuckDAW package declares too many resources');
  for (const resourceName of declaredSamples) {
    assertSafeResourceName(resourceName);
  }
  for (const resourceName of manifest.resources?.presets ?? []) {
    assertSafeResourceName(resourceName);
  }

  const projectEntry = loadedZip.file('project.json');
  if (getUncompressedSize(projectEntry) > MAX_PROJECT_BYTES) throw new Error('DuckDAW project data exceeds the size limit');
  const projectStr = await projectEntry?.async('text');
  if (!projectStr) throw new Error('Invalid DuckDAW file: missing project.json');

  const project = JSON.parse(projectStr);
  if (project.meta?.projectId !== manifest.projectId) {
    throw new Error('DuckDAW project ID mismatch');
  }
  if (getMajorVersion(project.meta?.version) !== getMajorVersion(manifest.version)) {
    throw new Error('DuckDAW project version mismatch');
  }
  if (project.transport?.bpm != null && manifest.bpm != null && project.transport.bpm !== manifest.bpm) {
    throw new Error('DuckDAW BPM metadata mismatch');
  }
  validateProjectData(project);

  const declaredSampleSet = new Set(declaredSamples);
  if (declaredSampleSet.size !== declaredSamples.length) throw new Error('DuckDAW package declares duplicate audio resources');
  let totalSampleBytes = 0;
  for (const sampleName of declaredSamples) {
    const sampleEntry = loadedZip.file(`samples/${sampleName}`);
    if (!sampleEntry) throw new Error(`DuckDAW audio resource is missing: ${sampleName}`);
    const size = getUncompressedSize(sampleEntry);
    if (size > MAX_SAMPLE_BYTES) throw new Error(`DuckDAW audio resource exceeds the size limit: ${sampleName}`);
    totalSampleBytes += size;
    if (totalSampleBytes > MAX_TOTAL_SAMPLE_BYTES) throw new Error('DuckDAW audio resources exceed the total size limit');
  }
  for (const clip of project.clips) {
    if (clip.type === 'audio' && clip.bufferUrl != null
      && (typeof clip.bufferUrl !== 'string' || !clip.bufferUrl.startsWith('samples/'))) {
      throw new Error(`DuckDAW audio clip has an invalid resource URL: ${clip.id}`);
    }
    if (clip.type === 'audio' && typeof clip.bufferUrl === 'string' && clip.bufferUrl.startsWith('samples/')) {
      const sampleName = clip.bufferUrl.slice('samples/'.length);
      assertSafeResourceName(sampleName);
      if (!declaredSampleSet.has(sampleName)) {
        throw new Error(`DuckDAW clip references an undeclared audio resource: ${sampleName}`);
      }
    }
  }

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
           const mimeType = clip.mimeType || audioMimeForResource(sampleName);
           const blob = new Blob([arrayBuffer], { type: mimeType });
           clip.bufferUrl = URL.createObjectURL(blob);
           clip.mimeType = mimeType;
        }
      }
    }
  }

  const arrangements = Array.isArray(project.arrangements) && project.arrangements.length > 0
    ? project.arrangements
    : [{ id: 'main', name: 'Main Arrangement' }];
  const activeArrangementId = arrangements.some((arrangement: { id: string }) => arrangement.id === project.activeArrangementId)
    ? project.activeArrangementId
    : arrangements[0].id;
  const transport = project.transport ?? {};
  const metronome = transport.metronome ?? {};

  const compatibleProject: PersistedProjectState = {
    projectId: manifest.projectId,
    createdAt: manifest.createdAt ?? new Date().toISOString(),
    projectName: manifest.name ?? 'New Project',
    bpm: transport.bpm ?? manifest.bpm ?? 120,
    timeSignature: transport.timeSignature ?? manifest.timeSignature ?? [4, 4],
    isLooping: transport.isLooping ?? false,
    loopStart: transport.loopStart ?? 0,
    loopEnd: transport.loopEnd ?? 16,
    metronomeOn: metronome.enabled ?? false,
    metronomeVolume: metronome.volume ?? 0.8,
    metronomeSound: getMetronomeSound(metronome.sound),
    metronomeSubdivisions: metronome.subdivisions ?? 1,
    masterVolume: project.master?.volume ?? project.masterVolume ?? 0.8,
    tracks: Array.isArray(project.tracks) ? project.tracks : [],
    clips: Array.isArray(project.clips)
      ? project.clips.map((clip: Clip) => ({ ...clip, arrangementId: clip.arrangementId ?? activeArrangementId }))
      : [],
    markers: Array.isArray(project.markers) ? project.markers : [],
    arrangements,
    activeArrangementId,
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
const RECENT_PROJECTS_KEY = 'duckdaw_recent_projects';
const TEMPLATES_KEY = 'duckdaw_templates';
const RECOVERY_SNAPSHOT_KEY = 'duckdaw_recovery_snapshot_v1';

export interface RecoverySnapshot {
  projectId: string;
  updatedAt: number;
  packageData: ArrayBuffer;
}

export async function saveRecoverySnapshot(): Promise<RecoverySnapshot> {
  const state = useDAWStore.getState();
  const blob = await createDuckDawPackage();
  const snapshot: RecoverySnapshot = {
    projectId: state.projectId,
    updatedAt: Date.now(),
    packageData: await blob.arrayBuffer(),
  };
  await idb.set(RECOVERY_SNAPSHOT_KEY, snapshot);
  return snapshot;
}

export async function getRecoverySnapshot(): Promise<RecoverySnapshot | null> {
  return await idb.get<RecoverySnapshot>(RECOVERY_SNAPSHOT_KEY) ?? null;
}

export async function clearRecoverySnapshot(): Promise<void> {
  await idb.del(RECOVERY_SNAPSHOT_KEY);
}

export async function restoreRecoverySnapshot(): Promise<boolean> {
  const snapshot = await getRecoverySnapshot();
  if (!snapshot) return false;
  const pkg = await loadDuckDawPackage(new Blob([snapshot.packageData], { type: 'application/zip' }));
  useDAWStore.getState().loadProject(pkg.project);
  useDAWStore.getState().setDirty(true);
  return true;
}

export interface RecentProject {
  name: string;
  handle: any;
  lastOpened: number;
}

export interface ProjectTemplate {
  name: string;
  description: string;
  data: any; // the JSON package data or project data
}

export async function saveAsTemplate(name: string, description: string) {
  const state = useDAWStore.getState();
  const templateState: PersistedProjectState = {
    ...state.getProjectData(),
    projectId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    projectName: name,
    clips: [],
    markers: [],
  };
  const pkg = await createDuckDawPackage(name, description, templateState);
  const buffer = await pkg.arrayBuffer();
  
  let templates = await idb.get<ProjectTemplate[]>(TEMPLATES_KEY) || [];
  templates.push({ name, description, data: buffer });
  await idb.set(TEMPLATES_KEY, templates);
}

export async function getTemplates(): Promise<ProjectTemplate[]> {
  return await idb.get<ProjectTemplate[]>(TEMPLATES_KEY) || [];
}

export async function deleteTemplate(index: number): Promise<void> {
  const templates = await getTemplates();
  if (index < 0 || index >= templates.length) return;
  templates.splice(index, 1);
  await idb.set(TEMPLATES_KEY, templates);
}

export async function openTemplate(templateData: ArrayBuffer) {
  const blob = new Blob([templateData], { type: 'application/zip' });
  const file = new File([blob], 'template.duckdaw');
  const pkg = await loadDuckDawPackage(file);
  useDAWStore.getState().loadProject({
    ...pkg.project,
    projectId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    projectName: pkg.manifest.name || 'New Project',
  });
  useDAWStore.getState().setDirty(true);
  dawStore.temporal.getState().clear();
  
  // A template instance is always a new unsaved project.
  await idb.del(FILE_HANDLE_KEY);
  await clearRecoverySnapshot();
}

export async function getRecentProjects(): Promise<RecentProject[]> {
  const recents = await idb.get<RecentProject[]>(RECENT_PROJECTS_KEY);
  return recents || [];
}

async function addToRecentProjects(name: string, handle: any) {
  let recents = await getRecentProjects();
  recents = recents.filter(r => r.name !== name);
  recents.unshift({ name, handle, lastOpened: Date.now() });
  if (recents.length > 10) recents = recents.slice(0, 10);
  await idb.set(RECENT_PROJECTS_KEY, recents);
}

export type SaveProjectResult = 'saved' | 'downloaded' | 'skipped' | 'cancelled';

export async function saveProject(forceDialog = false, isAutoSave = false): Promise<SaveProjectResult> {
  const store = useDAWStore.getState();
  let handle: FileSystemFileHandle | undefined = await idb.get(FILE_HANDLE_KEY);
  
  if (forceDialog || !handle) {
    if (isAutoSave) return 'skipped';

    if (!('showSaveFilePicker' in window)) {
       // Fallback to blob download
       const blob = await createDuckDawPackage();
       await saveToFileSystemAsDownload(blob, store.projectName);
       store.setDirty(false);
       await clearRecoverySnapshot();
       return 'downloaded';
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
      if (e.name === 'AbortError') return 'cancelled';
      throw e;
    }
  }

  if (handle) {
    // Check permission
    if (await (handle as any).queryPermission({ mode: 'readwrite' }) !== 'granted') {
      if (isAutoSave) return 'skipped';
      if (await (handle as any).requestPermission({ mode: 'readwrite' }) !== 'granted') {
         throw new Error('Permission denied to write to file.');
      }
    }
    const blob = await createDuckDawPackage();
    const writable = await (handle as any).createWritable();
    await writable.write(blob);
    await writable.close();
    store.setDirty(false);
    await clearRecoverySnapshot();
    await addToRecentProjects(store.projectName, handle);
    return 'saved';
  }
  return 'skipped';
}

export async function openProject() {
  if (!confirmDiscardChanges()) return false;
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
  const isLegacy = file.name.endsWith('.json');
  let pkg;
  if (isLegacy) {
    const text = await file.text();
    const legacyProject = JSON.parse(text);
    validatePersistedProjectState(legacyProject);
    useDAWStore.getState().loadProject(legacyProject);
    useDAWStore.getState().setProjectName(file.name.replace('.json', ''));
  } else {
    pkg = await loadDuckDawPackage(file);
    useDAWStore.getState().loadProject(pkg.project);
    useDAWStore.getState().setProjectName(pkg.manifest.name || file.name.replace('.duckdaw', ''));
  }
  
  dawStore.temporal.getState().clear();
  if (isLegacy) {
    await idb.del(FILE_HANDLE_KEY);
    useDAWStore.getState().setDirty(true);
  } else {
    await idb.set(FILE_HANDLE_KEY, handles[0]);
    useDAWStore.getState().setDirty(false);
  }
  await addToRecentProjects(useDAWStore.getState().projectName, handles[0]);
  return true;
}

export async function openRecentProject(handle: any) {
  if (!confirmDiscardChanges()) return false;
  // Check permission
  if (await handle.queryPermission({ mode: 'read' }) !== 'granted') {
    if (await handle.requestPermission({ mode: 'read' }) !== 'granted') {
       throw new Error('Permission denied to read file.');
    }
  }
  
  const file = await handle.getFile();
  const isLegacy = file.name.endsWith('.json');
  let pkg;
  if (isLegacy) {
    const text = await file.text();
    const legacyProject = JSON.parse(text);
    validatePersistedProjectState(legacyProject);
    useDAWStore.getState().loadProject(legacyProject);
    useDAWStore.getState().setProjectName(file.name.replace('.json', ''));
  } else {
    pkg = await loadDuckDawPackage(file);
    useDAWStore.getState().loadProject(pkg.project);
    useDAWStore.getState().setProjectName(pkg.manifest.name || file.name.replace('.duckdaw', ''));
  }
  
  dawStore.temporal.getState().clear();
  if (isLegacy) {
    await idb.del(FILE_HANDLE_KEY);
    useDAWStore.getState().setDirty(true);
  } else {
    await idb.set(FILE_HANDLE_KEY, handle);
    useDAWStore.getState().setDirty(false);
  }
  await addToRecentProjects(useDAWStore.getState().projectName, handle);
  return true;
}

export function confirmDiscardChanges(): boolean {
  const state = useDAWStore.getState();
  return !state.isDirty || window.confirm('You have unsaved changes. Discard them and continue?');
}

export async function createNewProject(): Promise<boolean> {
  if (!confirmDiscardChanges()) return false;

  await idb.del(FILE_HANDLE_KEY);
  await clearRecoverySnapshot();
  useDAWStore.getState().loadProject({
    projectId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    projectName: 'New Project',
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [],
    clips: [],
    markers: [],
    arrangements: [{ id: 'main', name: 'Main Arrangement' }],
    activeArrangementId: 'main',
  });
  useDAWStore.getState().setDirty(true);
  dawStore.temporal.getState().clear();
  return true;
}
