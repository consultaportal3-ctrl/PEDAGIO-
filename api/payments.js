const { authenticated, redis, day } = require('../lib/visits');
const { paymentSummary } = require('../lib/payments');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();
  if (!authenticated(req)) return res.status(401).json({ error: 'Entre no painel.' });
  const days = Number(req.query?.days || 7);
  if (![7, 30].includes(days)) return res.status(400).json({ error: 'Período inválido.' });
  if (!process.env.PINGUPAG_API_KEY || !process.env.PINGUPAG_WEBHOOK_SECRET || process.env.PINGUPAG_WEBHOOK_SECRET.length < 32) return res.status(200).json({ configured: false });
  try {
    const dates = Array.from({ length: days }, (_, i) => day(new Date(Date.now() - i * 86400000)));
    const buckets = await redis(dates.map(date => ['HVALS', `payments:day:${date}`]));
    return res.status(200).json({ configured: true, ...paymentSummary(buckets) });
  } catch {
    return res.status(503).json({ error: 'Não foi possível carregar os pagamentos. Tente novamente.' });
  }
};
