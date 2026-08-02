import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  build: {
    sourcemap: false,
    minify: 'esbuild',
    esbuild: {
      drop: ['debugger'],
      pure: ['console.log'],
    },
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            const directories = id.toString().split('node_modules/')[1].split('/');
            let pkg = directories[0];
            if (pkg.startsWith('@')) {
              pkg = `${pkg}/${directories[1]}`;
            }
            return pkg.replace('/', '_');
          }
        }
      }
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
  },
})
