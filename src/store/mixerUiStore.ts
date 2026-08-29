import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

interface MixerUiState {
  routingOpen: boolean;
  routingExpanded: boolean;
  routingZoom: number;
  trackWidths: Record<string, number>;
  toggleRouting: () => void;
  closeRouting: () => void;
  setRoutingExpanded: (expanded: boolean) => void;
  setRoutingZoom: (zoom: number) => void;
  setTrackWidth: (trackId: string, width: number) => void;
  removeTrackWidth: (trackId: string) => void;
  reset: () => void;
}

const initialState = {
  routingOpen: false,
  routingExpanded: false,
  routingZoom: 1,
  trackWidths: {},
};

export const mixerUiStore = createStore<MixerUiState>(set => ({
  ...initialState,
  toggleRouting: () => set(state => ({
    routingOpen: !state.routingOpen,
    routingExpanded: state.routingOpen ? false : state.routingExpanded,
  })),
  closeRouting: () => set({ routingOpen: false, routingExpanded: false }),
  setRoutingExpanded: routingExpanded => set({ routingExpanded }),
  setRoutingZoom: routingZoom => set({ routingZoom: Math.max(0.7, Math.min(1.5, routingZoom)) }),
  setTrackWidth: (trackId, width) => set(state => ({
    trackWidths: { ...state.trackWidths, [trackId]: Math.max(128, Math.min(320, Math.round(width))) },
  })),
  removeTrackWidth: trackId => set(state => {
    const trackWidths = { ...state.trackWidths };
    delete trackWidths[trackId];
    return { trackWidths };
  }),
  reset: () => set({ ...initialState, trackWidths: {} }),
}));

export function useMixerUiStore(): MixerUiState;
export function useMixerUiStore<T>(selector: (state: MixerUiState) => T): T;
export function useMixerUiStore<T>(selector?: (state: MixerUiState) => T) {
  return selector ? useStore(mixerUiStore, selector) : useStore(mixerUiStore);
}
