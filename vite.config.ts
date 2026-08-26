import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // Cloudflare Pages serves from the domain root (goten-meet.pages.dev).
  // A non-root base like `/GOTEN-MEET/` makes index.html request assets under
  // that prefix; Pages then SPA-fallbacks those paths to HTML and the app
  // white-screens because the module script never executes.
  const fromEnv = env.VITE_BASE_PATH?.trim();
  const base = fromEnv && fromEnv.length > 0 ? fromEnv : '/';

  return {
    plugins: [react()],
    base,
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', (_err, _req, res) => {
              const response = res as
                | { writableEnded?: boolean; writeHead: Function; end: Function }
                | undefined;
              if (!response || response.writableEnded) return;
              response.writeHead(502, { 'Content-Type': 'application/json' });
              response.end(
                JSON.stringify({
                  error: {
                    code: 'PROXY_ERROR',
                    message: 'Token API is unavailable',
                  },
                }),
              );
            });
          },
        },
      },
    },
  };
});
