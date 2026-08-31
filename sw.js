/* Essor — service worker.

   L'application doit s'ouvrir en avion comme dans le métro : le code est mis
   en cache à la première visite, les données sont déjà sur l'appareil.
   Rien de confidentiel ne passe par ici — api.github.com est explicitement
   laissé au réseau, et le cache ne contient que des fichiers publics. */
'use strict';

const CACHE = 'essor-v6';

const COQUILLE = [
  './', 'index.html', 'manifest.webmanifest',
  'icone.svg', 'icone-180.png', 'icone-192.png', 'icone-512.png',
  'icone-maskable-192.png', 'icone-maskable-512.png',
  'css/app.css',
  'js/util.js', 'js/zip.js', 'js/xlsx.js', 'js/crypto.js', 'js/github.js', 'js/store.js',
  'js/engine.js', 'js/indices.js', 'js/roundup.js', 'js/importers.js', 'js/rules.js',
  'js/alloc.js', 'js/fisc.js', 'js/project.js', 'js/charts.js', 'js/worldmap.js',
  'js/geomap.js', 'js/biometrie.js', 'js/install.js', 'js/ui.js', 'js/screen-patrimoine.js', 'js/screen-mois.js',
  'js/screen-budget.js', 'js/screen-operations.js', 'js/screen-reglages.js', 'js/app.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;  // GitHub, cours : réseau seul

  // La page elle-même : réseau d'abord, pour qu'une version déployée arrive
  // sans délai. Hors ligne, on retombe sur la coquille — y compris quand
  // l'adresse porte une ancre ou un paramètre jamais mis en cache tel quel.
  if (e.request.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const r = await fetch(e.request);
        if (r && r.ok) cache.put('index.html', r.clone());
        return r;
      } catch {
        return (await cache.match(e.request)) || (await cache.match('index.html')) ||
          (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Le reste : servi du cache pour l'instantanéité, rafraîchi en arrière-plan.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(e.request);
    const reseau = fetch(e.request).then(r => {
      if (r && r.ok) cache.put(e.request, r.clone());
      return r;
    }).catch(() => hit || Response.error());
    return hit || reseau;
  })());
});
