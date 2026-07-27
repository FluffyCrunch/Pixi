export default {
  server: {
    hmr: {
      protocol: 'ws',
      host: '127.0.0.1',
      port: 5173,
      clientPort: 5173,
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/pixi.js') ||
              id.includes('node_modules/@pixi')) {
            return 'pixi';
          }
        },
      },
    },
  },
};