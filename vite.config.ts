import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __DUCKDAW_COMMIT__: JSON.stringify(process.env.COMMIT_REF ?? process.env.GITHUB_SHA ?? 'local'),
      __DUCKDAW_CONTEXT__: JSON.stringify(process.env.DUCKDAW_DEPLOY_ENV ?? process.env.CONTEXT ?? 'local'),
      __DUCKDAW_BRANCH__: JSON.stringify(process.env.BRANCH ?? process.env.GITHUB_REF_NAME ?? 'local'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('/node_modules/tone/')) return 'vendor-tone';
            if (id.includes('/node_modules/@ffmpeg/')) return 'vendor-ffmpeg';
            if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) return 'vendor-react';
            if (/\/src\/lib\/(automation|tempoMap|routingGraph|mixGraph)\.ts$/.test(id)) return 'daw-domain';
          },
        },
      },
    },
    test: {
      exclude: ['e2e/**', 'node_modules/**'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
