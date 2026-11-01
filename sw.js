// Service worker: guarda los archivos en caché para que el juego funcione sin conexión.
// Cambia la versión cada vez que publiques cambios para que los usuarios reciban la actualización.
const CACHE = 'oveja-v6';
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'config.js',
  'game.js',
  'manifest.json',
  'sprites/oveja-cuerpo.png',
  'sprites/oveja-pie-izq.png',
  'sprites/oveja-pie-der.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // El ranking mundial (Supabase) y otros dominios siempre van por red
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
