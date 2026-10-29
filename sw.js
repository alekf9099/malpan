// 오프라인 캐시. 인터넷이 되면 늘 새 파일을 받고(네트워크 우선), 끊기면 마지막으로 받아 둔 것을 쓴다.
// 한 번 끝까지 열어 두면 글꼴·캐릭터 그림까지 캐시에 남아 비행기 모드에서도 할 수 있다.
const CACHE = 'malpan-v29';
const CORE = ['./', 'index.html', 'src/ui/styles.css', 'src/ui/app.js', 'manifest.webmanifest', 'assets/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
