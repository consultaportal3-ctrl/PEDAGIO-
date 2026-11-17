const { authenticated, redis, day, TTL } = require('../lib/visits');

// One atomic operation: records arriving after the reset remain available.
const RESET_TODAY = `redis.call('DEL', KEYS[1], KEYS[2], KEYS[3], KEYS[4])
redis.call('SET', KEYS[5], ARGV[1], 'EX', ARGV[4])
local last = redis.call('GET', KEYS[6])
if last and last >= ARGV[2] and last < ARGV[3] then redis.call('DEL', KEYS[6]) end
return 1`;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  if (!authenticated(req)) return res.status(401).json({ error: 'Entre com a senha do painel.' });
  try {
    if (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error: 'Origem não permitida.' });
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Requisição inválida.' }); }
    }
    const now = new Date();
    const today = day(now);
    if (body?.confirm !== 'clear-today' || body?.date !== today) return res.status(400).json({ error: 'Confirme novamente a limpeza dos dados de hoje.' });
    const start = new Date(`${today}T00:00:00-03:00`);
    const end = new Date(start.getTime() + 86400000);
    await redis([['EVAL', RESET_TODAY, 6,
      `visits:day:${today}`, `visits:access:${today}`, `visits:geo:${today}`,
      `payments:day:${today}`, `payments:day:${today}:cleared-at`, 'visits:last',
      now.toISOString(), start.toISOString(), end.toISOString(), TTL]]);
    return res.status(200).json({ ok: true, date: today });
  } catch {
    return res.status(503).json({ error: 'Não foi possível limpar os dados. Tente novamente.' });
  }
};
