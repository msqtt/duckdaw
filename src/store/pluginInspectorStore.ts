import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

export type PluginInspectorTarget =
  | { ownerType: 'track'; ownerId: string; kind: 'instrument' }
  | { ownerType: 'track' | 'bus'; ownerId: string; kind: 'effect'; pluginInstanceId: string };

interface PluginInspectorState {
  target: PluginInspectorTarget | null;
  open: (target: PluginInspectorTarget) => void;
  close: () => void;
}

export const pluginInspectorStore = createStore<PluginInspectorState>(set => ({
  target: null,
  open: target => set({ target }),
  close: () => set({ target: null }),
}));

export function usePluginInspectorStore(): PluginInspectorState;
export function usePluginInspectorStore<T>(selector: (state: PluginInspectorState) => T): T;
export function usePluginInspectorStore<T>(selector?: (state: PluginInspectorState) => T) {
  return selector ? useStore(pluginInspectorStore, selector) : useStore(pluginInspectorStore);
}
