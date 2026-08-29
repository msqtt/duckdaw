export type TransportStatus = 'stopped' | 'playing' | 'paused';

export interface TransportControllerDependencies {
  getStatus: () => TransportStatus;
  setStatus: (status: TransportStatus) => void;
  isBusy: () => boolean;
  isContextRunning: () => boolean;
  initialize: () => Promise<void>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  stopSession: () => void;
}

export function createTransportController(dependencies: TransportControllerDependencies) {
  return {
    async togglePlayback(): Promise<TransportStatus> {
      if (dependencies.getStatus() === 'playing') {
        dependencies.pause();
        dependencies.setStatus('paused');
        return 'paused';
      }
      if (!dependencies.isContextRunning()) await dependencies.initialize();
      dependencies.play();
      dependencies.setStatus('playing');
      return 'playing';
    },

    stopPlayback(): boolean {
      const status = dependencies.getStatus();
      if (status === 'stopped' && !dependencies.isBusy()) return false;
      if (status !== 'stopped') dependencies.stop();
      dependencies.stopSession();
      dependencies.setStatus('stopped');
      return true;
    },
  };
}
