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
        ['pix-generated', 'pix-generated-total', 'pix-paid', 'pix-total', 'pix-average'].forEach(id => { $(id).textContent = '—'; });
        return;
      }
      $('payment-connection').textContent = 'INTEGRAÇÃO CONFIGURADA';
      $('pix-generated').textContent = integer(payments.generated);
      $('pix-generated-total').textContent = Number.isSafeInteger(payments.amountGenerated) ? money(payments.amountGenerated) : '—';
      $('pix-paid').textContent = integer(payments.paid);
      $('pix-total').textContent = money(payments.amountPaid);
      $('pix-average').textContent = payments.paid ? money(payments.amountPaid / payments.paid) : money(0);
      $('payment-status').textContent = payments.generated ? 'Cobranças geradas pelo site e status verificados na PinguPag.' : 'Nenhuma transação registrada neste período. Os Pix gerados pelo botão do cadastro aparecem aqui automaticamente.';
      payments.recent.forEach(row => {
        const tr = document.createElement('tr');
        [row.id, `${date(row.createdAt)} ${time(row.createdAt)}`, money(row.amount), paymentLabels[row.status] || row.status, row.status === 'approved' ? `${date(row.updatedAt)} ${time(row.updatedAt)}` : '—'].forEach((value, index) => {
          const td = document.createElement('td');
          if (index === 3) {
            const badge = document.createElement('span');
            badge.className = 'activity-badge';
            badge.dataset.paymentStatus = row.status;
            badge.textContent = value;
            td.append(badge);
          } else td.textContent = value;
          tr.append(td);
        });
        $('payment-rows').append(tr);
      });
      if (!payments.recent.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.textContent = 'Nenhum Pix gerado neste período.';
        tr.append(td);
        $('payment-rows').append(tr);
      }
    } catch (error) {
      $('payment-connection').textContent = 'FALHA AO ATUALIZAR';
      $('payment-status').textContent = `${error.message} Os indicadores de pagamentos estão indisponíveis.`;
      ['pix-generated', 'pix-generated-total', 'pix-paid', 'pix-total', 'pix-average'].forEach(id => { $(id).textContent = '—'; });
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
    const body = response.status === 204 ? {} : await response.json().catch(() => ({ error: 'API indisponível. Confira a configuração do servidor na hospedagem.' }));
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
    $('clear-today').disabled = true;
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
      const lastVisit = $('period').value === '1' && !data.today ? null : data.lastVisit;
      $('last-visit').textContent = lastVisit ? time(lastVisit) : 'Sem visitas';
      $('last-date').textContent = lastVisit ? date(lastVisit) : 'Aguardando a primeira entrada';
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
      $('clear-today').disabled = false;
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
  $('clear-today').addEventListener('click', async () => {
    if (busy || !loggedIn) return;
    const now = new Date();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    if (!window.confirm(`Limpar todos os registros do painel de hoje (${date(now)} — horário de Brasília)?\n\nSerão apagados visitas, IPs, estados e registros de Pix de hoje. Esta ação não pode ser desfeita. Dias anteriores serão preservados e cobranças na PinguPag não serão canceladas.`)) return;
    busy = true;
    $('clear-today').disabled = true;
    $('refresh').disabled = true;
    $('export').disabled = true;
    $('clear-today').textContent = 'Limpando…';
    $('clear-today-status').dataset.state = 'pending';
    $('clear-today-status').textContent = 'Limpando os registros de hoje…';
    let cleared = false;
    try {
      const response = await fetch('/api/panel-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'clear-today', date: today }) });
      const result = await response.json().catch(() => ({ error: 'Não foi possível limpar os dados. Tente novamente.' }));
      if (response.status === 401) loginRequired();
      if (!response.ok || result.ok !== true) throw new Error(result.error || 'Não foi possível confirmar a limpeza. Atualize o painel e tente novamente.');
      cleared = true;
      data = null;
      $('period').value = '1';
      $('clear-today-status').dataset.state = 'success';
      $('clear-today-status').textContent = 'Registros de hoje apagados. Exibindo somente hoje. O histórico continua nos filtros de 7 e 30 dias; novos acessos e Pix aparecerão normalmente.';
    } catch (error) {
      $('clear-today-status').dataset.state = 'error';
      $('clear-today-status').textContent = error.message;
    }
    finally {
      busy = false;
      $('clear-today').textContent = 'Limpar';
      $('clear-today').disabled = false;
      $('refresh').disabled = false;
      $('export').disabled = !data;
    }
    if (cleared) await refresh();
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
