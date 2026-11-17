const http = require('node:http');
const { readFile } = require('node:fs/promises');
const { join, extname } = require('node:path');

const api = new Map(['visits', 'payments', 'panel-reset', 'checkout', 'pingupag-webhook']
  .map(name => [`/api/${name}`, require(`./api/${name}`)]));
const pages = new Set([
  'index.html', 'cadastro.html', 'consulta.html', 'debitos.html', 'painel.html',
  'cadastro.css', 'consulta.css', 'debitos.css', 'painel.css',
  'cadastro.js', 'cadastro-session.js', 'consulta.js', 'debitos.js', 'painel.js',
  'customer-fields.js', 'pix-qr.js', 'splash.js', 'splash-config.js', 'visits.js'
]);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp' };
const MAX_BODY = 64 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        chunks.length = 0;
        reject(Object.assign(new Error('Requisição muito grande.'), { status: 413 }));
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    res.status = code => { res.statusCode = code; return res; };
    res.json = value => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(value));
      return res;
    };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const forwardedHost = req.headers['x-forwarded-host'];
      if (process.env.RAILWAY_PROJECT_ID && typeof forwardedHost === 'string' && /^[A-Za-z0-9.-]+(?::\d+)?$/.test(forwardedHost)) req.headers.host = forwardedHost;
      const url = new URL(req.url, 'http://localhost');
      const path = decodeURIComponent(url.pathname);
      if (path === '/healthz' && ['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ ok: true });
      }
      const handler = api.get(path);
      if (handler) {
        req.query = Object.fromEntries(url.searchParams);
        req.body = await readBody(req);
        return await handler(req, res);
      }
      if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end();
      const file = path === '/' ? 'index.html' : path.slice(1);
      const asset = /^(?:index_files|vendor)\/[A-Za-z0-9_-]+\.(?:png|svg|ico|webp|js|css)$/.test(file);
      if (!pages.has(file) && !asset) return res.status(404).end();
      const content = await readFile(join(__dirname, file));
      res.setHeader('Content-Type', types[extname(file)]);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Content-Length', content.length);
      return res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (res.headersSent) return res.end();
      if (error.code === 'ENOENT') return res.status(404).end();
      if (error instanceof URIError || error.code === 'ERR_INVALID_URL') return res.status(400).json({ error: 'Endereço inválido.' });
      return res.status(error.status === 413 ? 413 : 500).json({ error: error.status === 413 ? 'Requisição muito grande.' : 'Não foi possível atender a solicitação.' });
    }
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('Site iniciado.'));
  process.on('SIGTERM', () => server.close());
  process.on('SIGINT', () => server.close());
}

module.exports = { createServer };
