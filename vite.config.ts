import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const base = env.VITE_BASE_PATH?.trim() || '/GOTEN-MEET/';

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
