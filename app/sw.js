// 오프라인용 서비스 워커.
// 한 버전의 앱 파일을 한 캐시에 통째로 담고, 그 캐시에서만 준다 (옛 파일과 새 파일이 섞이지 않게).
// 새 버전은 install 단계에서 전부 받아야만 활성화된다. VERSION 은 배포 워크플로가 커밋 해시로 바꿔 넣는다.
const VERSION = 'wc-dev';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'js/main.js', 'js/ui/dom.js', 'js/ui/gripart.js', 'js/ui/hold.js', 'js/ui/library.js', 'js/ui/bodymap.js', 'js/ui/views.js',
  'js/core/catalog.js', 'js/core/coach.js', 'js/core/evidence.js', 'js/core/export.js', 'js/core/grips.js', 'js/core/hold.js', 'js/core/guide.js', 'js/core/media.js', 'js/core/migrate.js', 'js/core/order.js',
  'js/core/plan.js', 'js/core/quick.js', 'js/core/schema.js', 'js/core/session.js', 'js/core/store.js', 'js/core/sync.js', 'js/core/util.js', 'js/vendor/qrcode.js',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' 로 HTTP 캐시를 건너뛰어 반드시 새 파일을 받는다.
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== FONT_CACHE && k !== IMG_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// 글꼴(jsdelivr)은 버전과 무관한 별도 캐시에 담아 오프라인에서도 쓴다.
const FONT_CACHE = 'wc-fonts';
const IMG_CACHE = 'wc-img';
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'GET' && url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(FONT_CACHE).then(async (c) => (await c.match(e.request)) || fetch(e.request).then((res) => { if (res.ok || res.type === 'opaque') c.put(e.request, res.clone()); return res; })));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // 운동 그림은 버전과 무관한 별도 캐시: 한 번 본 그림은 오프라인에서도 보인다 (설치 때 전부 받지 않는다)
  if (url.pathname.includes('/img/ex/')) {
    e.respondWith(caches.open(IMG_CACHE).then(async (c) => (await c.match(e.request)) || fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; })));
    return;
  }
  e.respondWith(caches.open(VERSION).then(async (c) => (await c.match(e.request, { ignoreSearch: true })) || fetch(e.request)));
});
