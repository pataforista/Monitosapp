const APP_CACHE = "app-shell-v1";
const IMG_CACHE = "monkey-images-v1";

const APP_ASSETS = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./discovery-service.js",
    "./monkeys.json",
    "./manifest.webmanifest",
    "./icons/icon-192.png",
    "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(APP_CACHE);
        await cache.addAll(APP_ASSETS);
        self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => {
            if (![APP_CACHE, IMG_CACHE].includes(k)) return caches.delete(k);
        }));
        self.clients.claim();
    })());
});

// Estrategia:
// - app shell: cache-first
// - imágenes: cache-first (y se cachea lo que visites)
self.addEventListener("fetch", (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // Solo GET
    if (req.method !== "GET") return;

    // App shell: mismo origen
    if (url.origin === location.origin) {
        event.respondWith(cacheFirst(APP_CACHE, req));
        return;
    }

    // Imágenes remotas (http/https): cache-first en IMG_CACHE
    const isImage = req.destination === "image" || /\.(png|jpe?g|webp|avif|gif)$/i.test(url.pathname);
    if (isImage) {
        event.respondWith(cacheFirst(IMG_CACHE, req));
    }
});

async function cacheFirst(cacheName, request) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;

    const res = await fetch(request);
    // Solo cachea respuestas válidas
    if (res && (res.ok || res.type === "opaque")) {
        cache.put(request, res.clone()).catch(() => { });
    }
    return res;
}

// Mensajes desde la app (limpiar caché de imágenes, contar, etc.)
self.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    if (msg.type === "CLEAR_IMAGE_CACHE") {
        event.waitUntil((async () => {
            await caches.delete(IMG_CACHE);
            // recrea vacío
            await caches.open(IMG_CACHE);
            event.source?.postMessage({ type: "IMAGE_CACHE_CLEARED" });
        })());
    }

    if (msg.type === "COUNT_IMAGE_CACHE") {
        event.waitUntil((async () => {
            const cache = await caches.open(IMG_CACHE);
            const keys = await cache.keys();
            event.source?.postMessage({ type: "IMAGE_CACHE_COUNT", count: keys.length });
        })());
    }
});
