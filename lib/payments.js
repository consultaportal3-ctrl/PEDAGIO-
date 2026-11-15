const { day, TTL } = require('./visits');
const STATUSES = new Set(['pending', 'approved', 'processing', 'under_review', 'failed', 'refunded', 'chargeback']);
function gatewayDate(value) {
  if (typeof value !== 'string') return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? value.replace(' ', 'T') + '-03:00' : value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
function normalizeTransaction(row) {
  if (!row || !['string', 'number'].includes(typeof row.id) || !STATUSES.has(row.status) || !Number.isSafeInteger(row.amount) || row.amount < 0) return null;
  const id = typeof row.external_id === 'string' && /^CAD_[a-f0-9-]{36}$/i.test(row.external_id) ? row.external_id : String(row.id);
  const createdAt = gatewayDate(row.created_at);
  const updatedAt = gatewayDate(row.updated_at);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !createdAt || !updatedAt) return null;
  if (Date.parse(createdAt) < Date.now() - TTL * 1000 || Date.parse(createdAt) > Date.now() + 300000) return null;
  return { id, status: row.status, amount: row.amount, createdAt, updatedAt, date: day(new Date(createdAt)) };
}
function paymentSummary(buckets) {
  const transactions = buckets.flatMap(bucket => Array.isArray(bucket) ? bucket : []).flatMap(value => {
    try { const row = typeof value === 'string' ? JSON.parse(value) : value; return normalizeTransaction({ ...row, created_at: row.createdAt, updated_at: row.updatedAt }) || []; } catch { return []; }
  });
  const paid = transactions.filter(row => row.status === 'approved');
  return { generated: transactions.length, paid: paid.length, amountPaid: paid.reduce((total, row) => total + row.amount, 0), recent: transactions.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 100) };
}
async function gatewayRequest(path, options = {}) {
  const base = new URL(process.env.PINGUPAG_API_BASE_URL || 'https://pagamento-processador.org.ua');
  if (base.protocol !== 'https:' || base.username || base.password) throw new Error('Invalid gateway URL');
  const url = new URL(path, base.origin);
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.PINGUPAG_API_KEY }, redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    const error = new Error('Gateway request failed');
    error.httpStatus = response.status;
    throw error;
  }
  return response.json();
}
async function verifyReference(reference) {
  const url = new URL('https://unused.invalid/gateway/v1/query');
  url.searchParams.set('action', 'list_transactions');
  url.searchParams.set('external_id', reference);
  const rows = await gatewayRequest(url.pathname + url.search);
  if (!Array.isArray(rows)) throw new Error('Invalid gateway response');
  return rows.filter(row => row.external_id === reference).map(normalizeTransaction).filter(Boolean);
}
// Each transaction occupies one field; retries do not add duplicate sales.
// Refuse older snapshots when gateway notifications arrive out of order.
const SAVE_TRANSACTION = `local old = redis.call('HGET', KEYS[1], ARGV[1])
if old then
  local previous = cjson.decode(old)
  local incoming = cjson.decode(ARGV[2])
  if previous.updatedAt > incoming.updatedAt then return 0 end
  if previous.updatedAt == incoming.updatedAt then
    local rank = {pending=1, processing=2, under_review=2, failed=3, approved=4, refunded=5, chargeback=5}
    if (rank[previous.status] or 0) > (rank[incoming.status] or 0) then return 0 end
  end
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('EXPIREAT', KEYS[1], ARGV[3])
return 1`;
function transactionCommand(row) {
  const expires = Math.floor(Date.parse(`${row.date}T00:00:00-03:00`) / 1000) + 35 * 86400;
  return ['EVAL', SAVE_TRANSACTION, 1, `payments:day:${row.date}`, row.id, JSON.stringify(row), expires];
}
module.exports = { normalizeTransaction, paymentSummary, verifyReference, SAVE_TRANSACTION, transactionCommand, gatewayRequest };
