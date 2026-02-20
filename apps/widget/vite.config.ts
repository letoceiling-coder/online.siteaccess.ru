import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'SiteAccessChat',
      fileName: () => 'widget.min.js',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
  },
});
