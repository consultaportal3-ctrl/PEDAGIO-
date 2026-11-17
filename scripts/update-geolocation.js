const { mkdir, readFile, rename, unlink } = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const { join } = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createGunzip } = require('node:zlib');
const { Reader } = require('mmdb-lib');

function candidateMonths(now = new Date()) {
  return [0, 1].map(offset => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1)).toISOString().slice(0, 7));
}

function sizeLimit(maximum) {
  let size = 0;
  return new Transform({ transform(chunk, _encoding, callback) {
    size += chunk.length;
    callback(size > maximum ? new Error('Base de localização excedeu o tamanho permitido.') : null, chunk);
  } });
}

async function updateDatabase() {
  const directory = join(__dirname, '../data');
  const target = join(directory, 'geoip.mmdb');
  const temporary = join(directory, 'geoip.mmdb.tmp');
  await mkdir(directory, { recursive: true });
  // The previous month covers the period before a new monthly release is ready.
  for (const month of candidateMonths()) {
    const response = await fetch(`https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz`, { signal: AbortSignal.timeout(120000), redirect: 'error' });
    if (response.status === 404) { await response.body?.cancel(); continue; }
    if (!response.ok || !response.body) throw new Error(`Download da base DB-IP respondeu HTTP ${response.status}.`);
    try {
      await pipeline(Readable.fromWeb(response.body), sizeLimit(96 * 1024 * 1024), createGunzip(), sizeLimit(256 * 1024 * 1024), createWriteStream(temporary));
      // Validate before publishing the file used by the application.
      new Reader(await readFile(temporary));
      await rename(temporary, target);
      console.log(`Base local DB-IP instalada (${month}).`);
      return;
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  throw new Error('Base DB-IP mensal indisponível. Tente implantar novamente mais tarde.');
}

if (require.main === module) updateDatabase().catch(error => {
  console.error(`Falha ao instalar a localização: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { candidateMonths, sizeLimit };
