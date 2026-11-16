(() => {
  const $ = id => document.getElementById(id);
  let seller = null;
  let order = null;
  let checking = false;
  let savedOrder = null;
  try { savedOrder = JSON.parse(sessionStorage.getItem('cadastro-order')); } catch {}
  if (!window.CadastroSession.read() && !savedOrder?.reference) {
    window.location.replace('./cadastro.html?expired=1');
    return;
  }
  const states = { pending: 'Aguardando pagamento.', processing: 'Pagamento em processamento.', under_review: 'Pagamento em análise.', approved: 'Pagamento confirmado. Entre em contato com o prestador para acompanhar seu cadastro.', failed: 'Cobrança encerrada ou não concluída. Entre em contato com o prestador.', refunded: 'Pagamento devolvido.', chargeback: 'Pagamento contestado.' };
  let vehicle;
  try { vehicle = JSON.parse(sessionStorage.getItem('consulta-veiculo')); } catch {}
  const plate = typeof vehicle?.plate === 'string' ? vehicle.plate : '';
  const valid = vehicle?.foreign ? /^[A-Z0-9-]{3,12}$/.test(plate) : /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate);
  if (valid) {
    document.querySelectorAll('[data-plate]').forEach(element => { element.textContent = plate; });
    $('license-plate').textContent = /^[A-Z]{3}[0-9]{4}$/.test(plate) ? `${plate.slice(0, 3)}-${plate.slice(3)}` : plate;
    $('vehicle-summary').hidden = false;
    $('vehicle-sidebar').hidden = false;
  }
  const now = new Date();
  $('access-time').dateTime = now.toISOString();
  $('access-time').textContent = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(now);
  async function responseData(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Serviço indisponível. Tente novamente.');
    return data;
  }
  function showOrder(open = true) {
    $('pix-code').value = order.qrCode;
    const image = $('pix-image');
    const qrStatus = $('payment-qr-status');
    qrStatus.hidden = true;
    function showLocalQr() {
      try {
        image.onerror = () => {
          image.hidden = true;
          qrStatus.textContent = 'Não foi possível exibir a imagem. Use o código Pix copia e cola abaixo.';
          qrStatus.hidden = false;
        };
        image.src = window.pixQrDataUrl(order.qrCode);
        image.hidden = false;
      } catch {
        image.hidden = true;
        qrStatus.textContent = 'QR Code indisponível. Use o código Pix copia e cola abaixo.';
        qrStatus.hidden = false;
      }
    }
    if (typeof order.qrImage === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(order.qrImage)) {
      image.onerror = showLocalQr;
      image.src = order.qrImage;
      image.hidden = false;
    } else showLocalQr();
    $('payment-state').textContent = states[order.status] || 'Aguardando confirmação do gateway.';
    $('checkout-status').textContent = 'Pix gerado. A cobrança foi registrada no painel e aguarda confirmação do pagamento.';
    $('reopen-payment').hidden = false;
    $('generate-pix').disabled = true;
    if (open && !$('payment-preview').open) $('payment-preview').showModal();
  }
  async function checkPayment() {
    if (!order || checking) return;
    checking = true;
    $('check-payment').disabled = true;
    try {
      const data = await fetch(`/api/checkout?reference=${encodeURIComponent(order.reference)}`, { cache: 'no-store', headers: { Authorization: `Bearer ${order.token}` } }).then(responseData);
      order.status = data.status;
      try { sessionStorage.setItem('cadastro-order', JSON.stringify(order)); } catch {}
      $('payment-state').textContent = states[order.status] || 'Aguardando confirmação do gateway.';
      $('checkout-status').textContent = states[order.status] || 'Aguardando confirmação do gateway.';
    } catch (error) { $('payment-state').textContent = `${error.message} O pagamento ainda não foi confirmado nesta página.`; }
    finally { checking = false; $('check-payment').disabled = false; }
  }
  $('checkout-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!seller || order) return;
    $('generate-pix').disabled = true;
    $('checkout-status').textContent = 'Gerando sua cobrança. Aguarde nesta página…';
    try {
      const customer = window.CadastroSession.read();
      if (!customer) { window.location.assign('./cadastro.html?expired=1'); return; }
      let requestId = sessionStorage.getItem('cadastro-request-id');
      if (!requestId) { requestId = crypto.randomUUID(); sessionStorage.setItem('cadastro-request-id', requestId); }
      order = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, accepted: true, sellerName: seller.name, customer })
      }).then(responseData);
      try { sessionStorage.setItem('cadastro-order', JSON.stringify(order)); } catch {}
      window.CadastroSession.clear();
      showOrder();
    } catch (error) { $('checkout-status').textContent = error.message; }
    finally { $('generate-pix').disabled = Boolean(order); }
  });
  $('reopen-payment').addEventListener('click', () => showOrder());
  $('check-payment').addEventListener('click', checkPayment);
  $('copy-pix').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('pix-code').value); $('copy-status').textContent = 'Código Pix copiado.'; }
    catch { $('pix-code').focus(); $('pix-code').select(); $('copy-status').textContent = 'Selecione e copie o código manualmente.'; }
  });
  $('exit').addEventListener('click', () => { try { sessionStorage.removeItem('consulta-veiculo'); } catch {} });
  setInterval(() => { if (!document.hidden && order && ['pending', 'processing', 'under_review'].includes(order.status)) checkPayment(); }, 20000);
  async function start() {
    try {
      const offer = await fetch('/api/checkout', { cache: 'no-store' }).then(responseData);
      seller = offer.seller;
      $('offer-status').textContent = 'Cadastro preenchido. Para gerar o Pix, aceite a taxa de cadastro no botão acima.';
      $('generate-pix').disabled = false;
      try {
        const stored = savedOrder;
        if (stored && /^CAD_/.test(stored.reference) && typeof stored.token === 'string' && typeof stored.qrCode === 'string' && stored.seller?.name === seller.name) { order = stored; showOrder(); checkPayment(); }
        else if (!window.CadastroSession.read()) window.location.replace('./cadastro.html?expired=1');
      } catch {}
    } catch (error) { $('offer-status').textContent = error.message; }
  }
  start();
})();
