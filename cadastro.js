(() => {
  const $ = id => document.getElementById(id);
  const current = window.CadastroSession.read();
  const ids = { name: 'registration-name', email: 'registration-email', document: 'registration-document', phone: 'registration-phone' };
  if (current) Object.entries(ids).forEach(([field, id]) => { $(id).value = current[field]; });
  if (new URLSearchParams(window.location.search).has('expired')) $('registration-status').textContent = 'Seu cadastro temporário expirou. Preencha os dados para continuar.';
  $('registration-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!$('registration-terms').checked) return;
    try {
      window.CadastroSession.save(Object.fromEntries(Object.entries(ids).map(([field, id]) => [field, $(id).value])));
      if (!current || current.document !== window.CustomerFields.digits($('registration-document').value)) {
        sessionStorage.removeItem('cadastro-order');
        sessionStorage.removeItem('cadastro-request-id');
        sessionStorage.removeItem('consulta-veiculo');
      }
      window.location.assign('./consulta.html');
    } catch (error) { $('registration-status').textContent = error.message || 'Permita o armazenamento temporário desta aba para continuar.'; }
  });
  function information(title, copy) {
    $('info-title').textContent = title;
    $('info-copy').textContent = copy;
    $('registration-info').showModal();
  }
  $('open-conditions').addEventListener('click', () => information('Condições do cadastro', 'Você está preenchendo seus dados para solicitar um cadastro no serviço de despachante. Em seguida, pode informar a placa e conferir a identificação do prestador. A taxa única de R$ 56,98 será apresentada para um aceite específico antes de gerar o Pix. O pagamento confirma a taxa; o andamento do cadastro deve ser acompanhado com o prestador.'));
  $('open-privacy').addEventListener('click', () => information('Uso dos dados', 'Nome, CPF/CNPJ, e-mail e telefone são mantidos temporariamente nesta aba por até 30 minutos para preencher o pedido de Pix. Você pode corrigi-los voltando a esta etapa. São enviados à PinguPag somente ao solicitar a cobrança e removidos desta etapa após a geração. O painel armazena referência, valor e situação da transação, sem esses dados cadastrais. Os acessos registram IP e estado aproximado por até 7 dias, com totais agregados por até 35 dias. O prestador e seu contato serão identificados antes de pagar.'));
})();
