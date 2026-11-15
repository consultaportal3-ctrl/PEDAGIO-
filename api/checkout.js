const { createHmac } = require('node:crypto');
const { redis, equal } = require('../lib/visits');
const { AMOUNT, DESCRIPTION, customerData, checkoutToken, sellerDetails } = require('../lib/checkout');
const { gatewayRequest, normalizeTransaction, verifyReference, transactionCommand } = require('../lib/payments');
const REQUEST_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).end();
  const secret = process.env.PINGUPAG_WEBHOOK_SECRET;
  if (!process.env.PINGUPAG_API_KEY || !secret || secret.length < 32) return res.status(503).json({ error: 'Cadastro indisponível. O responsável precisa concluir a configuração do pagamento.' });
  let reservedKey = null;
  try {
    if (req.method === 'GET' && !req.query?.reference) {
      const seller = await sellerDetails();
      return res.status(200).json({ amount: AMOUNT, description: DESCRIPTION, seller });
    }
    if (req.method === 'GET') {
      const reference = req.query.reference;
      if (typeof reference !== 'string' || !reference.startsWith('CAD_') || !REQUEST_ID.test(reference.slice(4)) || !equal(req.headers.authorization || '', `Bearer ${checkoutToken(reference)}`)) return res.status(403).json({ error: 'Consulta não autorizada.' });
      const [cache] = await redis([['GET', `checkout:status:${reference}`]]);
      if (cache) return res.status(200).json(JSON.parse(cache));
      const rows = await verifyReference(reference);
      if (!rows.length) return res.status(404).json({ error: 'Cobrança ainda não localizada.' });
      const row = rows.find(row => row.amount === AMOUNT);
      if (!row) throw new Error('Amount mismatch');
      const result = { status: row.status, amount: row.amount };
      await redis([transactionCommand(row), ['SET', `checkout:status:${reference}`, JSON.stringify(result), 'EX', 15]]);
      return res.status(200).json(result);
    }
    if (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error: 'Origem não permitida.' });
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Requisição inválida.' }); } }
    const customer = customerData(body?.customer);
    if (!customer || !REQUEST_ID.test(body?.requestId || '') || body?.accepted !== true) return res.status(400).json({ error: 'Confira nome completo, CPF/CNPJ, e-mail, telefone e o aceite da taxa.' });
    const reference = `CAD_${body.requestId}`;
    const key = `checkout:order:${reference}`;
    const [stored] = await redis([['GET', key]]);
    if (stored) {
      const previous = JSON.parse(stored);
      if (previous.state === 'created') return res.status(200).json(previous.result);
      return res.status(409).json({ error: 'Essa solicitação já está em processamento. Aguarde e tente novamente nesta página.' });
    }
    // Discard forwarding values outside Vercel; hash for rate limits, never log payer data.
    const ip = process.env.VERCEL === '1' ? (req.headers['x-forwarded-for'] || '').split(',')[0].trim() : 'local';
    const fingerprint = createHmac('sha256', secret).update(ip || 'unknown').digest('hex');
    const limit = `checkout:limit:${fingerprint}:${Math.floor(Date.now() / 3600000)}`;
    const [count] = await redis([['INCR', limit], ['EXPIRE', limit, 3600, 'NX']]);
    if (count > 10) return res.status(429).json({ error: 'Limite de solicitações atingido. Tente mais tarde ou entre em contato com o responsável.' });
    const seller = await sellerDetails();
    // The consent must refer to the current, verified service provider.
    if (body.sellerName !== seller.name) return res.status(409).json({ error: 'Os dados do prestador foram atualizados. Recarregue a página antes de continuar.' });
    const [reserved] = await redis([['SET', key, JSON.stringify({ state: 'creating' }), 'NX', 'EX', 86400]]);
    if (!reserved) return res.status(409).json({ error: 'Solicitação já recebida. Aguarde e tente novamente nesta página.' });
    reservedKey = key;
    const hook = new URL('/api/pingupag-webhook', 'https://pedagio-digital.online');
    hook.searchParams.set('key', secret);
    const created = await gatewayRequest('/gateway/v1/transaction', {
      method: 'POST', body: JSON.stringify({ amount: AMOUNT, description: DESCRIPTION, reference, source: 'api_externa', postback_url: hook.href, customer })
    });
    if (created.status !== 'success' || created.amount !== AMOUNT || typeof created.qr_code !== 'string' || !created.qr_code.startsWith('000201') || created.qr_code.length > 4096) throw new Error('Invalid creation response');
    const stamp = new Date().toISOString();
    const transaction = normalizeTransaction({ id: created.transaction_id, external_id: reference, status: 'pending', amount: AMOUNT, created_at: stamp, updated_at: stamp });
    if (!transaction) throw new Error('Invalid transaction ID');
    const result = { reference, token: checkoutToken(reference), amount: AMOUNT, status: 'pending', qrCode: created.qr_code, qrImage: typeof created.qr_code_base64 === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(created.qr_code_base64) && created.qr_code_base64.length < 300000 ? created.qr_code_base64 : null, seller };
    await redis([['SET', key, JSON.stringify({ state: 'created', result }), 'EX', 86400], transactionCommand(transaction)]);
    return res.status(201).json(result);
  } catch (error) {
    // An explicit 4xx rejection (except timeout) cannot have created a charge.
    if (reservedKey && error.httpStatus >= 400 && error.httpStatus < 500 && error.httpStatus !== 408) {
      try { await redis([['DEL', reservedKey]]); } catch {}
    }
    // Do not expose API responses containing customer data or credentials.
    if (req.method === 'GET' && !req.query?.reference) return res.status(503).json({ error: 'Não foi possível identificar o prestador. O responsável precisa conferir a chave da PinguPag e seus dados de cadastro no gateway.' });
    return res.status(503).json({ error: 'Não foi possível concluir a solicitação. Se já clicou em gerar, mantenha esta página e tente novamente; não crie outra solicitação.' });
  }
};
