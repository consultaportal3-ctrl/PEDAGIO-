(() => {
  const states = [];
  const activities = [];
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const integer = value => new Intl.NumberFormat('pt-BR').format(value);
  const period = document.getElementById('period');
  const stateFilter = document.getElementById('state-filter');
  const statusFilter = document.getElementById('status-filter');
  states.forEach(state => {
    const option = document.createElement('option');
    option.value = state.uf;
    option.textContent = `${state.name} (${state.uf})`;
    stateFilter.append(option);
  });
  const filtered = () => activities.filter(row => (stateFilter.value === 'all' || row.uf === stateFilter.value) && (statusFilter.value === 'all' || row.status === statusFilter.value));

  function renderRows() {
    const rows = filtered();
    const tbody = document.getElementById('activity-rows');
    tbody.replaceChildren();
    rows.forEach(row => {
      const tr = document.createElement('tr');
      [row.id, row.uf, row.status, row.value ? money(row.value) : '—'].forEach((value, index) => {
        const td = document.createElement('td');
        if (index === 2) {
          const badge = document.createElement('span');
          badge.className = `activity-badge${row.status === 'Teste pendente' ? ' pending' : ''}`;
          badge.textContent = value;
          td.append(badge);
        } else td.textContent = value;
        tr.append(td);
      });
      tbody.append(tr);
    });
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = 'Nenhuma atividade registrada.';
      tr.append(td);
      tbody.append(tr);
    }
    document.getElementById('table-summary').textContent = `${rows.length} de ${activities.length} registros fictícios · Período ilustrativo: últimos ${period.value} dias.`;
  }

  function render() {
    const multiplier = period.value === '30' ? 4 : 1;
    const visits = states.reduce((sum, state) => sum + state.visits, 0) * multiplier;
    const queries = activities.filter(row => row.status === 'Consulta simulada').length;
    const payments = activities.filter(row => row.status === 'Pagamento de teste').length;
    document.getElementById('visits').textContent = integer(visits);
    document.getElementById('queries').textContent = integer(queries);
    document.getElementById('payments').textContent = integer(payments);
    document.getElementById('revenue').textContent = money(activities.filter(row => row.status === 'Pagamento de teste').reduce((sum, row) => sum + row.value, 0));
    const bars = document.getElementById('state-bars');
    bars.replaceChildren();
    if (!states.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Nenhuma visita registrada por estado.';
      bars.append(empty);
    }
    states.forEach(state => {
      const container = document.createElement('div');
      const label = document.createElement('div');
      label.className = 'state-label';
      const name = document.createElement('span');
      name.textContent = `${state.name} · ${state.uf}`;
      const count = document.createElement('strong');
      count.textContent = integer(state.visits * multiplier);
      label.append(name, count);
      const track = document.createElement('div');
      track.className = 'bar-track';
      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.style.width = `${state.visits / states[0].visits * 100}%`;
      track.append(fill);
      container.append(label, track);
      bars.append(container);
    });
    const funnel = document.getElementById('funnel');
    funnel.replaceChildren();
    [['Visitas simuladas', visits], ['Consultas simuladas', queries], ['Pagamentos de teste', payments]].forEach(([name, value]) => {
      const row = document.createElement('div');
      row.className = 'funnel-row';
      const label = document.createElement('span');
      label.textContent = name;
      const total = document.createElement('strong');
      total.textContent = integer(value);
      row.append(label, total);
      funnel.append(row);
    });
    renderRows();
  }
  period.addEventListener('change', render);
  stateFilter.addEventListener('change', renderRows);
  statusFilter.addEventListener('change', renderRows);
  document.getElementById('export').addEventListener('click', () => {
    const rows = [['DEMONSTRACAO - DADOS FICTICIOS'], ['Registro ficticio', 'Estado de exemplo', 'Atividade', 'Valor simulado'], ...filtered().map(row => [row.id, row.uf, row.status, row.value.toFixed(2)])];
    const csv = '\uFEFF' + rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'painel-exemplo-dados-ficticios.csv';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    document.getElementById('export-status').textContent = 'Arquivo de exemplo exportado. Todos os registros são fictícios.';
  });
  render();
})();
