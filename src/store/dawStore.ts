import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { temporal } from 'zundo';

export type TrackType = 'midi' | 'audio';
export type InstrumentType = 'piano' | 'synth' | 'bass' | 'drum';
export type ThemeMode = 'dark' | 'light' | 'system';
export type BottomPanel = 'piano-roll' | 'mixer' | null;

export interface Note {
  id: string;
  note: string; // e.g., 'C4'
  start: number; // in beats based on transport
  duration: number; // in beats
  velocity: number; // 0-1
}

export interface Clip {
  id: string;
  name?: string;
  trackId: string;
  arrangementId: string;
  start: number; // in beats (global timeline)
  duration: number; // in beats
  originalDuration?: number; // max duration constraint
  type: TrackType;
  notes: Note[]; // for midi
  bufferUrl?: string; // for audio
  mimeType?: string; // original audio MIME for package restoration
  color?: string; // override track color
}

export interface EnvConfig {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  volume: number; // 0 to 1
  pan: number; // -1 to 1
  isMuted: boolean;
  isSolo: boolean;
  instrument?: InstrumentType; // for midi
  color: string;
  // new FX and synth props
  reverb: number; // 0-1 send
  delay: number; // 0-1 send
  env?: EnvConfig;
}

export interface Marker {
  id: string;
  name: string;
  position: number; // in beats
  color: string;
}

export interface Arrangement {
  id: string;
  name: string;
}

export type MetronomeSound = 'cute' | 'click' | 'woodblock' | 'electronic';

export interface PersistedProjectState {
  projectId: string;
  createdAt: string;
  projectName: string;
  markers: Marker[];
  arrangements: Arrangement[];
  activeArrangementId: string | null;
  bpm: number;
  timeSignature: [number, number];
  isLooping: boolean;
  loopStart: number;
  loopEnd: number;
  metronomeOn: boolean;
  metronomeVolume: number;
  metronomeSound: MetronomeSound;
  metronomeSubdivisions: number;
  masterVolume: number;
  tracks: Track[];
  clips: Clip[];
}

export interface DAWState extends PersistedProjectState {
  theme: ThemeMode;
  isPlaying: boolean;
  snapGridSize: number;
  snapToGrid: boolean;
  selectedTrackId: string | null;
  selectedClipIds: string[];
  selectedNoteIds: string[];
  clipboardClips: Clip[];
  clipboardNotes: Note[];
  isRecording: boolean;
  isMicRecording: boolean;
  bottomPanel: BottomPanel;
  panelHeight: number;
  panelFullScreen: boolean;
  exportModalOpen: boolean;
  zoom: number; // Pixels per beat
  lastNoteDuration: number;
  isDirty: boolean; // Unsaved changes
  
  // Actions
  setProjectName: (name: string) => void;
  setDirty: (dirty: boolean) => void;
  setBpm: (bpm: number) => void;
  setTimeSignature: (ts: [number, number]) => void;
  setZoom: (zoom: number) => void;
  setSnapGridSize: (size: number) => void;
  setSnapToGrid: (snap: boolean) => void;
  togglePlay: () => void;
  stop: () => void;
  toggleLoop: () => void;
  setLoopRegion: (start: number, end: number) => void;
  toggleMetronome: () => void;
  setMetronomeVolume: (volume: number) => void;
  setMetronomeSound: (sound: 'cute' | 'click' | 'woodblock' | 'electronic') => void;
  setMetronomeSubdivisions: (subdivisions: number) => void;
  setMasterVolume: (volume: number) => void;
  toggleTheme: (mode?: ThemeMode) => void;
  setBottomPanel: (panel: BottomPanel) => void;
  setPanelHeight: (height: number) => void;
  setPanelFullScreen: (fs: boolean) => void;
  setExportModalOpen: (open: boolean) => void;
  loadProject: (data: Partial<PersistedProjectState>) => void;
  getProjectData: () => PersistedProjectState;
  addTrack: (type: TrackType) => void;
  deleteTrack: (id: string) => void;
  reorderTrack: (id: string, index: number) => void;
  addClip: (trackId: string, start: number, bufferUrl?: string, duration?: number, mimeType?: string) => void;
  duplicateClip: (clipId: string) => void;
  deleteClip: (clipId: string) => void;
  selectTrack: (id: string | null) => void;
  selectClip: (id: string | null, multi?: boolean) => void;
  selectNote: (id: string | null, multi?: boolean) => void;
  setClipboard: (type: 'clips' | 'notes', items: any[]) => void;
  pasteClips: (startBeat: number, targetTrackId?: string) => void;
  setLastNoteDuration: (duration: number) => void;
  updateTrack: (id: string, updates: Partial<Track>) => void;
  updateClip: (id: string, updates: Partial<Clip>) => void;
  addNote: (clipId: string, note: Note) => void;
  updateNote: (clipId: string, noteId: string, updates: Partial<Note>) => void;
  deleteNote: (clipId: string, noteId: string) => void;
  quantizeSelectedNotes: (clipId: string) => void;
  toggleRecording: () => void;
  commitMidiRecording: (trackId: string, start: number, duration: number, notes: Note[]) => void;
  toggleMicRecording: () => void;

  // Markers & Arrangements
  addMarker: (position: number, name?: string) => void;
  updateMarker: (id: string, updates: Partial<Marker>) => void;
  deleteMarker: (id: string) => void;
  setArrangement: (id: string) => void;
  addArrangement: (name: string, copyCurrent?: boolean) => void;
  deleteArrangement: (id: string) => void;
}

const getInitialTheme = (): ThemeMode => {
  if (typeof localStorage === 'undefined') return 'dark';
  const stored = localStorage.getItem('duckdaw_theme');
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
};

const revokeUnusedBlobUrls = (previous: Clip[], retained: Clip[]) => {
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
  const retainedUrls = new Set(retained.map(clip => clip.bufferUrl).filter(Boolean));
  for (const clip of previous) {
    if (clip.bufferUrl?.startsWith('blob:') && !retainedUrls.has(clip.bufferUrl)) {
      URL.revokeObjectURL(clip.bufferUrl);
    }
  }
};

const generateId = () => Math.random().toString(36).substring(2, 9);
const getRandomColor = () => {
    const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e'];
    return colors[Math.floor(Math.random() * colors.length)];
};

export const dawStore = createStore<DAWState>()(
  temporal(
    (set, get) => ({
      projectId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      projectName: 'My DuckDAW Project',
      markers: [],
      arrangements: [{ id: 'main', name: 'Main Arrangement' }],
      activeArrangementId: 'main',
      bpm: 120,
      timeSignature: [4, 4],
      zoom: 20,
      bottomPanel: null,
      panelHeight: 300,
      panelFullScreen: false,
      exportModalOpen: false,
      isDirty: false,
      lastNoteDuration: 0.5,
      theme: getInitialTheme(),
      isPlaying: false,
      isLooping: false,
      snapGridSize: 0.25,
      snapToGrid: true,
      loopStart: 0,
      loopEnd: 16,
      metronomeOn: false,
      metronomeVolume: 0.8,
      metronomeSound: 'cute',
      metronomeSubdivisions: 1,
      masterVolume: 0.8,
      isRecording: false,
      isMicRecording: false,
      selectedClipIds: ['clip-1'],
      selectedNoteIds: [],
      clipboardClips: [],
      clipboardNotes: [],
      tracks: [
        {
          id: 'track-1',
          name: 'Synth Melody',
          type: 'midi',
          volume: 0.8,
          pan: 0,
          isMuted: false,
          isSolo: false,
          instrument: 'synth',
          color: '#0ea5e9', // sky-500
          reverb: 0.2,
          delay: 0,
          env: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.5 }
        },
        {
          id: 'track-2',
          name: 'Bass',
          type: 'midi',
          volume: 0.9,
          pan: 0,
          isMuted: false,
          isSolo: false,
          instrument: 'bass',
          color: '#ef4444', // red-500
          reverb: 0,
          delay: 0,
          env: { attack: 0.05, decay: 0.3, sustain: 0.2, release: 1 }
        },
        {
          id: 'track-3',
          name: 'Drums',
          type: 'midi',
          volume: 1.0,
          pan: 0,
          isMuted: false,
          isSolo: false,
          instrument: 'drum',
          color: '#f59e0b', // amber-500
          reverb: 0.1,
          delay: 0
        }
      ],
      clips: [
        {
          id: 'clip-1',
          trackId: 'track-1',
          arrangementId: 'main',
          start: 0,
          duration: 16,
          type: 'midi',
          color: '#0ea5e9',
          notes: [
            { id: 'n1', note: 'C4', start: 0, duration: 1, velocity: 0.8 },
            { id: 'n2', note: 'E4', start: 1, duration: 1, velocity: 0.8 },
            { id: 'n3', note: 'G4', start: 2, duration: 1, velocity: 0.8 },
            { id: 'n4', note: 'B4', start: 3, duration: 1, velocity: 0.8 },
            { id: 'n5', note: 'A4', start: 4, duration: 1, velocity: 0.8 },
            { id: 'n6', note: 'C5', start: 5, duration: 1, velocity: 0.8 },
            { id: 'n7', note: 'F4', start: 6, duration: 2, velocity: 0.8 },
          ]
        },
        {
          id: 'clip-2',
          trackId: 'track-2',
          arrangementId: 'main',
          start: 0,
          duration: 16,
          type: 'midi',
          color: '#ef4444',
          notes: [
            { id: 'b1', note: 'C2', start: 0, duration: 4, velocity: 1.0 },
            { id: 'b2', note: 'A1', start: 4, duration: 2, velocity: 1.0 },
            { id: 'b3', note: 'F1', start: 6, duration: 2, velocity: 1.0 },
          ]
        },
        {
          id: 'clip-3',
          trackId: 'track-3',
          arrangementId: 'main',
          start: 0,
          duration: 16,
          type: 'midi',
          color: '#f59e0b',
          notes: [
            { id: 'd1', note: 'C2', start: 0, duration: 0.5, velocity: 1 },
            { id: 'd2', note: 'D2', start: 1, duration: 0.5, velocity: 1 },
            { id: 'd3', note: 'C2', start: 2, duration: 0.5, velocity: 1 },
            { id: 'd4', note: 'C2', start: 2.5, duration: 0.5, velocity: 1 },
            { id: 'd5', note: 'D2', start: 3, duration: 0.5, velocity: 1 },
            { id: 'd6', note: 'C2', start: 4, duration: 0.5, velocity: 1 },
            { id: 'd7', note: 'D2', start: 5, duration: 0.5, velocity: 1 },
            { id: 'd8', note: 'C2', start: 6, duration: 0.5, velocity: 1 },
            { id: 'd9', note: 'D2', start: 7, duration: 0.5, velocity: 1 },
          ]
        }
      ],
      selectedTrackId: 'track-1',
      
      setProjectName: (name) => set({ projectName: name, isDirty: true }),
      setDirty: (dirty) => set({ isDirty: dirty }),

      setBpm: (bpm) => set({ bpm, isDirty: true }),
      setTimeSignature: (ts) => set({ timeSignature: ts, isDirty: true }),
      setZoom: (zoom) => set({ zoom }),
      setSnapGridSize: (size) => set({ snapGridSize: size }),
      setSnapToGrid: (snap) => set({ snapToGrid: snap }),
      setBottomPanel: (panel) => set({ bottomPanel: panel }),
      setPanelHeight: (height) => set({ panelHeight: height }),
      setPanelFullScreen: (fs) => set({ panelFullScreen: fs }),
      setExportModalOpen: (open) => set({ exportModalOpen: open }),
      setLastNoteDuration: (duration) => set({ lastNoteDuration: duration }),
      toggleLoop: () => set((state) => ({ isLooping: !state.isLooping, isDirty: true })),
      setLoopRegion: (start, end) => set({ loopStart: start, loopEnd: end, isDirty: true }),
      toggleMetronome: () => set((state) => ({ metronomeOn: !state.metronomeOn, isDirty: true })),
      setMetronomeVolume: (volume) => set({ metronomeVolume: volume, isDirty: true }),
      setMetronomeSound: (sound) => set({ metronomeSound: sound, isDirty: true }),
      setMetronomeSubdivisions: (subdivisions) => set({ metronomeSubdivisions: subdivisions, isDirty: true }),
      setMasterVolume: (volume) => set({ masterVolume: volume, isDirty: true }),
      toggleTheme: (mode) => set((state) => {
        let newTheme = mode;
        if (!newTheme) {
          if (state.theme === 'system') newTheme = 'dark';
          else if (state.theme === 'dark') newTheme = 'light';
          else newTheme = 'system';
        }
        
        const root = document.documentElement;
        root.classList.remove('dark', 'light');
        if (newTheme === 'system') {
          if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            root.classList.add('dark');
          }
        } else if (newTheme === 'dark') {
          root.classList.add('dark');
        }
        
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('duckdaw_theme', newTheme!);
        }
        return { theme: newTheme! };
      }),
      loadProject: (data) => set((state) => {
        const arrangements = data.arrangements?.length
          ? data.arrangements
          : [{ id: 'main', name: 'Main Arrangement' }];
        const activeArrangementId = data.activeArrangementId != null
          && arrangements.some(arrangement => arrangement.id === data.activeArrangementId)
          ? data.activeArrangementId
          : arrangements[0].id;
        const clips = (data.clips ?? []).map(clip => ({
          ...clip,
          arrangementId: clip.arrangementId ?? activeArrangementId,
        }));
        revokeUnusedBlobUrls([...state.clips, ...state.clipboardClips], clips);

        return {
          projectId: data.projectId ?? crypto.randomUUID(),
          createdAt: data.createdAt ?? new Date().toISOString(),
          projectName: data.projectName ?? 'New Project',
          bpm: data.bpm ?? 120,
          timeSignature: data.timeSignature ?? [4, 4],
          isLooping: data.isLooping ?? false,
          loopStart: data.loopStart ?? 0,
          loopEnd: data.loopEnd ?? 16,
          metronomeOn: data.metronomeOn ?? false,
          metronomeVolume: data.metronomeVolume ?? 0.8,
          metronomeSound: data.metronomeSound ?? 'cute',
          metronomeSubdivisions: data.metronomeSubdivisions ?? 1,
          masterVolume: data.masterVolume ?? 0.8,
          tracks: data.tracks ?? [],
          clips,
          markers: data.markers ?? [],
          arrangements,
          activeArrangementId,
          isPlaying: false,
          isRecording: false,
          isMicRecording: false,
          selectedTrackId: null,
          selectedClipIds: [],
          selectedNoteIds: [],
          clipboardClips: [],
          clipboardNotes: [],
          exportModalOpen: false,
          isDirty: false,
        };
      }),
      getProjectData: () => {
        const state = get();
        return {
          projectId: state.projectId,
          createdAt: state.createdAt,
          projectName: state.projectName,
          bpm: state.bpm,
          timeSignature: state.timeSignature,
          isLooping: state.isLooping,
          loopStart: state.loopStart,
          loopEnd: state.loopEnd,
          metronomeOn: state.metronomeOn,
          metronomeVolume: state.metronomeVolume,
          metronomeSound: state.metronomeSound,
          metronomeSubdivisions: state.metronomeSubdivisions,
          masterVolume: state.masterVolume,
          tracks: state.tracks,
          clips: state.clips,
          markers: state.markers,
          arrangements: state.arrangements,
          activeArrangementId: state.activeArrangementId,
        };
      },
      togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
      stop: () => set({ isPlaying: false, isRecording: false, isMicRecording: false }),
      addTrack: (type) => set((state) => {
        const newTrack: Track = {
          id: generateId(),
          name: `${type === 'midi' ? 'Inst' : 'Audio'} ${state.tracks.length + 1}`,
          type,
          volume: 0.8,
          pan: 0,
          isMuted: false,
          isSolo: false,
          instrument: type === 'midi' ? 'synth' : undefined,
          color: getRandomColor(),
          reverb: 0,
          delay: 0,
          env: type === 'midi' ? { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.5 } : undefined
        };
        return { tracks: [...state.tracks, newTrack], selectedTrackId: newTrack.id, isDirty: true };
      }),
      deleteTrack: (id) => set((state) => {
          const clips = state.clips.filter(clip => clip.trackId !== id);
          revokeUnusedBlobUrls(state.clips, [...clips, ...state.clipboardClips]);
          return {
            tracks: state.tracks.filter(track => track.id !== id),
            clips,
            selectedTrackId: state.selectedTrackId === id ? null : state.selectedTrackId,
            selectedClipIds: state.selectedClipIds.filter(clipId => state.clips.find(clip => clip.id === clipId)?.trackId !== id),
            isDirty: true
          };
      }),
      reorderTrack: (id, index) => set((state) => {
        const track = state.tracks.find(t => t.id === id);
        if (!track) return state;
        const newTracks = state.tracks.filter(t => t.id !== id);
        newTracks.splice(index, 0, track);
        return { tracks: newTracks, isDirty: true };
      }),
      addClip: (trackId, start, bufferUrl, duration, mimeType) => set((state) => {
        const track = state.tracks.find(t => t.id === trackId);
        if (!track) return state;
        const newClip: Clip = {
          id: generateId(),
          trackId,
          arrangementId: state.activeArrangementId ?? state.arrangements[0]?.id ?? 'main',
          start,
          duration: duration || 16,
          originalDuration: duration,
          type: track.type,
          notes: [],
          color: track.color,
          bufferUrl,
          mimeType
        };
        return { clips: [...state.clips, newClip], selectedClipIds: [newClip.id], isDirty: true };
      }),
      duplicateClip: (clipId) => set((state) => {
        const clip = state.clips.find(c => c.id === clipId);
        if (!clip) return state;
        const newClip: Clip = {
          ...clip,
          id: generateId(),
          start: clip.start + clip.duration
        };
        if (clip.notes) {
          newClip.notes = clip.notes.map(n => ({ ...n, id: generateId() }));
        }
        return { clips: [...state.clips, newClip], selectedClipIds: [newClip.id], isDirty: true };
      }),
      deleteClip: (clipId) => set((state) => {
          const clips = state.clips.filter(clip => clip.id !== clipId);
          revokeUnusedBlobUrls(state.clips, [...clips, ...state.clipboardClips]);
          return {
            clips,
            selectedClipIds: state.selectedClipIds.filter(id => id !== clipId),
            isDirty: true
          };
      }),
      selectTrack: (id) => set({ selectedTrackId: id }),
      selectClip: (id, multi = false) => set((state) => {
        if (!id) return { selectedClipIds: [] };
        if (multi) {
          if (state.selectedClipIds.includes(id)) {
            return { selectedClipIds: state.selectedClipIds.filter(c => c !== id) };
          }
          return { selectedClipIds: [...state.selectedClipIds, id] };
        }
        const clip = state.clips.find(c => c.id === id);
        if (clip) {
           return { selectedClipIds: [id], selectedTrackId: clip.trackId };
        }
        return { selectedClipIds: [id] };
      }),
      selectNote: (id, multi = false) => set((state) => {
        if (!id) return { selectedNoteIds: [] };
        if (multi) {
          if (state.selectedNoteIds.includes(id)) {
            return { selectedNoteIds: state.selectedNoteIds.filter(n => n !== id) };
          }
          return { selectedNoteIds: [...state.selectedNoteIds, id] };
        }
        return { selectedNoteIds: [id] };
      }),
      setClipboard: (type, items) => set(() => {
         if (type === 'clips') return { clipboardClips: items.map(item => structuredClone(item)), clipboardNotes: [] };
         return { clipboardNotes: items.map(item => structuredClone(item)), clipboardClips: [] };
      }),
      pasteClips: (startBeat, targetTrackId) => set((state) => {
        if (state.clipboardClips.length === 0) return state;
        const earliestStart = Math.min(...state.clipboardClips.map(clip => clip.start));
        const pasted = state.clipboardClips.flatMap(source => {
          const destinationTrackId = targetTrackId ?? source.trackId;
          const destinationTrack = state.tracks.find(track => track.id === destinationTrackId);
          if (!destinationTrack || destinationTrack.type !== source.type) return [];
          return [{
            ...structuredClone(source),
            id: generateId(),
            trackId: destinationTrackId,
            arrangementId: state.activeArrangementId ?? state.arrangements[0]?.id ?? 'main',
            start: Math.max(0, startBeat + source.start - earliestStart),
            notes: source.notes.map(note => ({ ...note, id: generateId() })),
          }];
        });
        if (pasted.length === 0) return state;
        return {
          clips: [...state.clips, ...pasted],
          selectedClipIds: pasted.map(clip => clip.id),
          isDirty: true,
        };
      }),
      updateTrack: (id, updates) => set((state) => ({
        tracks: state.tracks.map(t => t.id === id ? { ...t, ...updates } : t),
        isDirty: true
      })),
      updateClip: (id, updates) => set((state) => {
        const clip = state.clips.find(candidate => candidate.id === id);
        if (!clip) return state;
        if (updates.trackId != null) {
          const targetTrack = state.tracks.find(track => track.id === updates.trackId);
          if (!targetTrack || targetTrack.type !== clip.type) return state;
        }
        return {
          clips: state.clips.map(candidate => candidate.id === id ? { ...candidate, ...updates } : candidate),
          isDirty: true
        };
      }),
      addNote: (clipId, note) => set((state) => ({
        clips: state.clips.map(c => c.id === clipId ? { ...c, notes: [...(c.notes || []), note] } : c),
        isDirty: true
      })),
      updateNote: (clipId, noteId, updates) => set((state) => ({
        clips: state.clips.map(c => {
          if (c.id === clipId) {
            return {
              ...c,
              notes: c.notes?.map(n => n.id === noteId ? { ...n, ...updates } : n)
            };
          }
          return c;
        }),
        isDirty: true
      })),
      quantizeSelectedNotes: (clipId) => set((state) => {
        const snap = state.snapToGrid ? state.snapGridSize : 0;
        if (snap === 0 || state.selectedNoteIds.length === 0) return state;
        
        return {
          clips: state.clips.map(c => {
            if (c.id === clipId && c.notes) {
              return {
                ...c,
                notes: c.notes.map(n => {
                  if (state.selectedNoteIds.includes(n.id)) {
                    const diff = n.start % snap;
                    const closestStart = diff >= snap / 2 ? n.start + (snap - diff) : n.start - diff;
                    return { ...n, start: Math.max(0, closestStart) };
                  }
                  return n;
                })
              };
            }
            return c;
          }),
          isDirty: true
        };
      }),
      deleteNote: (clipId, noteId) => set((state) => ({
        clips: state.clips.map(c => {
          if (c.id === clipId) {
            return { ...c, notes: c.notes?.filter(n => n.id !== noteId) };
          }
          return c;
        }),
        isDirty: true
      })),
      toggleRecording: () => set((state) => ({ isRecording: !state.isRecording, isPlaying: !state.isRecording ? true : state.isPlaying })),
      commitMidiRecording: (trackId, start, duration, notes) => set((state) => {
        const track = state.tracks.find(candidate => candidate.id === trackId);
        if (!track || track.type !== 'midi' || notes.length === 0) return state;
        const clip: Clip = {
          id: generateId(),
          trackId,
          arrangementId: state.activeArrangementId ?? state.arrangements[0]?.id ?? 'main',
          start: Math.max(0, start),
          duration: Math.max(duration, ...notes.map(note => note.start + note.duration)),
          type: 'midi',
          notes: notes.map(note => ({ ...note, id: generateId() })),
          color: track.color,
          name: 'MIDI Recording',
        };
        return {
          clips: [...state.clips, clip],
          selectedClipIds: [clip.id],
          isDirty: true,
        };
      }),
      toggleMicRecording: () => set((state) => ({ isMicRecording: !state.isMicRecording, isPlaying: !state.isMicRecording ? true : state.isPlaying })),
      
      addMarker: (position, name = 'Marker') => set((state) => ({
        markers: [...state.markers, { id: generateId(), name, position, color: getRandomColor() }],
        isDirty: true
      })),
      updateMarker: (id, updates) => set((state) => ({
        markers: state.markers.map(m => m.id === id ? { ...m, ...updates } : m),
        isDirty: true
      })),
      deleteMarker: (id) => set((state) => ({
        markers: state.markers.filter(m => m.id !== id),
        isDirty: true
      })),
      addArrangement: (name, copyCurrent = false) => set((state) => {
        const arrangement = { id: generateId(), name };
        const copiedClips = copyCurrent
          ? state.clips
              .filter(clip => clip.arrangementId === state.activeArrangementId)
              .map(clip => ({
                ...structuredClone(clip),
                id: generateId(),
                arrangementId: arrangement.id,
                notes: clip.notes.map(note => ({ ...note, id: generateId() })),
              }))
          : [];
        return {
          arrangements: [...state.arrangements, arrangement],
          clips: [...state.clips, ...copiedClips],
          activeArrangementId: arrangement.id,
          selectedClipIds: [],
          isDirty: true,
        };
      }),
      deleteArrangement: (id) => set((state) => {
        if (state.arrangements.length <= 1) return state;
        const arrangements = state.arrangements.filter(arrangement => arrangement.id !== id);
        if (arrangements.length === state.arrangements.length) return state;
        const activeArrangementId = state.activeArrangementId === id
          ? arrangements[0].id
          : state.activeArrangementId;
        const clips = state.clips.filter(clip => clip.arrangementId !== id);
        revokeUnusedBlobUrls(state.clips, [...clips, ...state.clipboardClips]);
        return {
          arrangements,
          clips,
          activeArrangementId,
          selectedClipIds: [],
          isDirty: true,
        };
      }),
      setArrangement: (id) => set((state) => state.arrangements.some(arrangement => arrangement.id === id)
        ? { activeArrangementId: id, selectedClipIds: [], isDirty: true }
        : state)
    }),
    {
      partialize: (state) => ({
        projectName: state.projectName,
        bpm: state.bpm,
        timeSignature: state.timeSignature,
        isLooping: state.isLooping,
        loopStart: state.loopStart,
        loopEnd: state.loopEnd,
        metronomeOn: state.metronomeOn,
        metronomeVolume: state.metronomeVolume,
        metronomeSound: state.metronomeSound,
        metronomeSubdivisions: state.metronomeSubdivisions,
        masterVolume: state.masterVolume,
        tracks: state.tracks,
        clips: state.clips,
        markers: state.markers,
        arrangements: state.arrangements,
        activeArrangementId: state.activeArrangementId,
      }),
    }
  )
);

export function useDAWStore(): DAWState;
export function useDAWStore<T>(selector: (state: DAWState) => T): T;
export function useDAWStore<T>(selector?: (state: DAWState) => T) {
  return selector ? useStore(dawStore, selector) : useStore(dawStore);
}

// Expose getState for non-React code that imports useDAWStore.getState
useDAWStore.getState = dawStore.getState;
useDAWStore.setState = dawStore.setState;

export function useTemporalStore(): import('zundo').TemporalState<any>;
export function useTemporalStore<T>(selector: (state: import('zundo').TemporalState<any>) => T): T;
export function useTemporalStore<T>(selector?: (state: import('zundo').TemporalState<any>) => T) {
  return selector ? useStore(dawStore.temporal, selector) : useStore(dawStore.temporal);
}
