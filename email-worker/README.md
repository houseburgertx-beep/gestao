# E-mails das notificações

Este Cloudflare Worker recebe notificações autenticadas pelo Firebase e envia o e-mail pelo Resend.

## Configuração

Instale as dependências e grave os três valores protegidos no Cloudflare:

```sh
npm install
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
npx wrangler secret put EMAIL_TO
```

- `RESEND_API_KEY`: chave criada no painel do Resend.
- `EMAIL_FROM`: remetente validado no Resend, por exemplo `HOUSE 190 <avisos@seudominio.com>`.
- `EMAIL_TO`: um ou mais destinatários separados por vírgula.

Depois valide e publique:

```sh
npm run check
npm run deploy
```

O endereço do destinatário e a chave do Resend ficam armazenados como segredos no Cloudflare e não entram no repositório nem no site público.
