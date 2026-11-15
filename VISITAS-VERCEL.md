# Ativar o painel de visitas

O código registra entradas no site, sem enviar IP, placa, localização ou identificadores pessoais. Uma aba conta novamente após 30 minutos; abas e aparelhos diferentes podem contar separadamente. Não é uma contagem de pessoas únicas. O painel não registra consultas nem pagamentos.

1. No projeto existente da Vercel, conecte um banco **Upstash Redis** pelo Marketplace/Storage. Use o mesmo projeto que atende `pedagio-digital.online`.
2. Em **Settings → Environment Variables**, configure para Production:
   - `UPSTASH_REDIS_REST_URL`: URL REST do banco.
   - `UPSTASH_REDIS_REST_TOKEN`: token REST com permissão de escrita.
   - `PANEL_PASSWORD`: senha forte e exclusiva para o painel, entre 16 e 256 caracteres.
3. Publique estes arquivos no projeto existente. Preserve a pasta `api` e a pasta `lib` na raiz. Para este site estático com funções, use Framework Preset **Other**, sem Build Command e com Output Directory padrão (raiz). Uma saída limitada aos HTMLs deixa a API fora da publicação.
4. Faça um novo deployment depois de configurar as variáveis. Acesse `https://pedagio-digital.online/painel.html` e entre com a senha.
5. Abra o site em outra aba. O indicador deve atualizar em até 15 segundos. O painel não conta seus próprios acessos.

Os totais diários e o horário da última entrada ficam no Redis por até 35 dias. Os dias seguem o horário de São Paulo. O painel consulta o servidor a cada 15 segundos enquanto estiver visível. Os registros começam após a ativação; não há histórico retroativo. Bloqueadores, falhas de rede e JavaScript desativado podem impedir registros. A contagem não deve ser usada para faturamento.

As credenciais ficam exclusivamente nas variáveis de ambiente da Vercel; nunca as coloque em JavaScript público ou no Git. O login usa cookie HttpOnly com validade de oito horas. O endpoint de contagem é público e pode receber acessos automatizados; para volumes maiores, configure as regras de proteção da própria hospedagem.

Referências: [Vercel Functions Node.js](https://vercel.com/docs/functions/runtimes/node-js) e [Upstash REST API](https://upstash.com/docs/redis/features/restapi).
