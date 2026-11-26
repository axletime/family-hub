// Family Hub service worker: makes the app installable. It deliberately does no
// caching of pages or API data (everything is live), it just shows a friendly
// message when the hub can't be reached.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(
          '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Family Hub</title>' +
            '<body style="font-family:system-ui;background:#0b1220;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px">' +
            '<div><h1>Family Hub is offline</h1><p>Check you are connected to the home Wi-Fi, then try again.</p>' +
            '<button onclick="location.reload()" style="font-size:16px;padding:12px 20px;border-radius:12px;border:0;background:#1B4F8A;color:#fff">Try again</button></div>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        ),
    ),
  );
});
