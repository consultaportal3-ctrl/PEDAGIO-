(() => {
  const $ = id => document.getElementById(id);
  const integer = value => new Intl.NumberFormat('pt-BR').format(value);
  const time = value => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', timeStyle: 'medium' }).format(new Date(value));
  const date = value => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' }).format(new Date(value));
  let data = null;
  let busy = false;
  let loggedIn = false;
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
      $('activity-rows').replaceChildren();
      [...data.daily].reverse().forEach(row => {
        const tr = document.createElement('tr');
        [date(`${row.date}T12:00:00-03:00`), integer(row.visits)].forEach(value => {
          const td = document.createElement('td');
          td.textContent = value;
          tr.append(td);
        });
        $('activity-rows').append(tr);
      });
      $('table-summary').textContent = `${integer(data.total)} visitas nos últimos ${data.daily.length} dias. Dias sem registros aparecem zerados.`;
      $('connection-status').textContent = 'Conectado. O painel atualiza a cada 15 segundos enquanto estiver aberto e visível.';
      $('export').disabled = false;
    } catch (error) {
      data = null;
      $('connection-status').textContent = `${error.message}${loggedIn ? ' Os números exibidos podem estar desatualizados.' : ''}`;
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
  setInterval(() => { if (loggedIn && !document.hidden) refresh(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (loggedIn && !document.hidden) refresh(); });
  refresh();
})();
