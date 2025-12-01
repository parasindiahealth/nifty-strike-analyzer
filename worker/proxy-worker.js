// worker/proxy-worker.js
addEventListener('fetch', event => {
  event.respondWith(handle(event.request));
});
async function handle(request) {
  const url = new URL(request.url);
  const target = url.searchParams.get('url');
  if(!target) return new Response('Missing url param', { status: 400 });
  // Forward with NSE-friendly headers
  const resp = await fetch(target, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const headers = new Headers(resp.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
  return new Response(resp.body, { status: resp.status, headers });
}
