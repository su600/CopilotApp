import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    proxy: {
      // Proxy GitHub OAuth Device Flow endpoints to avoid CORS errors in the browser.
      // github.com/login does not send CORS headers, so requests must originate server-side.
      '/github-login/': {
        target: 'https://github.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/github-login(\/|$)/, '/login$1'),
      },
      // Proxy only the specific GitHub Copilot internal token endpoint to avoid CORS errors.
      // Matches exactly /github-api/copilot_internal/v2/token to mirror the nginx production config.
      '^/github-api/copilot_internal/v2/token$': {
        target: 'https://api.github.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/github-api/, ''),
      },
      // Proxy Copilot subscription endpoint for quota/plan data.
      '^/github-api/copilot_internal/v2/subscription$': {
        target: 'https://api.github.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/github-api/, ''),
      },
      // Proxy GitHub billing API (premium request usage) for quota reporting.
      // [^/]+ matches any GitHub username (one or more non-slash characters).
      // Restricted to the specific premium_request/usage endpoint to mirror the nginx config.
      '^/github-api/users/[^/]+/settings/billing/premium_request/usage$': {
        target: 'https://api.github.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/github-api/, ''),
      },
      // Proxy Copilot API requests to avoid CORS errors in the browser.
      '/copilot-api/': {
        target: 'https://api.githubcopilot.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/copilot-api/, ''),
      },
      // Proxy Brave Search API requests to avoid CORS errors in the browser.
      '^/brave-search$': {
        target: 'https://api.search.brave.com',
        changeOrigin: true,
        rewrite: () => '/res/v1/web/search',
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg', 'icons/*.png'],
      manifest: {
        id: '/',
        name: 'Copilot Playground',
        short_name: 'CopilotApp',
        description: 'Test and compare GitHub Copilot models via the API',
        lang: 'en',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['developer-tools', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.githubcopilot\.com\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/api\.github\.com\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
