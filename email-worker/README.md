# E-mails das notificações

Este Cloudflare Worker recebe notificações autenticadas pelo Firebase e envia e-mails pelo Google Apps Script da conta HOUSE 190. Diretoria (`admin`) e financeiro (`accountant`) recebem avisos gerais e tarefas concluídas. Gerentes recebem somente novas tarefas da própria unidade. Operadores não recebem e-mails.

## Configuração

Instale as dependências e grave os dois valores protegidos no Cloudflare:

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

A diretoria sincroniza a lista de usuários ao abrir o painel e a cada hora pelo endpoint autenticado `/notifications/directory`. A lista é consultada no Firestore com as permissões da diretoria e fica no KV `NOTIFICATION_DIRECTORY`. Falhas de sincronização preservam a última lista válida. Os eventos usam essa lista, sem ler o Firestore a cada envio. Usuários inativos são excluídos.

O HTML usa tabelas e estilos inline para Gmail e dispositivos móveis. Avisos de caixa e tarefas são disparados após o salvamento confirmado; RH verifica prazos enquanto o painel está aberto. A rotina de RH com o painel fechado ainda não está configurada.

A URL e o segredo do Apps Script ficam armazenados como segredos no Cloudflare e não entram no site público. Anexos continuam privados no Google Drive.
