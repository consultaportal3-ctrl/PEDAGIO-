const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { isIP } = require('node:net');
const { Reader } = require('mmdb-lib');

async function loadDatabase() {
  return new Reader(await readFile(join(__dirname, '../data/geoip.mmdb')));
}

// One database per process, shared by simultaneous requests. No IP leaves the server.
function createLocationLookup(load = loadDatabase) {
  let database;
  return async ip => {
    if (typeof ip !== 'string' || !isIP(ip)) return null;
    try {
      database ||= Promise.resolve().then(load);
      const reader = await database;
      const row = reader.get(ip);
      if (!/^[A-Z]{2}$/.test(row?.country?.iso_code || '')) return null;
      const subdivision = row.subdivisions?.[0];
      return {
        country: row.country.iso_code,
        region: subdivision?.iso_code || subdivision?.names?.['pt-BR'] || subdivision?.names?.en || ''
      };
    } catch {
      // A missing database or unknown address must never prevent counting visits.
      return null;
    }
  };
}

module.exports = { lookupLocation: createLocationLookup(), createLocationLookup };
