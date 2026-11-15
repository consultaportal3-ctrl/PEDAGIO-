const { isIP } = require('node:net');
const { randomUUID } = require('node:crypto');

const DETAIL_TTL = 7 * 86400;
const STATES = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' };

function accessRecord(req, now) {
  // Only trust geographic and forwarding headers when behind the Vercel edge.
  const headers = process.env.VERCEL === '1' ? req.headers : {};
  const value = name => typeof headers[name] === 'string' ? headers[name].trim() : '';
  const candidate = value('x-forwarded-for').split(',')[0].trim();
  const country = /^[A-Z]{2}$/.test(value('x-vercel-ip-country')) ? value('x-vercel-ip-country') : '';
  const region = /^[A-Z0-9]{1,3}$/.test(value('x-vercel-ip-country-region')) ? value('x-vercel-ip-country-region') : '';
  return { id: randomUUID(), at: now.toISOString(), ip: isIP(candidate) ? candidate : null, country, region };
}
function locationName(country, region) {
  if (country === 'BR' && STATES[region]) return `${STATES[region]} (${region})`;
  return [country, region].filter(Boolean).join(' / ') || 'Não identificado';
}
function summarizeLocations(hashes) {
  const totals = new Map();
  for (const hash of hashes) {
    const entries = Array.isArray(hash) ? Array.from({ length: Math.floor(hash.length / 2) }, (_, i) => [hash[i * 2], hash[i * 2 + 1]]) : Object.entries(hash || {});
    for (const [key, count] of entries) totals.set(key, (totals.get(key) || 0) + Number(count || 0));
  }
  return [...totals].map(([key, visits]) => {
    const [country, region] = key.split(':');
    return { country, region, name: locationName(country, region), visits };
  }).sort((a, b) => b.visits - a.visits);
}
function recentAccess(lists) {
  return lists.flatMap(list => Array.isArray(list) ? list : []).flatMap(value => {
    try {
      const row = typeof value === 'string' ? JSON.parse(value) : value;
      if (!row || typeof row.at !== 'string' || !Number.isFinite(Date.parse(row.at))) return [];
      if (Date.parse(row.at) < Date.now() - DETAIL_TTL * 1000) return [];
      return [{ ...row, location: locationName(row.country, row.region) }];
    } catch { return []; }
  }).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 200);
}
module.exports = { DETAIL_TTL, accessRecord, summarizeLocations, recentAccess };
