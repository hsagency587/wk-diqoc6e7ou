/* Workout — cache network-first: con la rete si prende sempre il file nuovo,
   senza rete si apre la copia in cache. Il file del piano non passa di qui:
   sta su api.github.com, un altro dominio, e la sua copia offline la tiene
   l'app nel telefono. */

/* Il numero della cache: si alza quando un telefono resta indietro. */
const CACHE = 'wk-v20';

const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'editor.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.map(k => (k === CACHE ? null : caches.delete(k)))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true })
          .then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined))
          .then(hit => hit || Response.error())
      )
  );
});
