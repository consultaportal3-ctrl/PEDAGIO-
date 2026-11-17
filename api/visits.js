const { TTL, day, equal, authenticated, sessionCookie, redis, VisitStoreError } = require('../lib/visits');
const { DETAIL_TTL, accessRecord, summarizeLocations, recentAccess } = require('../lib/access');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).end();
    if (req.method !== 'GET') {
      const origin = req.headers.origin;
      const host = req.headers.host;
      if (!origin || new URL(origin).host !== host) return res.status(403).json({ error: 'Origem não permitida.' });
    }
    if (req.method === 'DELETE') {
      res.setHeader('Set-Cookie', 'panel_session=; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
      return res.status(204).end();
    }
    if (req.method === 'POST') {
      let body = req.body || {};
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Requisição inválida.' }); }
      }
      if (body.action === 'login') {
        if (!process.env.PANEL_PASSWORD) return res.status(503).json({ error: 'Configure PANEL_PASSWORD na Vercel.' });
        // Limit attempts globally without retaining visitor identifiers or IP addresses.
        const bucket = `visits:login:${Math.floor(Date.now() / 60000)}`;
        const [attempts] = await redis([['INCR', bucket], ['EXPIRE', bucket, 120]]);
        if (attempts > 10) return res.status(429).json({ error: 'Muitas tentativas. Aguarde um minuto.' });
        if (typeof body.password !== 'string' || body.password.length > 256 || !equal(body.password, process.env.PANEL_PASSWORD)) return res.status(401).json({ error: 'Senha incorreta.' });
        res.setHeader('Set-Cookie', sessionCookie());
        return res.status(200).json({ ok: true });
      }
      if (body.action !== 'visit') return res.status(400).json({ error: 'Ação inválida.' });
      const now = new Date();
      const date = day(now);
      const key = `visits:day:${date}`;
      const entry = accessRecord(req, now);
      const details = `visits:access:${date}`;
      const geo = `visits:geo:${date}`;
      await redis([
        ['INCR', key], ['EXPIRE', key, TTL], ['SET', 'visits:last', now.toISOString(), 'EX', TTL],
        ['LPUSH', details, JSON.stringify(entry)], ['LTRIM', details, 0, 99], ['EXPIRE', details, DETAIL_TTL, 'NX'],
        ['HINCRBY', geo, `${entry.country}:${entry.region}`, 1], ['EXPIRE', geo, TTL, 'NX']
      ]);
      return res.status(204).end();
    }
    if (!authenticated(req)) return res.status(401).json({ error: 'Entre com a senha do painel.' });
    const days = Number(req.query?.days || 7);
    if (![1, 7, 30].includes(days)) return res.status(400).json({ error: 'Período inválido.' });
    const now = new Date();
    const dates = Array.from({ length: days }, (_, i) => day(new Date(now.getTime() - i * 86400000))).reverse();
    const detailDates = dates.slice(-7);
    const values = await redis([
      ['MGET', ...dates.map(date => `visits:day:${date}`)], ['GET', 'visits:last'],
      ...dates.map(date => ['HGETALL', `visits:geo:${date}`]),
      ...detailDates.map(date => ['LRANGE', `visits:access:${date}`, 0, 99])
    ]);
    const daily = dates.map((date, i) => ({ date, visits: Number(values[0][i] || 0) }));
    return res.status(200).json({ daily, total: daily.reduce((sum, row) => sum + row.visits, 0), today: daily.at(-1).visits, lastVisit: values[1], updatedAt: now.toISOString(), locations: summarizeLocations(values.slice(2, 2 + dates.length)), recent: recentAccess(values.slice(2 + dates.length)) });
  } catch (error) {
    return res.status(503).json({ error: error instanceof VisitStoreError ? error.message : 'Não foi possível acessar os registros. Verifique o banco na Vercel.' });
  }
};
