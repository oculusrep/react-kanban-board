import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      '@nivo/line',
      '@nivo/core',
      '@nivo/axes',
      '@nivo/scales',
      '@nivo/colors',
      '@nivo/legends',
      '@nivo/tooltip',
      '@nivo/voronoi',
      '@nivo/annotations',
      '@react-spring/web',
      'd3-shape',
      'd3-path',
      'd3-scale',
      'd3-time-format',
      'd3-format',
      'd3-interpolate',
      'd3-color'
    ]
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true
    },
rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@nivo') || id.includes('@react-spring') || id.includes('d3-')) {
            return 'charts';
          }
        }
      }
    }
  }
});
