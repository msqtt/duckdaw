import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

export type PluginInspectorTarget =
  | { ownerType: 'track'; ownerId: string; kind: 'instrument' }
  | { ownerType: 'track' | 'bus'; ownerId: string; kind: 'effect'; pluginInstanceId: string };

interface PluginInspectorState {
  target: PluginInspectorTarget | null;
  width: number;
  maximized: boolean;
  open: (target: PluginInspectorTarget) => void;
  close: () => void;
  setWidth: (width: number, viewportWidth?: number) => void;
  setMaximized: (maximized: boolean) => void;
  reset: () => void;
}

const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 280;
const MAX_WIDTH = 720;

const clampWidth = (width: number, viewportWidth = typeof window === 'undefined' ? 1_280 : window.innerWidth) =>
  Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, viewportWidth - 320), Math.round(width)));

export const pluginInspectorStore = createStore<PluginInspectorState>(set => ({
  target: null,
  width: DEFAULT_WIDTH,
  maximized: false,
  open: target => set({ target }),
  close: () => set({ target: null, maximized: false }),
  setWidth: (width, viewportWidth) => set({ width: clampWidth(width, viewportWidth) }),
  setMaximized: maximized => set({ maximized }),
  reset: () => set({ target: null, width: DEFAULT_WIDTH, maximized: false }),
}));

export function usePluginInspectorStore(): PluginInspectorState;
export function usePluginInspectorStore<T>(selector: (state: PluginInspectorState) => T): T;
export function usePluginInspectorStore<T>(selector?: (state: PluginInspectorState) => T) {
  return selector ? useStore(pluginInspectorStore, selector) : useStore(pluginInspectorStore);
}
