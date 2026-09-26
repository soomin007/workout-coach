// 오프라인용 서비스 워커: 앱 파일을 캐시에서 바로 주고, 뒤에서 새 버전을 받아 둔다.
// 배포할 때 VERSION 을 올리면 옛 캐시를 정리한다.
const VERSION = 'wc-v10.0.0';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg',
  'js/main.js', 'js/ui/dom.js', 'js/ui/views.js',
  'js/core/catalog.js', 'js/core/coach.js', 'js/core/evidence.js', 'js/core/export.js', 'js/core/migrate.js',
  'js/core/plan.js', 'js/core/quick.js', 'js/core/schema.js', 'js/core/session.js', 'js/core/store.js', 'js/core/util.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
