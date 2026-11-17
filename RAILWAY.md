# Publicar na Railway

O projeto inicia com `npm start` e atende páginas e APIs no mesmo serviço Node.js. Não há comando de build nem dependências externas para instalar. O servidor escuta em `0.0.0.0` usando a variável `PORT` da Railway (8080 quando não configurada). `/healthz` permite verificar se o processo está respondendo.

No serviço **PEDAGIO-**, mantenha o repositório e a branch `main`. Se houver um comando personalizado que inicia apenas um servidor estático, substitua-o por `npm start`. Use Node.js 22 ou 24.

Em **Variáveis**, configure os mesmos valores usados na hospedagem atual, sem colocá-los no GitHub ou no chat:

- `PANEL_PASSWORD`: senha do painel.
- `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`: banco REST do Upstash. Usar o mesmo banco preserva o histórico. Um `REDIS_URL` de Redis comum não substitui estas variáveis REST.
- `PINGUPAG_API_KEY` e `PINGUPAG_WEBHOOK_SECRET`: integração do pagamento. O segredo deve ter pelo menos 32 caracteres.
- `PINGUPAG_API_BASE_URL`: opcional, somente se a conta usar outro endereço oficial do gateway.
- `PUBLIC_SITE_URL`: opcional, URL HTTPS pública escolhida para receber os webhooks, sem caminho. Na ausência, o servidor usa `https://` com `RAILWAY_PUBLIC_DOMAIN`; fora da Railway mantém o domínio atual.

Após a implantação, em **Configurações → Rede / Networking → Rede pública / Public Networking → Gerar domínio / Generate Domain**, gere um endereço para a porta do servidor (8080 se não houver outra `PORT`). Abra esse endereço e confira `/healthz`, as páginas, o login e a atualização do painel antes de migrar o domínio atual.

Na Railway, o IP vem de `X-Real-IP`. A plataforma não fornece os cabeçalhos geográficos da Vercel; a localização fica como “Não identificado”. A contagem de visitas continua funcionando.

Ao migrar um domínio próprio, adicione-o na Railway e configure no provedor de DNS exatamente os registros mostrados pela plataforma. O código, sozinho, não transfere o domínio nem copia variáveis secretas da hospedagem anterior.

Referências: [rede pública](https://docs.railway.com/networking/public-networking), [variáveis](https://docs.railway.com/variables/reference), [cabeçalhos](https://docs.railway.com/networking/public-networking/specs-and-limits).
