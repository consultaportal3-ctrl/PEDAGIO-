const { TTL, day, equal, authenticated, sessionCookie, redis } = require('../lib/visits');

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
      const date = day(new Date());
      const key = `visits:day:${date}`;
      await redis([['INCR', key], ['EXPIRE', key, TTL], ['SET', 'visits:last', new Date().toISOString(), 'EX', TTL]]);
      return res.status(204).end();
    }
    if (!authenticated(req)) return res.status(401).json({ error: 'Entre com a senha do painel.' });
    const days = Number(req.query?.days || 7);
    if (![7, 30].includes(days)) return res.status(400).json({ error: 'Período inválido.' });
    const now = new Date();
    const dates = Array.from({ length: days }, (_, i) => day(new Date(now.getTime() - i * 86400000))).reverse();
    const values = await redis([['MGET', ...dates.map(date => `visits:day:${date}`)], ['GET', 'visits:last']]);
    const daily = dates.map((date, i) => ({ date, visits: Number(values[0][i] || 0) }));
    return res.status(200).json({ daily, total: daily.reduce((sum, row) => sum + row.visits, 0), today: daily.at(-1).visits, lastVisit: values[1], updatedAt: now.toISOString() });
  } catch (error) {
    return res.status(503).json({ error: 'Não foi possível acessar os registros. Verifique o banco na Vercel.' });
  }
};
