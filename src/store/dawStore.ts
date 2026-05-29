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
  start: number; // in beats (global timeline)
  duration: number; // in beats
  originalDuration?: number; // max duration constraint
  type: TrackType;
  notes: Note[]; // for midi
  bufferUrl?: string; // for audio
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

interface DAWState {
  projectName: string;
  bpm: number;
  timeSignature: [number, number];
  theme: ThemeMode;
  isPlaying: boolean;
  isLooping: boolean;
  snapGridSize: number;
  snapToGrid: boolean;
  loopStart: number;
  loopEnd: number;
  metronomeOn: boolean;
  metronomeVolume: number;
  metronomeSound: 'cute' | 'click' | 'woodblock' | 'electronic';
  metronomeSubdivisions: number;
  masterVolume: number;
  tracks: Track[];
  clips: Clip[];
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
  loadProject: (data: Partial<DAWState>) => void;
  getProjectData: () => Partial<DAWState>;
  addTrack: (type: TrackType) => void;
  deleteTrack: (id: string) => void;
  reorderTrack: (id: string, index: number) => void;
  addClip: (trackId: string, start: number, bufferUrl?: string, duration?: number) => void;
  duplicateClip: (clipId: string) => void;
  deleteClip: (clipId: string) => void;
  selectTrack: (id: string | null) => void;
  selectClip: (id: string | null, multi?: boolean) => void;
  selectNote: (id: string | null, multi?: boolean) => void;
  setClipboard: (type: 'clips' | 'notes', items: any[]) => void;
  setLastNoteDuration: (duration: number) => void;
  updateTrack: (id: string, updates: Partial<Track>) => void;
  updateClip: (id: string, updates: Partial<Clip>) => void;
  addNote: (clipId: string, note: Note) => void;
  updateNote: (clipId: string, noteId: string, updates: Partial<Note>) => void;
  deleteNote: (clipId: string, noteId: string) => void;
  quantizeSelectedNotes: (clipId: string) => void;
  toggleRecording: () => void;
  toggleMicRecording: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);
const getRandomColor = () => {
    const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e'];
    return colors[Math.floor(Math.random() * colors.length)];
};

export const dawStore = createStore<DAWState>()(
  temporal(
    (set, get) => ({
      projectName: 'My DuckDAW Project',
      bpm: 120,
      timeSignature: [4, 4],
      zoom: 20,
      bottomPanel: null,
      panelHeight: 300,
      panelFullScreen: false,
      exportModalOpen: false,
      isDirty: false,
      lastNoteDuration: 0.5,
      theme: 'dark',
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
      toggleLoop: () => set((state) => ({ isLooping: !state.isLooping })),
      setLoopRegion: (start, end) => set({ loopStart: start, loopEnd: end }),
      toggleMetronome: () => set((state) => ({ metronomeOn: !state.metronomeOn })),
      setMetronomeVolume: (volume) => set({ metronomeVolume: volume }),
      setMetronomeSound: (sound) => set({ metronomeSound: sound }),
      setMetronomeSubdivisions: (subdivisions) => set({ metronomeSubdivisions: subdivisions }),
      setMasterVolume: (volume) => set({ masterVolume: volume }),
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
        
        return { theme: newTheme! };
      }),
      loadProject: (data) => set((state) => ({
        ...state,
        bpm: data.bpm || state.bpm,
        tracks: data.tracks || state.tracks,
        clips: data.clips || state.clips,
        isPlaying: false,
        selectedTrackId: null,
        selectedClipIds: [],
        exportModalOpen: false,
      })),
      getProjectData: () => {
        const state = get();
        return { bpm: state.bpm, tracks: state.tracks, clips: state.clips };
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
      deleteTrack: (id) => set((state) => ({
          tracks: state.tracks.filter(t => t.id !== id),
          clips: state.clips.filter(c => c.trackId !== id),
          selectedTrackId: state.selectedTrackId === id ? null : state.selectedTrackId,
          selectedClipIds: state.selectedClipIds.filter(cId => state.clips.find(c => c.id === cId)?.trackId !== id),
          isDirty: true
      })),
      reorderTrack: (id, index) => set((state) => {
        const track = state.tracks.find(t => t.id === id);
        if (!track) return state;
        const newTracks = state.tracks.filter(t => t.id !== id);
        newTracks.splice(index, 0, track);
        return { tracks: newTracks, isDirty: true };
      }),
      addClip: (trackId, start, bufferUrl, duration) => set((state) => {
        const track = state.tracks.find(t => t.id === trackId);
        if (!track) return state;
        const newClip: Clip = {
          id: generateId(),
          trackId,
          start,
          duration: duration || 16,
          originalDuration: duration,
          type: track.type,
          notes: [],
          color: track.color,
          bufferUrl
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
      deleteClip: (clipId) => set((state) => ({
          clips: state.clips.filter(c => c.id !== clipId),
          selectedClipIds: state.selectedClipIds.filter(id => id !== clipId),
          isDirty: true
      })),
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
      setClipboard: (type, items) => set((state) => {
         if (type === 'clips') return { clipboardClips: items, clipboardNotes: [] };
         return { clipboardNotes: items, clipboardClips: [] };
      }),
      updateTrack: (id, updates) => set((state) => ({
        tracks: state.tracks.map(t => t.id === id ? { ...t, ...updates } : t),
        isDirty: true
      })),
      updateClip: (id, updates) => set((state) => ({
        clips: state.clips.map(c => c.id === id ? { ...c, ...updates } : c),
        isDirty: true
      })),
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
      toggleMicRecording: () => set((state) => ({ isMicRecording: !state.isMicRecording, isPlaying: !state.isMicRecording ? true : state.isPlaying }))
    }),
    {
      partialize: (state) => {
        const { tracks, clips, bpm } = state;
        return { tracks, clips, bpm };
      },
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
