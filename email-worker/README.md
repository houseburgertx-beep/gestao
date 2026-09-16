# E-mails das notificações

Este Cloudflare Worker recebe notificações autenticadas pelo Firebase e envia o e-mail ao endereço confirmado no token da pessoa conectada, por um Google Apps Script da conta HOUSE 190. Assim, o envio não depende da cota de leitura do Firestore.

## Configuração

Instale as dependências e grave os três valores protegidos no Cloudflare:

```sh
npm install
npx wrangler secret put GOOGLE_SCRIPT_URL
npx wrangler secret put GOOGLE_SCRIPT_SECRET
```

- `GOOGLE_SCRIPT_URL`: endereço da implantação do Google Apps Script.
- `GOOGLE_SCRIPT_SECRET`: segredo compartilhado com a propriedade `WEBHOOK_SECRET` do Apps Script.

Depois valide e publique:

```sh
npm run check
npm run deploy
```

O endereço do destinatário vem do token autenticado do Firebase. A URL e o segredo do Apps Script ficam armazenados como segredos no Cloudflare e não entram no repositório nem no site público.
