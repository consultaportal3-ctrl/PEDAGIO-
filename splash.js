(() => {
  const config = window.SPLASH_CONFIG || {};
  const destination = (config.destination || '').trim();
  if (!destination) return;

  let target;
  try {
    target = new URL(destination, window.location.href);
  } catch {
    return;
  }
  if (!['http:', 'https:', 'file:'].includes(target.protocol)) return;
  if (target.href === window.location.href) return;

  const duration = Number(config.minimumDurationMs);
  const delay = Number.isFinite(duration) ? Math.max(0, duration) : 1800;
  const redirect = () => {
    window.setTimeout(() => window.location.replace(target.href), delay);
  };

  if (document.readyState === 'complete') redirect();
  else window.addEventListener('load', redirect, { once: true });
})();
