import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Spark's own docs explicitly forbid sending the access token to a browser,
 * and the API has no CORS support — a direct browser -> sparkapi.com fetch
 * fails outright. This plugin stands in for "your backend": it holds the
 * token server-side (via loadEnv below, never sent to the client) and
 * exposes a same-origin `/api/listings` route the browser examples call
 * instead. This is the same pattern you'd implement in your real backend.
 */
function sparkApiProxy(env: Record<string, string>): Plugin {
  return {
    name: 'spark-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/listings', async (_req, res) => {
        try {
          const { SparkClient } = await import(pathToFileURL(resolve(__dirname, 'dist/index.js')).href);
          const client = new SparkClient({
            accessToken: env.SPARK_ACCESS_TOKEN,
            userAgent: env.SPARK_USER_AGENT || 'spark-mls-client web example/1.0',
          });
          const data = await client.listings.search({ filter: "StandardStatus Eq 'Active'", limit: 12 });
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
        } catch (err: any) {
          res.statusCode = typeof err?.status === 'number' && err.status >= 400 ? err.status : 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err?.message ?? String(err) }));
        }
      });
    },
  };
}

// Aliases point at the built dist/ output so example code imports
// 'spark-mls-client' exactly like a real consumer would (run `npm run build`
// first). This is dev tooling only — not part of the published package.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');

  return {
    root: 'examples/web',
    resolve: {
      alias: [
        { find: 'spark-mls-client/react', replacement: resolve(__dirname, 'dist/react/index.js') },
        { find: 'spark-mls-client/vue', replacement: resolve(__dirname, 'dist/vue/index.js') },
        { find: 'spark-mls-client/vanilla', replacement: resolve(__dirname, 'dist/vanilla/index.js') },
        { find: 'spark-mls-client', replacement: resolve(__dirname, 'dist/index.js') },
      ],
    },
    plugins: [sparkApiProxy(env)],
    server: { port: 5173 },
  };
});
