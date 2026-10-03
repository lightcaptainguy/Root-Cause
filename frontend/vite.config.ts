import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => {
  // Reject production builds configured for fixture mode
  if (command === 'build' && process.env.VITE_DATA_MODE === 'fixture') {
    throw new Error(
      'Production build rejected: VITE_DATA_MODE=fixture is not allowed for production builds. ' +
      'Use VITE_DATA_MODE=live for production, or use a separate fixture-demo build.',
    );
  }

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});
