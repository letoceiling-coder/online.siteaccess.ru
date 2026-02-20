import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'SiteAccessChat',
      fileName: (format) => siteaccess-chat..js,
      formats: ['umd', 'es'],
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
      },
    },
  },
  server: {
    port: 5174,
  },
});
