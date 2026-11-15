const { createHmac, timingSafeEqual } = require('node:crypto');

const TTL = 35 * 86400;
const day = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const equal = (a, b) => {
  const x = Buffer.from(a || '');
  const y = Buffer.from(b || '');
  return x.length === y.length && timingSafeEqual(x, y);
};
function signature(value) {
  return createHmac('sha256', process.env.PANEL_PASSWORD).update(value).digest('hex');
}
function authenticated(req) {
  const cookie = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('panel_session='));
  if (!cookie || !process.env.PANEL_PASSWORD) return false;
  const [expires, hash] = cookie.slice('panel_session='.length).split('.');
  return Number(expires) > Date.now() && equal(hash, signature(expires));
}
function sessionCookie() {
  const expires = String(Date.now() + 8 * 3600000);
  return `panel_session=${expires}.${signature(expires)}; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`;
}
async function redis(commands) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Banco de visitas não configurado na Vercel.');
  const response = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands), signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Banco de visitas indisponível.');
  const results = await response.json();
  if (results.some(item => item.error)) throw new Error('Não foi possível atualizar as visitas.');
  return results.map(item => item.result);
}
module.exports = { TTL, day, equal, authenticated, sessionCookie, redis };
