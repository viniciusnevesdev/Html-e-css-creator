# UI Builder backup Worker

Este Worker mantém o bucket R2 privado. Ele recebe somente snapshots JSON já validados e guarda as últimas cinco versões em `backups/`.

## Configuração manual necessária

1. No Cloudflare, crie um bucket R2 privado, por exemplo `ui-builder-backups`.
2. Copie `wrangler.example.toml` para `wrangler.toml`; informe seu subdomínio Cloudflare real em `routes`.
3. Publique o Worker e associe o binding `UI_BUILDER_BACKUPS` ao bucket.
4. Em **Zero Trust → Access controls → Applications**, crie uma aplicação **Self-hosted** para o mesmo hostname. Crie uma política **Allow** somente para o seu e-mail e habilite One-time PIN ou seu provedor de identidade.
5. Em **Additional settings → CORS**, permita a origem `https://viniciusnevesdev.github.io`, métodos `GET, POST, OPTIONS`, cabeçalho `content-type` e credenciais.
6. Abra `https://SEU_HOSTNAME/health` no Safari, autentique-se no Cloudflare Access e, no UI Builder, toque em **Backup → Gerenciar** e informe `https://SEU_HOSTNAME`.

Não crie nem exponha Access Key, Secret Key, API Token do R2 ou token administrativo no navegador, GitHub Pages, repositório ou localStorage.
