(() => {
  const form = document.getElementById('consultation-form');
  const plate = document.getElementById('plate');
  const foreign = document.getElementById('foreign');
  const terms = document.getElementById('terms');
  const privacy = document.getElementById('privacy');
  const submit = form.querySelector('[type="submit"]');
  const error = document.getElementById('plate-error');
  const result = document.getElementById('result');
  const validPlate = () => foreign.checked
    ? /^[A-Z0-9-]{3,12}$/.test(plate.value)
    : /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate.value);

  function update() {
    plate.maxLength = foreign.checked ? 12 : 7;
    plate.value = plate.value.toUpperCase().replace(foreign.checked ? /[^A-Z0-9-]/g : /[^A-Z0-9]/g, '').slice(0, plate.maxLength);
    plate.style.letterSpacing = foreign.checked ? '.12em' : '';
    plate.style.textIndent = foreign.checked ? '.12em' : '';
    document.getElementById('vehicle-plate').textContent = plate.value || 'AAA0A00';
    submit.disabled = !((!plate.value || validPlate()) && terms.checked && privacy.checked);
    result.hidden = true;
    error.textContent = '';
    plate.removeAttribute('aria-invalid');
  }
  form.addEventListener('input', update);
  plate.addEventListener('blur', () => {
    if (plate.value && !validPlate()) {
      error.textContent = foreign.checked ? 'Informe uma placa entre 3 e 12 caracteres.' : 'Informe uma placa válida, como ABC1D23 ou ABC1234.';
      plate.setAttribute('aria-invalid', 'true');
    }
  });
  document.getElementById('focus-plate').addEventListener('click', () => plate.focus());
  form.addEventListener('submit', event => {
    event.preventDefault();
    if ((plate.value && !validPlate()) || !terms.checked || !privacy.checked) return;
    try {
      if (plate.value) sessionStorage.setItem('consulta-veiculo', JSON.stringify({ plate: plate.value, foreign: foreign.checked }));
      else sessionStorage.removeItem('consulta-veiculo');
      window.location.assign('./debitos.html');
    } catch {
      result.textContent = 'Permita o armazenamento temporário do navegador para continuar o cadastro.';
      result.hidden = false;
    }
  });

  const dialog = document.getElementById('information');
  const documents = {
    terms: ['Cadastro no despachante', 'Este fluxo permite solicitar um cadastro de cliente junto ao prestador identificado na próxima etapa, mediante taxa única de R$ 56,98. A placa é opcional e fica somente nesta aba. Confira a identificação, o atendimento do prestador e a descrição do serviço na próxima etapa. A contratação exige um aceite específico antes de gerar a cobrança. O pagamento confirma a taxa, e a conclusão do cadastro deve ser acompanhada diretamente com o prestador.'],
    privacy: ['Privacidade dos acessos', 'Para acompanhar acessos e a operação do site, o servidor registra o IP da conexão, o estado aproximado e o horário. Os detalhes ficam disponíveis somente no painel administrativo protegido por senha, por até 7 dias, limitados a 100 registros por dia. Os totais diários e por estado ficam disponíveis por até 35 dias. A localização é aproximada e não utiliza GPS. A placa é mantida temporariamente nesta aba para exibir o veículo na próxima página e não é enviada ao registro de visitas. As demais informações da política e os canais do responsável ainda não foram disponibilizados.'],
    support: ['Atendimento do prestador', 'O nome, o documento e o e-mail de atendimento do prestador são exibidos na próxima etapa, antes de qualquer solicitação de pagamento.']
  };
  document.querySelectorAll('[data-document]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      const [title, copy] = documents[button.dataset.document];
      document.getElementById('dialog-title').textContent = title;
      document.getElementById('dialog-copy').textContent = copy;
      dialog.showModal();
    });
  });
  update();
})();
