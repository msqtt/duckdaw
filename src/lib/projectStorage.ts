import JSZip from 'jszip';
import * as idb from 'idb-keyval';
import {
  dawStore,
  useDAWStore,
  type Clip,
  type MetronomeSound,
  type PersistedProjectState,
} from '../store/dawStore';
import { measurePerfAsync } from './performance';
import { createDefaultAudioEdit } from './audioEditing';
import { prepareForProjectReplacement } from './projectReplacementRuntime';
import { requestDecision } from './decisionService';
import { createDefaultTempoMap, validateTempoMap, type TempoPoint } from './tempoMap';
import { normalizeAutomationLane, type AutomationLane } from './automation';

import { createDefaultRouting, validateRoutingGraph, type Bus, type Send } from './routingGraph';
import {
  legacyEffectToPluginDescriptor,
  legacyInstrumentToPluginDescriptor,
  normalizePluginChain,
  normalizePluginDescriptor,
  pluginEffectToLegacyType,
  pluginInstrumentToLegacyType,
  validatePluginDescriptor,
} from './pluginSdk';
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

export const DUCKDAW_FORMAT_VERSION = '2.1.0';

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
  const pluginInstanceIds = new Set<string>();
  const validatePluginInstance = (descriptor: unknown) => {
    validatePluginDescriptor(descriptor);
    if (pluginInstanceIds.has(descriptor.id)) throw new Error(`Duplicate plugin instance ID: ${descriptor.id}`);
    pluginInstanceIds.add(descriptor.id);
  };
  for (const track of project.tracks) {
    if (typeof track?.id !== 'string' || track.id.length === 0 || trackIds.has(track.id)
      || (track.type !== 'midi' && track.type !== 'audio')
      || !Number.isFinite(track.volume) || track.volume < 0 || track.volume > 1
      || !Number.isFinite(track.pan) || track.pan < -1 || track.pan > 1) {
      throw new Error('Invalid or duplicate DuckDAW track');
    }
    trackIds.add(track.id);

    if (track.instrumentPlugin != null) {
      if (track.type === 'audio') throw new Error('Audio track cannot contain instrument plugin');
      validatePluginInstance(track.instrumentPlugin);
    }
    if (track.effectPlugins != null) {
      if (!Array.isArray(track.effectPlugins)) throw new Error('Invalid track effect plugin chain');
      track.effectPlugins.forEach(validatePluginInstance);
    }

    if (track.automationLanes != null) {
      if (!Array.isArray(track.automationLanes)) throw new Error('Invalid DuckDAW automation lanes');
      const laneIds = new Set<string>();
      for (const rawLane of track.automationLanes) {
        try {
          const lane = normalizeAutomationLane(rawLane as AutomationLane);
          if (laneIds.has(lane.id)) throw new Error('duplicate lane ID');
          laneIds.add(lane.id);
        } catch (error) {
          throw new Error('Invalid DuckDAW automation lane', { cause: error });
        }
      }
    }
  }

  const rawTempoTrack = project.tempoTrack;
  const projectMajor = getMajorVersion(project.meta?.version ?? '1.0.0');
  if (rawTempoTrack != null) {
    if (!Array.isArray(rawTempoTrack)) throw new Error('Invalid DuckDAW tempo track');
    if (projectMajor >= 2) {
      try {
        validateTempoMap(rawTempoTrack as TempoPoint[]);
      } catch (error) {
        throw new Error('Invalid DuckDAW tempo track', { cause: error });
      }
    } else {
      const ids = new Set<string>();
      const beats = new Set<number>();
      for (let index = 0; index < rawTempoTrack.length; index += 1) {
        const point = rawTempoTrack[index];
        const beat = point?.beat ?? point?.position;
        const id = point?.id ?? `tempo-${index}`;
        if (!Number.isFinite(beat) || beat < 0 || beats.has(beat)
          || !Number.isFinite(point?.bpm) || point.bpm < 20 || point.bpm > 300
          || (point?.curve !== 'step' && point?.curve !== 'linear') || ids.has(id)) {
          throw new Error('Invalid DuckDAW legacy tempo track');
        }
        ids.add(id);
        beats.add(beat);
      }
    }
  } else if (projectMajor >= 2) {
    throw new Error('Invalid DuckDAW tempo track');
  }

  const legacyRouting = createDefaultRouting(project.tracks);
  if (projectMajor >= 2 && (!Array.isArray(project.buses) || !Array.isArray(project.sends))) {
    throw new Error('Invalid DuckDAW routing graph');
  }
  const routingBuses = Array.isArray(project.buses) && project.buses.length > 0
    ? project.buses as Bus[]
    : legacyRouting.buses;
  const routingSends = Array.isArray(project.sends) ? project.sends as Send[] : [];
  for (const bus of routingBuses) {
    if (bus.effectPlugins != null) {
      if (!Array.isArray(bus.effectPlugins)) throw new Error('Invalid bus effect plugin chain');
      bus.effectPlugins.forEach(validatePluginInstance);
    }
  }
  const routingRoot = routingBuses.find(bus => bus.outputBusId == null)?.id ?? 'master';
  try {
    validateRoutingGraph(
      project.tracks.map((track: any) => ({ id: track.id, outputBusId: track.outputBusId ?? routingRoot })),
      routingBuses,
      routingSends,
    );
  } catch (error) {
    throw new Error('Invalid DuckDAW routing graph', { cause: error });
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
    const edit = clip.audioEdit;
    if (clip.type === 'midi' && edit != null) {
      throw new Error('MIDI clips cannot contain audio edit parameters');
    }
    if (clip.type === 'audio' && edit != null) {
      const curves = new Set(['linear', 'exponential', 'sCurve', 'logarithmic']);
      if (!Number.isFinite(edit.sourceOffsetSeconds) || edit.sourceOffsetSeconds < 0
        || !Number.isFinite(edit.gainDb) || edit.gainDb < -60 || edit.gainDb > 24
        || !Number.isFinite(edit.fadeInBeats) || edit.fadeInBeats < 0
        || !Number.isFinite(edit.fadeOutBeats) || edit.fadeOutBeats < 0
        || edit.fadeInBeats + edit.fadeOutBeats > clip.duration
        || !curves.has(edit.fadeInCurve) || !curves.has(edit.fadeOutCurve)
        || typeof edit.reversed !== 'boolean') {
        throw new Error('Invalid DuckDAW audio edit parameters');
      }
    }
    if (clip.takes != null) {
      if (!Array.isArray(clip.takes)) throw new Error('Invalid DuckDAW takes');
      const takeIds = new Set<string>();
      for (const take of clip.takes) {
        if (typeof take?.id !== 'string' || !take.id || takeIds.has(take.id)
          || take.type !== clip.type || typeof take.name !== 'string'
          || !Number.isFinite(take.duration) || take.duration <= 0
          || typeof take.createdAt !== 'string'
          || (take.type === 'midi' && !Array.isArray(take.notes))
          || (take.type === 'audio' && take.mimeType != null
            && (typeof take.mimeType !== 'string' || !take.mimeType.startsWith('audio/')))) {
          throw new Error('Invalid or duplicate DuckDAW take');
        }
        takeIds.add(take.id);
      }
      if (clip.activeTakeId != null && !takeIds.has(clip.activeTakeId)) throw new Error('Invalid DuckDAW active take');
    } else if (clip.activeTakeId != null) {
      throw new Error('Invalid DuckDAW active take');
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
    tempoTrack: project.tempoTrack,
    buses: project.buses,
    sends: project.sends,
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
    if (clip.type === 'audio') {
      clip.audioEdit = { ...createDefaultAudioEdit(), ...clip.audioEdit };
    } else {
      delete clip.audioEdit;
    }
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

  const fallbackRouting = createDefaultRouting(store.tracks);
  const candidateBuses = (Array.isArray(store.buses) && store.buses.length > 0
    ? store.buses
    : fallbackRouting.buses).map(bus => {
      const effectPlugins = bus.effectPlugins == null
        ? bus.effects.map(legacyEffectToPluginDescriptor)
        : normalizePluginChain(bus.effectPlugins);
      return {
        ...bus,
        effectPlugins,
        effects: effectPlugins.flatMap(plugin => {
          const type = pluginEffectToLegacyType(plugin.pluginId);
          if (type == null) return [];
          return [{
            id: plugin.id,
            type,
            enabled: plugin.enabled,
            parameters: Object.fromEntries(Object.entries(plugin.parameters)
              .filter((entry): entry is [string, number] => typeof entry[1] === 'number')),
          }];
        }),
      };
    });
  const candidateSends = Array.isArray(store.sends) ? store.sends : [];
  const rootBusId = candidateBuses.find(bus => bus.outputBusId == null)?.id ?? 'master';
  const tracksWithRouting = store.tracks.map(track => {
    const instrumentPlugin = track.type === 'midi'
      ? (track.instrumentPlugin == null
        ? legacyInstrumentToPluginDescriptor(track.instrument, track.env, `instrument-${track.id}`)
        : normalizePluginDescriptor(track.instrumentPlugin))
      : undefined;
    return {
      ...track,
      instrument: instrumentPlugin == null ? undefined : pluginInstrumentToLegacyType(instrumentPlugin.pluginId),
      instrumentPlugin,
      effectPlugins: normalizePluginChain(track.effectPlugins),
      outputBusId: track.outputBusId ?? rootBusId,
    };
  });
  const routing = validateRoutingGraph(tracksWithRouting, candidateBuses, candidateSends);

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
    tracks: tracksWithRouting.map(track => ({
      ...track,
      insertEffects: [],
      automationLanes: track.automationLanes ?? []
    })),
    buses: routing.buses,
    sends: routing.sends,
    clips: clips,
    markers: store.markers,
    automation: [],
    tempoTrack: store.tempoTrack ?? createDefaultTempoMap(store.bpm),
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

  // Migrate tempo track from v1.x format ({position, bpm, curve}) to v2 ({id, beat, bpm, curve})
  const rawTempoTrack = Array.isArray(project.tempoTrack) ? project.tempoTrack : [];
  const effectiveBpm = transport.bpm ?? manifest.bpm ?? 120;
  let migratedTempoTrack: TempoPoint[];
  if (rawTempoTrack.length > 0 && rawTempoTrack[0].id != null) {
    migratedTempoTrack = validateTempoMap(rawTempoTrack as TempoPoint[]);
  } else if (rawTempoTrack.length > 0) {
    const migrated = rawTempoTrack.map((p: any, i: number) => ({
      id: `tempo-${i}`,
      beat: typeof p.position === 'number' ? p.position : (typeof p.beat === 'number' ? p.beat : 0),
      bpm: Number(p.bpm),
      curve: p.curve === 'linear' ? 'linear' as const : 'step' as const,
    }));
    migratedTempoTrack = validateTempoMap(migrated);
  } else {
    migratedTempoTrack = createDefaultTempoMap(effectiveBpm);
  }

  const fallbackRouting = createDefaultRouting(Array.isArray(project.tracks) ? project.tracks : []);
  const migratedBuses = (Array.isArray(project.buses) && project.buses.length > 0
    ? project.buses as Bus[]
    : fallbackRouting.buses).map(bus => ({
      ...bus,
      effects: Array.isArray(bus.effects) ? bus.effects : [],
      effectPlugins: bus.effectPlugins == null
        ? (Array.isArray(bus.effects) ? bus.effects.map(legacyEffectToPluginDescriptor) : [])
        : normalizePluginChain(bus.effectPlugins),
    }));
  const migratedSends = Array.isArray(project.sends) ? project.sends as Send[] : [];
  const rootBusId = migratedBuses.find(bus => bus.outputBusId == null)?.id ?? 'master';
  const migratedTracks = (Array.isArray(project.tracks) ? project.tracks : []).map((track: any) => {
    const instrumentPlugin = track.type === 'midi'
      ? (track.instrumentPlugin == null
        ? legacyInstrumentToPluginDescriptor(track.instrument, track.env, `instrument-${track.id}`)
        : normalizePluginDescriptor(track.instrumentPlugin))
      : undefined;
    return {
      ...track,
      instrument: instrumentPlugin == null ? undefined : pluginInstrumentToLegacyType(instrumentPlugin.pluginId),
      instrumentPlugin,
      effectPlugins: normalizePluginChain(track.effectPlugins),
      automationLanes: Array.isArray(track.automationLanes)
        ? track.automationLanes.map((lane: AutomationLane) => normalizeAutomationLane(lane))
        : [],
      outputBusId: track.outputBusId ?? rootBusId,
    };
  });
  const migratedRouting = validateRoutingGraph(migratedTracks, migratedBuses, migratedSends);

  const compatibleProject: PersistedProjectState = {
    projectId: manifest.projectId,
    createdAt: manifest.createdAt ?? new Date().toISOString(),
    projectName: manifest.name ?? 'New Project',
    bpm: effectiveBpm,
    timeSignature: transport.timeSignature ?? manifest.timeSignature ?? [4, 4],
    isLooping: transport.isLooping ?? false,
    loopStart: transport.loopStart ?? 0,
    loopEnd: transport.loopEnd ?? 16,
    metronomeOn: metronome.enabled ?? false,
    metronomeVolume: metronome.volume ?? 0.8,
    metronomeSound: getMetronomeSound(metronome.sound),
    metronomeSubdivisions: metronome.subdivisions ?? 1,
    masterVolume: project.master?.volume ?? project.masterVolume ?? 0.8,
    tracks: migratedTracks,
    clips: Array.isArray(project.clips)
      ? project.clips.map((clip: Clip) => ({
          ...clip,
          arrangementId: clip.arrangementId ?? activeArrangementId,
          audioEdit: clip.type === 'audio'
            ? { ...createDefaultAudioEdit(), ...clip.audioEdit }
            : undefined,
        }))
      : [],
    markers: Array.isArray(project.markers) ? project.markers : [],
    arrangements,
    activeArrangementId,
    tempoTrack: migratedTempoTrack,
    buses: migratedRouting.buses,
    sends: migratedRouting.sends,
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
const LEGACY_RECOVERY_SNAPSHOT_KEY = 'duckdaw_recovery_snapshot_v1';
const RECOVERY_SNAPSHOT_KEY = 'duckdaw_recovery_snapshot_v2';
const RECOVERY_ASSET_PREFIX = 'duckdaw_recovery_asset_v2:';

export async function detachCurrentProjectFile(): Promise<void> {
  await idb.del(FILE_HANDLE_KEY);
}



interface ProjectLoadCommitOptions {
  projectName: string;
  dirty: boolean;
  fileHandle: unknown | null;
  recentHandle?: unknown;
}

async function commitProjectLoad(
  project: Partial<PersistedProjectState>,
  options: ProjectLoadCommitOptions,
): Promise<void> {
  await prepareForProjectReplacement();
  const previousHandle = await idb.get(FILE_HANDLE_KEY);
  const restorePreviousHandle = async (cause: unknown) => {
    try {
      if (previousHandle == null) await idb.del(FILE_HANDLE_KEY);
      else await idb.set(FILE_HANDLE_KEY, previousHandle);
    } catch (rollbackError) {
      try { await idb.del(FILE_HANDLE_KEY); } catch { /* Storage is unavailable; surface both failures. */ }
      throw new AggregateError([cause, rollbackError], 'Project source binding and rollback both failed');
    }
  };

  try {
    if (options.fileHandle == null) await idb.del(FILE_HANDLE_KEY);
    else await idb.set(FILE_HANDLE_KEY, options.fileHandle);
  } catch (error) {
    await restorePreviousHandle(error);
    throw error;
  }

  const loaded = useDAWStore.getState().loadProject(project);
  if (!loaded) {
    const error = new Error('Project data could not be normalized');
    await restorePreviousHandle(error);
    throw error;
  }
  useDAWStore.getState().setProjectName(options.projectName);
  useDAWStore.getState().setDirty(options.dirty);
  dawStore.temporal.getState().clear();

  try {
    await clearRecoverySnapshot();
  } catch (error) {
    console.error('Failed to clear the previous recovery snapshot after Project commit', error);
  }

  if (options.recentHandle != null) {
    try {
      await addToRecentProjects(options.projectName, options.recentHandle);
    } catch {
      // Recent history is best-effort and must not invalidate an active Project commit.
    }
  }
}

export async function commitExternalProjectLoad(
  project: Partial<PersistedProjectState>,
  options: { projectName: string; dirty: boolean },
): Promise<void> {
  await commitProjectLoad(project, {
    ...options,
    fileHandle: null,
  });
}
interface LegacyRecoverySnapshot {
  projectId: string;
  updatedAt: number;
  packageData: ArrayBuffer;
}

interface RecoveryAsset {
  data: ArrayBuffer;
  mimeType: string;
}

export interface IncrementalRecoverySnapshot {
  version: 2;
  projectId: string;
  updatedAt: number;
  project: PersistedProjectState;
  assetIds: string[];
}

export type RecoverySnapshot = IncrementalRecoverySnapshot | LegacyRecoverySnapshot;

async function hashRecoveryAsset(data: ArrayBuffer): Promise<string> {
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  }
  let hash = 2166136261;
  for (const value of new Uint8Array(data)) {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}-${data.byteLength}`;
}


let recoveryOperationQueue: Promise<void> = Promise.resolve();

function serializeRecoveryOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = recoveryOperationQueue.then(operation, operation);
  recoveryOperationQueue = result.then(() => undefined, () => undefined);
  return result;
}
export async function saveRecoverySnapshot(): Promise<IncrementalRecoverySnapshot> {
  return serializeRecoveryOperation(() => measurePerfAsync('recovery-save', async () => {
  const state = useDAWStore.getState();
  const previous = await getRecoverySnapshot();
  const project = structuredClone(state.getProjectData());
  const assetIds = new Set<string>();

  for (const clip of project.clips) {
    if (clip.type !== 'audio' || !clip.bufferUrl?.startsWith('blob:')) continue;
    const response = await fetch(clip.bufferUrl);
    const data = await response.arrayBuffer();
    const assetId = await hashRecoveryAsset(data);
    const assetKey = `${RECOVERY_ASSET_PREFIX}${assetId}`;
    if (!await idb.get<RecoveryAsset>(assetKey)) {
      await idb.set(assetKey, { data, mimeType: clip.mimeType ?? 'audio/wav' } satisfies RecoveryAsset);
    }
    clip.bufferUrl = `recovery-assets/${assetId}`;
    assetIds.add(assetId);
  }

  const snapshot: IncrementalRecoverySnapshot = {
    version: 2,
    projectId: state.projectId,
    updatedAt: Date.now(),
    project,
    assetIds: [...assetIds],
  };
  await idb.set(RECOVERY_SNAPSHOT_KEY, snapshot);

  if (previous && 'version' in previous && previous.version === 2) {
    for (const oldAssetId of previous.assetIds) {
      if (!assetIds.has(oldAssetId)) await idb.del(`${RECOVERY_ASSET_PREFIX}${oldAssetId}`);
    }
  }
  return snapshot;
  }));
}

export async function getRecoverySnapshot(): Promise<RecoverySnapshot | null> {
  return await idb.get<IncrementalRecoverySnapshot>(RECOVERY_SNAPSHOT_KEY)
    ?? await idb.get<LegacyRecoverySnapshot>(LEGACY_RECOVERY_SNAPSHOT_KEY)
    ?? null;
}

export async function clearRecoverySnapshot(): Promise<void> {
  await serializeRecoveryOperation(async () => {
    const snapshot = await getRecoverySnapshot();
    if (snapshot && 'version' in snapshot && snapshot.version === 2) {
      await Promise.all(snapshot.assetIds.map(assetId => idb.del(`${RECOVERY_ASSET_PREFIX}${assetId}`)));
    }
    await Promise.all([
      idb.del(RECOVERY_SNAPSHOT_KEY),
      idb.del(LEGACY_RECOVERY_SNAPSHOT_KEY),
    ]);
  });
}

export async function restoreRecoverySnapshot(): Promise<boolean> {
  const snapshot = await getRecoverySnapshot();
  if (!snapshot) return false;
  let project: Partial<PersistedProjectState>;
  if ('packageData' in snapshot) {
    const pkg = await loadDuckDawPackage(new Blob([snapshot.packageData], { type: 'application/zip' }));
    project = pkg.project;
  } else {
    project = structuredClone(snapshot.project);
    for (const clip of project.clips ?? []) {
      if (clip.type !== 'audio' || !clip.bufferUrl?.startsWith('recovery-assets/')) continue;
      const assetId = clip.bufferUrl.slice('recovery-assets/'.length);
      const asset = await idb.get<RecoveryAsset>(`${RECOVERY_ASSET_PREFIX}${assetId}`);
      if (!asset) throw new Error(`Recovery audio asset is missing: ${assetId}`);
      clip.mimeType = asset.mimeType;
      clip.bufferUrl = URL.createObjectURL(new Blob([asset.data], { type: asset.mimeType }));
    }
  }
  await commitExternalProjectLoad(project, {
    projectName: project.projectName || 'Recovered Project',
    dirty: true,
  });
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
  await commitExternalProjectLoad({
    ...pkg.project,
    projectId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    projectName: pkg.manifest.name || 'New Project',
  }, {
    projectName: pkg.manifest.name || 'New Project',
    dirty: true,
  });
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
  if (!await confirmDiscardChanges()) return false;
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
  let project: Partial<PersistedProjectState>;
  let projectName: string;
  if (isLegacy) {
    const text = await file.text();
    project = JSON.parse(text);
    validatePersistedProjectState(project);
    projectName = file.name.replace('.json', '');
  } else {
    const pkg = await loadDuckDawPackage(file);
    project = pkg.project;
    projectName = pkg.manifest.name || file.name.replace('.duckdaw', '');
  }

  await commitProjectLoad(project, {
    projectName,
    dirty: isLegacy,
    fileHandle: isLegacy ? null : handles[0],
    recentHandle: handles[0],
  });
  return true;
}

export async function openRecentProject(handle: any) {
  if (!await confirmDiscardChanges()) return false;
  // Check permission
  if (await handle.queryPermission({ mode: 'read' }) !== 'granted') {
    if (await handle.requestPermission({ mode: 'read' }) !== 'granted') {
       throw new Error('Permission denied to read file.');
    }
  }
  
  const file = await handle.getFile();
  const isLegacy = file.name.endsWith('.json');
  let project: Partial<PersistedProjectState>;
  let projectName: string;
  if (isLegacy) {
    const text = await file.text();
    project = JSON.parse(text);
    validatePersistedProjectState(project);
    projectName = file.name.replace('.json', '');
  } else {
    const pkg = await loadDuckDawPackage(file);
    project = pkg.project;
    projectName = pkg.manifest.name || file.name.replace('.duckdaw', '');
  }

  await commitProjectLoad(project, {
    projectName,
    dirty: isLegacy,
    fileHandle: isLegacy ? null : handle,
    recentHandle: handle,
  });
  return true;
}

export async function confirmDiscardChanges(): Promise<boolean> {
  const state = useDAWStore.getState();
  if (!state.isDirty) return true;
  const result = await requestDecision({
    title: 'Discard unsaved changes?',
    message: 'Your current project has unsaved changes. This action cannot be undone.',
    options: [
      { id: 'cancel', label: 'Keep editing', kind: 'secondary' },
      { id: 'discard', label: 'Discard changes', kind: 'danger' },
    ],
  });
  return result?.choice === 'discard';
}

export async function createNewProject(): Promise<boolean> {
  if (!await confirmDiscardChanges()) return false;

  await commitExternalProjectLoad({
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
  }, {
    projectName: 'New Project',
    dirty: true,
  });
  return true;
}
