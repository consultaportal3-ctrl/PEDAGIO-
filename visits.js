(() => {
  // One visit per tab in a 30-minute interval, including the splash redirect.
  // The server records the connection IP and approximate region from Vercel.
  // No vehicle plate, referrer, or persistent identifier is sent by this script.
  const key = 'site-visit-at';
  const now = Date.now();
  try {
    if (now - Number(sessionStorage.getItem(key) || 0) < 30 * 60000) return;
  } catch {}
  fetch('/api/visits', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'visit' }), keepalive: true, credentials: 'omit'
  }).then(response => {
    if (response.ok) { try { sessionStorage.setItem(key, String(now)); } catch {} }
  }).catch(() => {});
})();
