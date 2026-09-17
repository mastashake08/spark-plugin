import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Aliases point at the built dist/ output so example code imports
// 'spark-mls-client' exactly like a real consumer would (run `npm run build`
// first). This is dev tooling only — not part of the published package.
//
// The examples call a real backend (spark-api-micro, or any backend built
// the same way) via SparkProxyClient — see examples/web/*-app.js. That
// backend holds the actual Spark access token server-side; this project
// never touches it. VITE_SPARK_API_BASE_URL is just a URL, not a secret, so
// it's fine to expose to the client bundle.
export default defineConfig({
  root: 'examples/web',
  envDir: __dirname,
  resolve: {
    alias: [
      { find: 'spark-mls-client/react', replacement: resolve(__dirname, 'dist/react/index.js') },
      { find: 'spark-mls-client/vue', replacement: resolve(__dirname, 'dist/vue/index.js') },
      { find: 'spark-mls-client/vanilla', replacement: resolve(__dirname, 'dist/vanilla/index.js') },
      { find: 'spark-mls-client', replacement: resolve(__dirname, 'dist/index.js') },
    ],
  },
  server: { port: 5173 },
});
