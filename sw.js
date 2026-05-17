const CACHE = 'polyvox-v19';
const FILES = [
    '/',
    '/index.html',
    '/app.js',
    '/manifest.json',
    '/Roland-JX-8P-Pipe-Organ-C4.wav'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(FILES))
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(k => k !== CACHE).map(k => caches.delete(k))
        ))
    );
});

self.addEventListener('fetch', e => {
    e.respondWith(
        fetch(e.request).catch(() =>
            caches.match(e.request)
        )
    );
});
