# Ativação do GESTAO

## Estado da implementação

A nova aplicação possui módulos persistentes no Firestore, motor financeiro, filtros compartilhados, baixa parcial e estorno rastreável, agenda, projeções, DRE, cadastros, orçamento, plano de ação e conferência/fechamento. Valores monetários são centavos inteiros. A ausência de bases, campos ou cobertura produz DADO PENDENTE.

Os dados existentes permanecem nas coleções anteriores. As páginas anteriores de faturamento, financeiro, fiscal e metas estão preservadas em `/legado/`. A tela Bases oferece leitura e revisão individual antes de importar informações para a estrutura nova; registros sem granularidade ou classificação não são automaticamente rateados.

## Dependência de acesso

O projeto efetivamente utilizado pelo GESTAO é `house-crm-pos-venda`. Na verificação desta tarefa, a conta autenticada no Firebase CLI possuía acesso apenas a `jornada-conveniencia-5jc-a4829`. Portanto, as novas regras não foram implantadas no projeto de produção e nenhum dado produtivo foi modificado.

Uma pessoa administradora do projeto correto deve autenticar a conta autorizada com `firebase login:add` e selecionar essa conta. Em seguida:

```sh
firebase projects:list
firebase deploy --project house-crm-pos-venda --only firestore:rules,firestore:indexes
```

Não modificar `firebaseConfig` para apontar para outro projeto e não criar uma segunda base com dados divergentes. A aplicação falha de forma explícita quando as coleções ainda não estão autorizadas.

## Configuração inicial

1. Conferir o perfil da diretoria: ativo, papel `admin`; o grupo legado usa `tenantId = house190`. Novos grupos devem ter tenantId distinto nos perfis autorizados.
2. Cadastrar empresas com CNPJ real, marcas e unidades. Os IDs são permanentes e não dependem de uma lista fixa no código.
3. Cadastrar contas bancárias/caixas e saldos conciliados com data-base, categorias de DRE e orçamento, centros de custo, fornecedores, produtos e funcionários.
4. Revisar as fontes anteriores e migrar somente dados confirmados, escolhendo a unidade correspondente e preenchendo os campos ausentes. Não continuar lançando o mesmo fato nas duas estruturas depois da transição.
5. Lançar/importar resumos diários por canal OU vendas detalhadas, contas a receber e pagar, estoque inicial/final, compras, folha, impostos e contratos/parcelas. A mesma origem não deve ser representada por um resumo e suas vendas simultaneamente.
6. Cadastrar metas por unidade/canal/período, orçamento e política gerencial versionada. Metas e dados de unidades são agregados pelos filtros de empresa e marca.
7. Conferir a cobertura de cada base/período/unidade. Para a agenda completa e a projeção, conferir recebíveis e obrigações do corte até 90 dias. Estoque e posições patrimoniais exigem as datas-base pertinentes.
8. Validar um fechamento real com a diretoria/contabilidade, sem preencher campos pendentes por estimativa não identificada.

## Fórmulas e limites

Ver `ARQUITETURA.md`. A projeção de faturamento usa média dos dias corridos com cobertura. A projeção de resultado usa a relação líquida/bruta observada e o orçamento de custos do mês completo, identificada como cenário; não é lucro já realizado. O limite de gasto usa o menor valor entre caixa livre e mínimo da projeção de 30 dias, limitado a zero.

Encargos e alíquotas são dados de configuração, nunca valores presumidos. Provisões fiscais podem ser informadas ou calculadas a partir de base/alíquota cadastradas. Folha calcula provisões com parâmetros explícitos. Na classificação de guias já reconhecidas em folha, é necessário evitar lançar a mesma obrigação e custo novamente.

Transferências físicas usam custo, origem e destino; não representam receita do consolidado. A quantidade produzida é registrada por ordem; o CMV efetivo depende das posições valoradas conferidas. A concentração por fornecedor sinaliza investigação de compras, sem atribuir causalidade não demonstrada ao CMV.

## Operação e automações

Os dados da nuvem atualizam as visões em tempo real enquanto a aplicação está aberta. A data de corte é atualizada periodicamente. Compra, imposto, folha ou parcela geram suas obrigações vinculadas em uma transação; o pagamento não gera nova despesa na DRE. Recorrências são materializadas pela quantidade cadastrada, com limite de 120. Não existe alegação de monitoramento em segundo plano sem servidor agendado.

Conectores automáticos novos com bancos, adquirentes, marketplaces e folha não foram credenciados nesta tarefa. A integração anterior com Takeat permanece no módulo anterior; a revisão de granularidade/mapeamento deve preceder a migração. Alertas por e-mail/WhatsApp não são enviados pelas novas rotinas. Automação externa exige configuração e autorização específicas.

## Validação e publicação

```sh
npm ci
npm test
# Requer Firebase CLI e Java 21 disponíveis:
npm run test:rules
npm run build
```

O projeto continua como exportação estática Next.js, com `basePath = /gestao`, adequada ao GitHub Pages. Publicar apenas `out/` na branch `gh-pages`, depois que as novas regras estiverem ativas e os cadastros iniciais conferidos. A publicação não deve ocorrer com novos módulos sem acesso ao banco.

Preservar o conteúdo publicado anterior para retorno. Não publicar caches, logs, credenciais ou dados privados nos artefatos. O diretório `supabase/` é histórico; a aplicação não usa esse schema como banco ativo.
