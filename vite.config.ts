import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'icons/apple-touch-icon.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-512-maskable.png',
        'images/**/*',
      ],
      manifest: {
        name: 'ARTISAN',
        short_name: 'ARTISAN',
        description:
          'Indian artisan marketplace connecting customers with authentic handcrafted products and artisans.',
        theme_color: '#f4f1ea',
        background_color: '#f4f1ea',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'en',
        categories: ['shopping', 'lifestyle'],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell + hashed static assets. Do not precache secrets or API responses.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2}'],
        // Keep the installable shell lean; local STT/LLM workers are optional and large.
        globIgnores: ['**/ort-wasm*', '**/stt.worker*', '**/llm.worker*'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/supabase\//,
          /\/auth\/v1\//,
          /\/rest\/v1\//,
          /\/functions\/v1\//,
          /\/storage\/v1\//,
        ],
        runtimeCaching: [
          // Never cache Supabase Auth / REST / Edge Functions / Storage API traffic.
          {
            urlPattern: /^https:\/\/[^/]*supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
          // Photoroom / Gemini and related API hosts stay network-only.
          {
            urlPattern: /^https:\/\/[^/]*(photoroom\.com|generativelanguage\.googleapis\.com)\/.*/i,
            handler: 'NetworkOnly',
          },
          // Same-origin public images: safe to revalidate.
          {
            urlPattern: ({ request, sameOrigin }) => sameOrigin && request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'artisan-images',
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24 * 14,
              },
            },
          },
          // Fonts: long-lived cache.
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'artisan-fonts',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['lucide-react', '@huggingface/transformers'],
  },
  worker: {
    format: 'es',
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
});
