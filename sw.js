// Service worker: guarda los archivos en caché para que el juego funcione sin conexión.
// Usa primero la red, así que los cambios publicados llegan sin esperar. Sube la versión si cambias la lista de archivos.
const CACHE = 'sheepy-v18';
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'config.js',
  'game.js',
  'manifest.json',
  'sprites/inicio-cuerpo.webp',
  'sprites/inicio-brazo.webp',
  'sprites/inicio-chispas.webp',
  'sprites/oveja-cuerpo.png',
  'sprites/oveja-pie-izq.png',
  'sprites/oveja-pie-der.png',
  'sprites/oveja-oreja-izq.png',
  'sprites/oveja-oreja-der.png',
  'sprites/oveja-brazo-izq.png',
  'sprites/oveja-brazo-der.png',
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
  // Primero la red (para recibir siempre la última versión); sin conexión, la copia guardada
  event.respondWith(
    // "no-cache": siempre pregunta al servidor si hay versión nueva (evita mezclar archivos viejos y nuevos)
    fetch(event.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
