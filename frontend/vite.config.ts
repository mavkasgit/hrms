import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'history-fallback',
      configureServer(server) {
        return () => {
          server.middlewares.use((req, res, next) => {
            if (
              req.url &&
              !req.url.startsWith('/api/') &&
              !req.url.startsWith('/@') &&
              !req.url.startsWith('/node_modules/') &&
              !req.url.startsWith('/src/') &&
              !req.url.startsWith('/@fs/') &&
              !fs.existsSync(path.join(__dirname, req.url.split('?')[0]))
            ) {
              req.url = '/'
            }
            next()
          })
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // OnlyOffice proxy — mirrors nginx.conf routing for prod.
      //
      // DEV: Vite dev server serves frontend directly, so /web-apps/* requests
      //      go to Vite (localhost:5173) and must be proxied to OnlyOffice
      //      container at localhost:8085. Without this, the browser gets 404.
      //
      // DOCKER/PROD: nginx proxies /web-apps/* -> onlyoffice:80 automatically.
      //      Frontend is static files served through nginx, no Vite involved.
      //      These proxy rules are ignored in prod since Vite dev server isn't used.
      //
      '/web-apps': {
        target: 'http://localhost:8085',
        changeOrigin: true,
      },
      '/sdkjs': {
        target: 'http://localhost:8085',
        changeOrigin: true,
      },
      '/doc/': {
        target: 'http://localhost:8085',
        changeOrigin: true,
      },
      '/cache': {
        target: 'http://localhost:8085',
        changeOrigin: true,
      },
      '/coauthoring': {
        target: 'http://localhost:8085',
        changeOrigin: true,
        ws: true,
      },
      '/spellchecker': {
        target: 'http://localhost:8085',
        changeOrigin: true,
      },
      '/converter': {
        target: 'http://localhost:8085',
        changeOrigin: true,
      },
      '/healthcheck': {
        target: 'http://localhost:8085',
        changeOrigin: true,
      },
      // OnlyOffice versioned paths (e.g. /9.3.1-xxx/web-apps/...)
      '^/[0-9]+\\.[0-9]+\\.[^/]+/': {
        target: 'http://localhost:8085',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
