export default {
  server: {
    host: 'localhost',
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/@babylonjs')) return 'babylon';
        },
      },
    },
  },
};
