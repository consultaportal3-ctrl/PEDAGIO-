(() => {
  const $ = id => document.getElementById(id);
  const integer = value => new Intl.NumberFormat('pt-BR').format(value);
  const time = value => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', timeStyle: 'medium' }).format(new Date(value));
  const date = value => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' }).format(new Date(value));
  $('panel-date').textContent = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full' }).format(new Date());
  function updateNavigation() {
    const hash = window.location.hash || '#overview';
    document.querySelectorAll('.sidebar nav a').forEach(link => {
      const active = link.getAttribute('href') === hash;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  window.addEventListener('hashchange', updateNavigation);
  updateNavigation();
  let data = null;
  let busy = false;
  let loggedIn = false;
  const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  const paymentLabels = { pending: 'Aguardando pagamento', approved: 'Pago', processing: 'Processando', under_review: 'Em análise', failed: 'Não concluído', refunded: 'Devolvido', chargeback: 'Contestado' };
  async function refreshPayments() {
    try {
      const response = await fetch(`/api/payments?days=${$('period').value}`, { cache: 'no-store' });
      const payments = await response.json();
      if (!response.ok) throw new Error(payments.error || 'Pagamentos indisponíveis.');
      $('payment-rows').replaceChildren();
      if (!payments.configured) {
        $('payment-connection').textContent = 'AGUARDANDO INTEGRAÇÃO';
        $('payment-status').textContent = 'Configure a chave da PinguPag e o webhook na hospedagem para receber os registros reais.';
        ['pix-generated', 'pix-paid', 'pix-total', 'pix-average'].forEach(id => { $(id).textContent = '—'; });
        return;
      }
      $('payment-connection').textContent = 'INTEGRAÇÃO CONFIGURADA';
      $('pix-generated').textContent = integer(payments.generated);
      $('pix-paid').textContent = integer(payments.paid);
      $('pix-total').textContent = money(payments.amountPaid);
      $('pix-average').textContent = payments.paid ? money(payments.amountPaid / payments.paid) : money(0);
      $('payment-status').textContent = payments.generated ? 'Cobranças geradas pelo site e status verificados na PinguPag.' : 'Nenhuma transação registrada neste período. Os Pix gerados pelo botão do cadastro aparecem aqui automaticamente.';
      payments.recent.forEach(row => {
        const tr = document.createElement('tr');
        [row.id, `${date(row.createdAt)} ${time(row.createdAt)}`, paymentLabels[row.status] || row.status, money(row.amount)].forEach(value => {
          const td = document.createElement('td');
          td.textContent = value;
          tr.append(td);
        });
        $('payment-rows').append(tr);
      });
    } catch (error) {
      $('payment-connection').textContent = 'FALHA AO ATUALIZAR';
      $('payment-status').textContent = `${error.message} Os indicadores de pagamentos estão indisponíveis.`;
      ['pix-generated', 'pix-paid', 'pix-total', 'pix-average'].forEach(id => { $(id).textContent = '—'; });
      $('payment-rows').replaceChildren();
    }
  }
  function loginRequired() {
    loggedIn = false;
    data = null;
    $('dashboard').hidden = true;
    $('logout').hidden = true;
    $('login-card').hidden = false;
  }
  async function api(options) {
    const response = await fetch(`/api/visits?days=${$('period').value}`, { cache: 'no-store', ...options });
    const body = response.status === 204 ? {} : await response.json().catch(() => ({ error: 'API indisponível. Publique as funções na Vercel.' }));
    if (!response.ok) {
      if (response.status === 401) loginRequired();
      throw new Error(body.error || 'Não foi possível carregar as visitas.');
    }
    return body;
  }
  async function refresh() {
    if (busy) return;
    busy = true;
    $('refresh').disabled = true;
    $('export').disabled = true;
    try {
      const result = await api();
      if (!Array.isArray(result.daily)) throw new Error('Resposta inválida do servidor de visitas.');
      data = result;
      loggedIn = true;
      $('login-card').hidden = true;
      $('dashboard').hidden = false;
      $('logout').hidden = false;
      $('visits').textContent = integer(data.total);
      $('today').textContent = integer(data.today);
      $('last-visit').textContent = data.lastVisit ? time(data.lastVisit) : 'Sem visitas';
      $('last-date').textContent = data.lastVisit ? date(data.lastVisit) : 'Aguardando a primeira entrada';
      $('updated-at').textContent = `Atualizado às ${time(data.updatedAt)}`;
      $('recent-rows').replaceChildren();
      (data.recent || []).forEach(row => {
        const tr = document.createElement('tr');
        [`${date(row.at)} ${time(row.at)}`, row.ip || 'Não disponível', 'Entrada no site', row.location].forEach((value, index) => {
          const td = document.createElement('td');
          if (index === 2) {
            const badge = document.createElement('span');
            badge.className = 'activity-badge';
            badge.textContent = value;
            td.append(badge);
          } else td.textContent = value;
          tr.append(td);
        });
        $('recent-rows').append(tr);
      });
      if (!data.recent?.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.textContent = 'Nenhum acesso com detalhes registrado. Os novos acessos aparecerão aqui.';
        tr.append(td);
        $('recent-rows').append(tr);
      }
      $('state-bars').replaceChildren();
      (data.locations || []).forEach(row => {
        const container = document.createElement('div');
        const label = document.createElement('div');
        label.className = 'state-label';
        const name = document.createElement('span');
        name.textContent = row.name;
        const count = document.createElement('strong');
        count.textContent = integer(row.visits);
        label.append(name, count);
        const track = document.createElement('div');
        track.className = 'bar-track';
        const fill = document.createElement('div');
        fill.className = 'bar-fill';
        fill.style.width = `${Math.min(100, row.visits / Math.max(1, data.locations[0].visits) * 100)}%`;
        track.append(fill);
        container.append(label, track);
        $('state-bars').append(container);
      });
      if (!data.locations?.length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'A localização estará disponível para os novos acessos.';
        $('state-bars').append(empty);
      }
      $('connection-status').textContent = 'Conectado ao servidor de registros.';
      $('connection-status').dataset.state = 'connected';
      $('export').disabled = false;
      await refreshPayments();
    } catch (error) {
      data = null;
      $('connection-status').textContent = `${error.message}${loggedIn ? ' Os números exibidos podem estar desatualizados.' : ''}`;
      $('connection-status').dataset.state = 'error';
    } finally {
      busy = false;
      $('refresh').disabled = false;
    }
  }
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    $('login-button').disabled = true;
    try {
      await api({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', password: $('password').value }) });
      $('password').value = '';
      await refresh();
    } catch (error) { $('connection-status').textContent = error.message; }
    finally { $('login-button').disabled = false; }
  });
  $('logout').addEventListener('click', async () => {
    try {
      await api({ method: 'DELETE' });
      loginRequired();
      $('connection-status').textContent = 'Você saiu do painel.';
    } catch (error) { $('connection-status').textContent = error.message; }
  });
  $('period').addEventListener('change', refresh);
  $('refresh').addEventListener('click', refresh);
  $('export').addEventListener('click', () => {
    if (!data) return;
    const csv = '\uFEFFDia;Visitas\r\n' + data.daily.map(row => `${row.date};${row.visits}`).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'visitas-site.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('export-status').textContent = 'Visitas exportadas.';
  });
  $('live-updates').addEventListener('change', () => {
    $('live-status').textContent = $('live-updates').checked ? 'Atualiza a cada 15 s' : 'Atualização pausada';
    if ($('live-updates').checked && loggedIn) refresh();
  });
  setInterval(() => { if (loggedIn && !document.hidden && $('live-updates').checked) refresh(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (loggedIn && !document.hidden && $('live-updates').checked) refresh(); });
  refresh();
})();
