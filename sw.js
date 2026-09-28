// KataGo Cloud service worker. It caches nothing: every page and file still comes from the network, so a new deploy
// shows at once. It exists so the site can be installed as an app (홈 화면에 추가), so "GPU 준비 완료" notifications
// can be shown (Android shows them only through a worker) and open the site when tapped, and so a page opened with
// no connection says so instead of the browser's error page.
const OFFLINE = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>연결 없음 · KataGo Cloud</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#fafbfd;color:#171a22;
font:16px/1.6 'Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box">
<div><h1 style="font-size:22px;margin:0 0 8px">인터넷에 연결되어 있지 않습니다</h1>
<p style="color:#687082;margin:0 0 20px">연결되면 다시 시도하세요. 켜 둔 GPU는 10분 동안 입력이 없으면 스스로 꺼집니다.</p>
<button onclick="location.reload()" style="font:inherit;font-weight:600;border:0;border-radius:999px;padding:10px 22px;background:#2c5cf6;color:#fff">다시 시도</button></div>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (ev) => ev.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (ev) => {
  if (ev.request.mode !== "navigate") return;   // files, API calls, the GPU connection: untouched
  ev.respondWith(fetch(ev.request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
self.addEventListener("notificationclick", (ev) => {
  ev.notification.close();
  const url = new URL(ev.notification.data?.url || "./", self.registration.scope).href;
  ev.waitUntil((async () => {
    const pages = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const home = pages.find((c) => new URL(c.url).pathname === new URL(url).pathname) || pages[0];
    if (home) { await home.focus(); return; }
    await self.clients.openWindow(url);
  })());
});
