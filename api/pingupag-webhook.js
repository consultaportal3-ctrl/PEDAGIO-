const { equal, redis } = require('../lib/visits');
const { verifyReference, SAVE_TRANSACTION } = require('../lib/payments');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const secret = process.env.PINGUPAG_WEBHOOK_SECRET;
  if (!process.env.PINGUPAG_API_KEY || !secret || secret.length < 32) return res.status(503).json({ error: 'Integração não configurada.' });
  if (typeof req.query?.key !== 'string' || !equal(req.query.key, secret)) return res.status(403).json({ error: 'Não autorizado.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'JSON inválido.' }); } }
  const reference = body?.external_id || body?.store_reference;
  if (typeof reference !== 'string' || !reference.length || reference.length > 128) return res.status(400).json({ error: 'Referência inválida.' });
  try {
    // The notification is a signal only: status and amount come from the API.
    const rows = await verifyReference(reference);
    if (!rows.length) return res.status(422).json({ error: 'Transação não confirmada no gateway.' });
    await redis(rows.map(row => {
      const expires = Math.floor(Date.parse(`${row.date}T00:00:00-03:00`) / 1000) + 35 * 86400;
      return ['EVAL', SAVE_TRANSACTION, 1, `payments:day:${row.date}`, row.id, JSON.stringify(row), expires];
    }));
    return res.status(200).json({ received: true });
  } catch {
    // Ask the gateway to retry instead of acknowledging an unverified payment.
    return res.status(503).json({ error: 'Não foi possível confirmar a transação. Tente novamente.' });
  }
};
