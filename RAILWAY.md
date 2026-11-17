# Publicar na Railway

O projeto inicia com `npm start` e atende páginas e APIs no mesmo serviço Node.js. A Railway instala as dependências com o `package-lock.json`; não há comando de build. O servidor escuta em `0.0.0.0` usando a variável `PORT` da Railway (8080 quando não configurada). `/healthz` permite verificar se o processo está respondendo.

No serviço **PEDAGIO-**, mantenha o repositório e a branch `main`. Se houver um comando personalizado que inicia apenas um servidor estático, substitua-o por `npm start`. Use Node.js 22 ou 24.

Em **Variáveis**, configure os mesmos valores usados na hospedagem atual, sem colocá-los no GitHub ou no chat:

- `PANEL_PASSWORD`: senha do painel.
- `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`: banco REST do Upstash. Usar o mesmo banco preserva o histórico. Um `REDIS_URL` de Redis comum não substitui estas variáveis REST.
- `PINGUPAG_API_KEY` e `PINGUPAG_WEBHOOK_SECRET`: integração do pagamento. O segredo deve ter pelo menos 32 caracteres.
- `PINGUPAG_API_BASE_URL`: opcional, somente se a conta usar outro endereço oficial do gateway.
- `PUBLIC_SITE_URL`: opcional, URL HTTPS pública escolhida para receber os webhooks, sem caminho. Na ausência, o servidor usa `https://` com `RAILWAY_PUBLIC_DOMAIN`; fora da Railway mantém o domínio atual.

Após a implantação, em **Configurações → Rede / Networking → Rede pública / Public Networking → Gerar domínio / Generate Domain**, gere um endereço para a porta do servidor (8080 se não houver outra `PORT`). Abra esse endereço e confira `/healthz`, as páginas, o login e a atualização do painel antes de migrar o domínio atual.

Na Railway, o IP vem de `X-Real-IP`. O país e o estado dos novos acessos são consultados localmente na base DB-IP City Lite, lida com `mmdb-lib`. O script `postinstall` baixa e valida a edição mensal diretamente de `download.db-ip.com` durante a instalação, antes de a aplicação atender visitantes; a edição anterior é usada se a atual ainda não estiver disponível. A base fica em `data/geoip.mmdb`, fora do Git e das rotas públicas. Não é necessário configurar chave nem enviar IPs a uma API externa. Só país e região são gravados, além dos campos já existentes. Os nomes dos estados brasileiros são convertidos para siglas para alimentar a distribuição por estado. A base é carregada uma vez por processo; IPs desconhecidos ou falhas na base não impedem a contagem. Registros anteriores sem localização continuam como “Não identificado”. Na Vercel, os cabeçalhos geográficos originais continuam sendo usados.

A localização representa a rede e pode diferir do local real, sobretudo com VPNs e redes móveis. Para renovar a base em uma instalação existente, execute `npm run geoip:update` e reinicie o processo; uma nova instalação também baixa a edição mensal. Na Railway, se o build reutilizar o cache de dependências, faça Redeploy sem cache para renová-la. A base DB-IP Lite é distribuída sob [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), com atribuição no painel a [DB-IP](https://db-ip.com/db/lite.php). Os dados são mantidos no formato MMDB original; o painel exibe apenas país e região, sem coordenadas. A base usa cerca de 130 MB de memória por processo; não configure múltiplos workers sem dimensionar a memória.

Ao migrar um domínio próprio, adicione-o na Railway e configure no provedor de DNS exatamente os registros mostrados pela plataforma. O código, sozinho, não transfere o domínio nem copia variáveis secretas da hospedagem anterior.

Referências: [rede pública](https://docs.railway.com/networking/public-networking), [variáveis](https://docs.railway.com/variables/reference), [cabeçalhos](https://docs.railway.com/networking/public-networking/specs-and-limits).
