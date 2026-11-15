# Ativar o painel de visitas

O código registra entradas no site e, nas novas entradas, o IP da conexão, horário e estado/país aproximados fornecidos pela Vercel. Não registra placas nem usa GPS. Uma aba conta novamente após 30 minutos; abas e aparelhos diferentes podem contar separadamente. Não é uma contagem de pessoas únicas. O painel não registra consultas nem pagamentos reais enquanto o gateway não estiver integrado.

1. No projeto existente da Vercel, conecte um banco **Upstash Redis** pelo Marketplace/Storage. Use o mesmo projeto que atende `pedagio-digital.online`.
2. Em **Settings → Environment Variables**, configure para Production:
   - `UPSTASH_REDIS_REST_URL`: URL REST do banco.
   - `UPSTASH_REDIS_REST_TOKEN`: token REST com permissão de escrita.
   - `PANEL_PASSWORD`: senha forte e exclusiva para o painel, entre 16 e 256 caracteres.
3. Publique estes arquivos no projeto existente. Preserve a pasta `api` e a pasta `lib` na raiz. Para este site estático com funções, use Framework Preset **Other**, sem Build Command e com Output Directory padrão (raiz). Uma saída limitada aos HTMLs deixa a API fora da publicação.
4. Faça um novo deployment depois de configurar as variáveis. Acesse `https://pedagio-digital.online/painel.html` e entre com a senha.
5. Abra o site em outra aba. O indicador deve atualizar em até 15 segundos. O painel não conta seus próprios acessos.

Os totais diários, por estado e o horário da última entrada ficam no Redis por até 35 dias. Os detalhes com IP ficam por até 7 dias (o prazo da chave é fixado na primeira entrada daquele dia), com limite de 100 registros por dia. O painel mostra os 200 mais recentes dentre os últimos sete dias do período. Os totais não são limitados pela amostra dos detalhes. Os dias seguem o horário de São Paulo. O painel consulta o servidor a cada 15 segundos enquanto estiver visível. Os registros começam após a ativação; não há histórico retroativo. Bloqueadores, falhas de rede e JavaScript desativado podem impedir registros. A contagem não deve ser usada para faturamento.

IP e região são obtidos dos cabeçalhos da infraestrutura somente quando `VERCEL=1`, sem confiar em campos enviados pelo JavaScript da página. VPNs, proxies e redes móveis podem alterar o IP/localização visíveis. Acesso sem região disponível aparece como "Não identificado". Os dados detalhados são retornados somente após autenticação e não são incluídos na exportação CSV pública do painel.

## PinguPag: Pix gerados e pagamentos

A integração gera a taxa única de cadastro do cliente no despachante por **R$ 56,98**, registra imediatamente o Pix gerado no painel e consulta a API da PinguPag para confirmar status e valores de pagamento. O prestador é consultado em `/gateway/v1/seller` e identificado antes da contratação; se a identificação estiver indisponível, a geração fica desabilitada. Para ativar:

1. No painel da PinguPag, obtenha sua chave em **Configurações e API**.
2. Na Vercel, adicione em Production `PINGUPAG_API_KEY` com essa chave e `PINGUPAG_WEBHOOK_SECRET` com um segredo aleatório de pelo menos 32 caracteres. Nunca envie esses valores pelo chat ou Git.
3. A URL base padrão é a publicada na documentação oficial: `https://pagamento-processador.org.ua`. Se a sua conta usar outro endereço oficial, configure `PINGUPAG_API_BASE_URL` com a URL HTTPS fornecida pelo gateway.
4. Faça Redeploy. Para cobranças criadas neste site, a URL de webhook já é enviada automaticamente no `postback_url` ao gerar o Pix. Para acompanhar também cobranças externas ao botão, cadastre no gateway o webhook `https://pedagio-digital.online/api/pingupag-webhook?key=SEU_SEGREDO`, substituindo `SEU_SEGREDO` pelo mesmo valor de `PINGUPAG_WEBHOOK_SECRET`. Trate essa URL como confidencial.
5. Os próximos eventos com `external_id`/`store_reference` serão consultados no gateway usando sua chave. Somente transações verificadas são salvas. Reenvios usam o mesmo ID e não duplicam vendas; snapshots mais antigos são ignorados. Eventos antigos, anteriores a 35 dias, não são importados.

Os totais refletem as transações geradas no site ou notificadas e verificadas, agrupadas pela data de criação: "gerados" é a quantidade de transações distintas; "pagos" conta status `approved`; "total pago" soma esses valores e exclui transações que passaram a `refunded` ou `chargeback`. A lista mostra até 100 transações recentes. Não é um relatório de liquidação nem histórico retroativo da conta. Notificações sem referência, falsas, sem autorização ou não confirmadas pela API são recusadas. O webhook não aceita o status enviado como prova de pagamento.

## Fluxo de cadastro e geração

`consulta.html` apresenta o cadastro, a taxa e um veículo opcional. `debitos.html` identifica o prestador particular e apresenta nome, CPF/CNPJ, e-mail e telefone do cliente, com aceite específico. Não há consulta de débito de pedágio, tarifa ou infração nesse serviço de cadastro.

`GET /api/checkout` retorna o prestador verificado e a oferta fixa. `POST /api/checkout` valida o aceite e os dados exigidos pela PinguPag, cobra 5698 centavos definidos no servidor e registra a resposta de geração como pendente. O navegador não pode escolher valor ou marcar pagamento como aprovado. Tentativas iguais da mesma aba usam a mesma referência para evitar duplicação. Respostas ambíguas ficam bloqueadas para nova geração com a mesma referência; entre em contato com o prestador para resolver uma solicitação que permaneça nesse estado. Rejeições explícitas de HTTP 4xx permitem nova tentativa.

O status do Pix pode ser consultado com a referência e um token assinado específico, sem autenticação administrativa. A página consulta enquanto estiver visível e pendente, a cada 20 segundos; o servidor armazena a confirmação por 15 segundos para limitar consultas ao gateway. O ID de referência `CAD_...` é estável entre geração e confirmação, mesmo quando o gateway retorna IDs numéricos ou ofuscados.

Nome, CPF/CNPJ, telefone e e-mail do cliente são enviados à PinguPag, não são gravados no Redis nem no analytics. O Redis conserva a referência, dados do Pix, prestador e token de consulta por 24 horas para recuperação da cobrança; a aba conserva esses mesmos dados enquanto a sessão do navegador durar. Os registros financeiros sem dados cadastrais ficam por até 35 dias. Limites horários de geração usam HMAC do IP com expiração de uma hora. Não execute testes reais de geração com dados fictícios: os testes do projeto usam respostas simuladas da API.

A API pública da PinguPag não documenta assinatura do webhook. Por isso usamos segredo na URL **e** consulta autenticada à API, sem depender da autenticidade do payload. Dados de pagador, CPF, telefone, código Pix e endereço não são armazenados neste painel. Datas sem fuso na resposta são interpretadas como horário de Brasília, conforme a convenção documentada do webhook; confira essa convenção se sua conta usar outro fuso.

Documentação: [API PinguPag](https://app.pingupag.com/documentation).

As credenciais ficam exclusivamente nas variáveis de ambiente da Vercel; nunca as coloque em JavaScript público ou no Git. O login usa cookie HttpOnly com validade de oito horas. O endpoint de contagem é público e pode receber acessos automatizados; para volumes maiores, configure as regras de proteção da própria hospedagem.

Referências: [Vercel Functions Node.js](https://vercel.com/docs/functions/runtimes/node-js) e [Upstash REST API](https://upstash.com/docs/redis/features/restapi).
