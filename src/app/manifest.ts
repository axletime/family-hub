import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Family Hub',
    short_name: 'Family Hub',
    description: 'Our family dashboard and media request portal',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0b1220',
    theme_color: '#1B4F8A',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Request something', url: '/request', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Discover', url: '/discover', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
