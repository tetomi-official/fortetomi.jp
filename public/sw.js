// TETOMI 最小 Service Worker。
// 目的は「PWA としてインストール可能にする（fetch ハンドラを持つ）」こと。
// 認証済みの動的ページを誤ってキャッシュしないよう、キャッシュ対象は
// ハッシュ付きで不変な /_next/static のみに限定し、それ以外は素通し（ネットワーク）。
const CACHE = "tetomi-static-v1";

self.addEventListener("install", (event) => {
  // 即時有効化（古い SW を待たない）。
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 旧バージョンのキャッシュを掃除。
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // 不変なビルド成果物のみ cache-first。それ以外は既定のネットワーク処理に委ねる。
  const isImmutable = url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
  if (!isImmutable) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res && res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    })(),
  );
});
