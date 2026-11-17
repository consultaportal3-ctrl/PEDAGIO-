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
class VisitStoreError extends Error {}
const clean = value => (value || '').trim().replace(/^(["'])(.*)\1$/, '$2').trim();
async function redis(commands) {
  const url = clean(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL);
  const token = clean(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN);
  if (!url) throw new VisitStoreError('Falta UPSTASH_REDIS_REST_URL na hospedagem. Cadastre a URL HTTPS do banco e faça Redeploy.');
  if (!token) throw new VisitStoreError('Falta UPSTASH_REDIS_REST_TOKEN na hospedagem. Cadastre o token do banco e faça Redeploy.');
  let endpoint;
  try {
    endpoint = new URL(url);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !['', '/'].includes(endpoint.pathname)) throw new Error();
  } catch {
    throw new VisitStoreError('UPSTASH_REDIS_REST_URL inválida. Cole somente o endereço https:// do banco, sem o nome da variável, e faça Redeploy.');
  }
  if (/\s|UPSTASH_REDIS_REST_TOKEN/.test(token)) throw new VisitStoreError('UPSTASH_REDIS_REST_TOKEN inválido. Cole somente o valor do token, sem o nome da variável, e faça Redeploy.');
  let response;
  try {
    response = await fetch(`${endpoint.origin}/pipeline`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands), signal: AbortSignal.timeout(8000)
    });
  } catch {
    throw new VisitStoreError('Não foi possível conectar ao Upstash. Confira a URL do banco e se ele está ativo; depois tente novamente.');
  }
  const results = await response.json().catch(() => null);
  const failure = typeof results?.error === 'string' ? results.error : '';
  if ([401, 403].includes(response.status) || /WRONGPASS|invalid.*token|missing.*token/i.test(failure)) throw new VisitStoreError('O Upstash recusou o token. Copie o token REST do mesmo banco da URL, com Read-Only Token desmarcado, e faça Redeploy.');
  if (response.status === 429) throw new VisitStoreError('O banco atingiu um limite de uso. Confira Usage no Upstash e tente novamente mais tarde.');
  if (!response.ok) {
    if (/READONLY|read.only|NOPERM/i.test(failure)) throw new VisitStoreError('O token não permite gravar visitas. Copie o token REST com Read-Only Token desmarcado e faça Redeploy.');
    if (response.status === 404) throw new VisitStoreError(`URL do banco não encontrada (HTTP 404 em ${endpoint.hostname}). Confira UPSTASH_REDIS_REST_URL na hospedagem e faça Redeploy.`);
    throw new VisitStoreError(`O endereço ${endpoint.hostname} respondeu HTTP ${Number(response.status)}. Confira a URL REST, o estado do banco e os limites no Upstash.`);
  }
  if (!Array.isArray(results) || results.length !== commands.length) throw new VisitStoreError('Resposta inesperada do banco. Confira a URL REST do Upstash.');
  const failedIndex = results.findIndex(item => item?.error);
  if (failedIndex !== -1) {
    // Never include headers, passwords, tokens or visitor records in diagnostics.
    let detail = String(results[failedIndex].error);
    for (const secret of [token, process.env.PANEL_PASSWORD]) {
      if (secret) detail = detail.split(secret).join('[oculto]');
    }
    detail = detail.replace(/Bearer\s+\S+/gi, 'Bearer [oculto]').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 240);
    const command = String(commands[failedIndex][0]).replace(/[^A-Z]/gi, '').slice(0, 20);
    if (['LPUSH', 'EVAL'].includes(command)) detail = /READONLY|NOPERM/i.test(detail) ? 'NOPERM: sem permissão para gravar registros' : 'Falha ao salvar registros';
    const hint = /READONLY|read.only|NOPERM|not allowed|not permitted/i.test(detail)
      ? ' O token usado pelo deployment não tem permissão para essa operação; confira o token com Read-Only Token desmarcado.'
      : '';
    throw new VisitStoreError(`O banco recusou ${command}: ${detail}.${hint}`);
  }
  return results.map(item => item.result);
}
module.exports = { TTL, day, equal, authenticated, sessionCookie, redis, VisitStoreError };
