import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      '@nivo/line',
      '@nivo/core',
      'd3-shape',
      'd3-scale',
      'd3-array',
      'd3-interpolate',
      'd3-color',
      'd3-path'
    ]
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true
    }
  }
});