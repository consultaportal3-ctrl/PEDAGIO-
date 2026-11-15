(() => {
  let vehicle;
  try {
    vehicle = JSON.parse(sessionStorage.getItem('consulta-veiculo'));
  } catch {
    vehicle = null;
  }
  const plate = typeof vehicle?.plate === 'string' ? vehicle.plate : '';
  const valid = vehicle?.foreign ? /^[A-Z0-9-]{3,12}$/.test(plate) : /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate);
  if (!valid) {
    window.location.replace('./consulta.html');
    return;
  }
  document.querySelectorAll('[data-plate]').forEach(element => { element.textContent = plate; });
  document.getElementById('license-plate').textContent = !vehicle.foreign && /^[A-Z]{3}[0-9]{4}$/.test(plate) ? `${plate.slice(0,3)}-${plate.slice(3)}` : plate;
  const now = new Date();
  const time = document.getElementById('access-time');
  time.dateTime = now.toISOString();
  time.textContent = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(now);
  document.getElementById('more').addEventListener('click', () => document.getElementById('details').showModal());
  const payment = document.getElementById('payment-preview');
  const copyStatus = document.getElementById('copy-status');
  document.getElementById('open-payment').addEventListener('click', () => {
    copyStatus.textContent = '';
    payment.showModal();
  });
  document.getElementById('copy-demo').addEventListener('click', async () => {
    const code = document.getElementById('demo-code');
    try {
      await navigator.clipboard.writeText(code.value);
      copyStatus.textContent = 'Texto de teste copiado. Ele não é um código Pix.';
    } catch {
      code.focus();
      code.select();
      copyStatus.textContent = 'Selecione e copie o texto manualmente. Ele não é um código Pix.';
    }
  });
  document.getElementById('exit').addEventListener('click', () => {
    try { sessionStorage.removeItem('consulta-veiculo'); } catch {}
  });
})();
