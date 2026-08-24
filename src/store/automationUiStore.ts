import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

interface AutomationUiState {
  activeLaneByTrack: Record<string, string>;
  activate: (trackId: string, laneId: string) => void;
  clearTrack: (trackId: string) => void;
  clear: () => void;
}

export const automationUiStore = createStore<AutomationUiState>()(set => ({
  activeLaneByTrack: {},
  activate: (trackId, laneId) => set(state => (
    state.activeLaneByTrack[trackId] === laneId
      ? state
      : { activeLaneByTrack: { ...state.activeLaneByTrack, [trackId]: laneId } }
  )),
  clearTrack: trackId => set(state => {
    if (!(trackId in state.activeLaneByTrack)) return state;
    const next = { ...state.activeLaneByTrack };
    delete next[trackId];
    return { activeLaneByTrack: next };
  }),
  clear: () => set(state => Object.keys(state.activeLaneByTrack).length === 0 ? state : { activeLaneByTrack: {} }),
}));

export function useAutomationUiStore<T>(selector: (state: AutomationUiState) => T): T {
  return useStore(automationUiStore, selector);
}
