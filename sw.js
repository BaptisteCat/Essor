/* Essor — service worker.

   L'application doit s'ouvrir en avion comme dans le métro : le code est mis
   en cache à la première visite, les données sont déjà sur l'appareil.
   Rien de confidentiel ne passe par ici — api.github.com est explicitement
   laissé au réseau, et le cache ne contient que des fichiers publics. */
'use strict';

const CACHE = 'essor-v1';

const COQUILLE = [
  './', 'index.html', 'manifest.webmanifest', 'icone.svg', 'icone-192.png', 'icone-512.png',
  'css/app.css',
  'js/util.js', 'js/zip.js', 'js/xlsx.js', 'js/crypto.js', 'js/github.js', 'js/store.js',
  'js/engine.js', 'js/indices.js', 'js/roundup.js', 'js/importers.js', 'js/rules.js',
  'js/alloc.js', 'js/fisc.js', 'js/project.js', 'js/charts.js', 'js/worldmap.js',
  'js/geomap.js', 'js/ui.js', 'js/screen-patrimoine.js', 'js/screen-mois.js',
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
  // Servir depuis le cache pour l'instantanéité, rafraîchir en arrière-plan :
  // une nouvelle version déployée est prise au chargement suivant.
  e.respondWith(caches.match(e.request).then(hit => {
    const reseau = fetch(e.request).then(r => {
      if (r && r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
      return r;
    }).catch(() => hit);
    return hit || reseau;
  }));
});
