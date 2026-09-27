const VERSION = 'munai-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(VERSION)
            .then(c => c.addAll(SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;   // skip cross-origin
    if (url.pathname.startsWith('/api/')) return;      // never cache AI proxy

    // Navigation requests → network first, fall back to shell
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req).catch(() => caches.match('/index.html'))
        );
        return;
    }

    // Everything else → cache first, then network, then background-fill
    event.respondWith(
        caches.match(req).then(hit => {
            if (hit) return hit;
            return fetch(req).then(res => {
                if (res.ok && (res.type === 'basic' || res.type === 'default')) {
                    const clone = res.clone();
                    caches.open(VERSION).then(c => c.put(req, clone));
                }
                return res;
            }).catch(() => {
                if (url.pathname.endsWith('.js')) return caches.match('/index.html');
                return new Response('', { status: 504 });
            });
        })
    );
});