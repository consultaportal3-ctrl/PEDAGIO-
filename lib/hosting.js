const { isIP } = require('node:net');

function clientIP(req) {
  let candidate = '';
  if (process.env.RAILWAY_PROJECT_ID) candidate = req.headers['x-real-ip'];
  else if (process.env.VERCEL === '1') candidate = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return typeof candidate === 'string' && isIP(candidate.trim()) ? candidate.trim() : null;
}

function publicOrigin() {
  const value = process.env.PUBLIC_SITE_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://pedagio-digital.online');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid public site URL');
  return url.origin;
}

module.exports = { clientIP, publicOrigin };
