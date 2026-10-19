import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['hero-barbershop.svg', 'barberos-icon.svg'],
    manifest: {
      name: 'BarberOS', short_name: 'BarberOS', start_url: '/', scope: '/', display: 'standalone',
      background_color: '#090909', theme_color: '#090909', lang: 'pt-MZ',
      icons: [{ src: '/barberos-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
    },
    workbox: {
      navigateFallback: '/index.html',
      globPatterns: ['**/*.{js,css,html,svg,woff2,avif,webp}'],
      runtimeCaching: [{
        urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/'),
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'shop-media', expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 14 } },
      }],
    },
  })],
  envPrefix: ['VITE_'],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: true,
    hmr: { clientPort: 443 },
  },
  preview: { host: '0.0.0.0', port: 3000 },
  build: {
    manifest: '.vite/manifest.json',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/.test(id)) return 'framework';
          if (id.includes('/@supabase/')) return 'supabase';
          if (id.includes('/@tanstack/')) return 'query';
          if (id.includes('/framer-motion/')) return 'motion';
          if (id.includes('/lucide-react/')) return 'icons';
          return undefined;
        },
      },
    },
  },
});
