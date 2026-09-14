# GESTAO — arquitetura do sistema de gestão

Versão 1 · 14/09/2026 · Repositório houseburgertx-beep/gestao

## 1. Princípios e arquitetura

Resultado por competência, caixa por liquidação e compromissos por vencimento são visões separadas do mesmo conjunto de fatos. Nenhum saldo, crescimento, alíquota ou projeção é inventado. Ausência de dados é DADO PENDENTE. Um zero só é conclusivo após confirmação de cobertura da base no período e no escopo analisado.

Preservar Next.js/React/TypeScript, Firebase Authentication, Firestore e publicação existente no GitHub Pages. O README antigo menciona Supabase, mas a aplicação efetiva usa Firebase. Não criar uma segunda fonte de verdade nem migrar dados automaticamente.

Fluxo: formulários/importações → validação → documentos normalizados no Firestore → motor financeiro puro → seletores de período/escopo → indicadores, DRE, calendário, alertas, ranking e reunião. Cadastros e operações são persistidos na nuvem; preferências visuais podem ficar no navegador. Falhas de leitura/escrita devem aparecer e não podem virar sucesso ou conjunto vazio confirmado.

Novas coleções possuem prefixo gestao_. Manter adaptadores de leitura para coleções legadas; nunca copiar uma base inteira silenciosamente. Registros sem granularidade diária/canal não podem ser rateados por suposição. Não reutilizar valores derivados de metas como faturamento realizado.

## 2. Modelo de dados e relacionamentos

Todas as bases usam id único, tenantId (grupo), createdAt/By, updatedAt/By, version, origem e status de cancelamento. Datas civis em YYYY-MM-DD, competência em YYYY-MM, fuso America/Bahia; moeda BRL armazenada em centavos inteiros. Quantidades físicas podem ter casas decimais. Percentuais são parâmetros explícitos. Ausente e zero são valores distintos.

| Base                | Principais campos e relações                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empresas            | razão social, nome, CNPJ informado, regime, tenantId                                                                                                    |
| Marcas              | nome, tenantId; uma marca pode abranger várias empresas                                                                                                 |
| Unidades            | companyId, brandId, nome, código, tipo loja/central, ativa                                                                                              |
| Grupos de unidades  | nome, unitIds; agrupamento analítico sem duplicar unidades                                                                                              |
| Centros de custo    | nome, unidade, operação/cozinha/atendimento/administrativo/marketing/delivery/manutenção/central/diretoria/outros                                       |
| Categorias          | nome, subcategoria, linha DRE, fixa/variável, natureza operacional/investimento/financiamento                                                           |
| Fornecedores        | identidade, contatos, dados fiscais e pagamentos; cadastro existente preservado                                                                         |
| Contas bancárias    | banco, conta, empresa, unidade, saldo conciliado e data-base; inclui caixa físico                                                                       |
| Faturamento diário  | unitId, data, canal, bruto, descontos, cupons, cashback, cancelamentos, taxas, pedidos, clientes; fonte e chave externa                                 |
| Vendas              | unitId, data, canal, documento externo único, valores; detalhe transacional alternativo ao resumo do mesmo dia/canal                                    |
| Movimentações       | unitId, conta, data efetiva, entrada/saída, valor, natureza, categoria, centro, competência, obrigação/venda de origem                                  |
| Contas a pagar      | unitId, fornecedor, categoria, centro, descrição, competência, vencimento, valor, parcela/grupo, recorrência, origem; saldo em aberto deriva das baixas |
| Contas a receber    | unitId, cliente/origem/canal, competência, vencimento, valor, venda de origem; saldo em aberto deriva das liquidações                                   |
| Impostos            | empresa/unidade, tipo, competência, base/alíquota quando disponíveis, valor, vencimento; obrigação vinculada                                            |
| Funcionários        | empresa/unidade, cargo/setor, admissão/desligamento, salário, contrato, benefícios, status                                                              |
| Folha               | funcionário/unidade/competência, salário, benefícios, encargos patronais, comissões, serviço, extras e provisões; obrigação vinculada                   |
| Frequência          | funcionário, data, horas previstas, ausência e horas extras                                                                                             |
| Produtos            | código, nome, categoria, unidade de medida, estoque mínimo                                                                                              |
| Compras             | fornecedor/unidade/produto, data, quantidade, custo, descontos/devoluções, documento, obrigação vinculada                                               |
| Estoque             | unidade/produto/data, quantidade/custo ou posição valorada; abertura e fechamento conferidos                                                            |
| Transferências      | origem, destino, produto, quantidade, custo, data; duas pontas com mesmo transferId                                                                     |
| Produção            | central, data, produto, quantidade, custo consumido e custo produzido; sem receita fictícia                                                             |
| Empréstimos         | empresa/unidade, banco, contrato, principal, saldo devedor na data-base, prazo, parcelas, juros                                                         |
| Parcelas da dívida  | loanId, competência, vencimento, amortização, juros, obrigação vinculada                                                                                |
| Metas               | unidade/empresa/marca/canal, início/fim, frequência, valor, supermeta; sem somar metas sobrepostas                                                      |
| Orçamento           | unidade/categoria/competência, valor; chave única do escopo                                                                                             |
| Plano de ação       | problema, ação, responsável, prazo, status, alerta de origem                                                                                            |
| Fechamento mensal   | unidade/mês, checklist, estado aberto/conferência/fechado, autor/data; alterações posteriores exigem reabertura                                         |
| Cobertura dos dados | unidade/base/canal, início/fim, conferido por/em; permite confirmar inclusive períodos sem movimento                                                    |
| Política gerencial  | limites, pesos, metas de CMV/folha/margem, parâmetros fiscais/pessoal por empresa e vigência                                                            |
| Auditoria           | entidade/id, operação, usuário, data, versão anterior/nova; escrita vinculada à operação                                                                |

Relações: grupo 1:N empresas; empresa 1:N unidades; marca 1:N unidades; unidades N:M grupos analíticos. Venda 1:N recebíveis; recebível 1:N recebimentos. Compra/imposto/folha/parcela 1:1 obrigação principal; obrigação 1:N pagamentos. Funcionário 1:N folhas e frequências. Empréstimo 1:N parcelas. Produtos 1:N compras/estoque/transferências/produção.

Integridade: validar IDs e escopo; bloquear documentos duplicados, valores inválidos e liquidação superior ao saldo; operações vinculadas em lote/transação. Cancelar em vez de apagar registros contábeis. Identidade externa por fonte+unidade+documento impede reimportação. Conflitos de edição devem ser detectados por versão. Rateios exigem critério cadastrado; não distribuir despesas compartilhadas automaticamente.

## 3. Filtros e períodos

Filtros combináveis: empresa, unidade, marca, grupo, canal, data inicial/final; atalhos dia, semana, mês, ano. Semana começa segunda-feira. Resultado considera competência; caixa realizado considera liquidação; agenda considera vencimento. Posições são explicitamente datadas. Em mês aberto, realizado até a data de corte não se compara ao mês anterior inteiro sem aviso; comparar também os mesmos dias corridos. Receita mensal sem dia confirmado só serve para mês completo, nunca para hoje ou semana.

Central de produção participa dos custos/caixa, mas não recebe meta comercial automaticamente. Consolidados eliminam transferências internas e não contam valores comuns várias vezes. Sem rateio/identificação de canal, despesas e saldo não podem ser atribuídos a um canal: indicador fica pendente para esse recorte.

## 4. Indicadores e fórmulas

| Indicador                          | Fórmula / pré-requisito                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Receita bruta                      | soma das vendas ou resumos completos, nunca ambos para a mesma origem                                                                                               |
| Receita líquida                    | bruto − descontos − cupons − cashback − cancelamentos − impostos sobre vendas; taxas comerciais destacadas na DRE                                                   |
| Recebimentos                       | entradas efetivamente liquidadas no período; mostrar operacional separado de aportes/empréstimos                                                                    |
| Ticket médio                       | receita comercial líquida de descontos/cancelamentos ÷ pedidos; pedidos ausentes/zero → pendente                                                                    |
| Crescimento                        | (realizado atual − comparável anterior) ÷ anterior × 100; anterior zero → sem base comparável                                                                       |
| Meta %                             | realizado ÷ meta × 100; meta zero/ausente → pendente                                                                                                                |
| Valor faltante                     | max(0, meta − realizado)                                                                                                                                            |
| Meta diária necessária             | faltante ÷ dias operacionais restantes; sem calendário usar dias corridos explicitamente                                                                            |
| Projeção de receita                | média diária do período com cobertura × dias do período; sem cobertura suficiente → pendente                                                                        |
| CMV                                | estoque inicial + compras líquidas + transferências recebidas − enviadas − estoque final; perdas incluídas no consumo são detalhadas, não somadas duas vezes        |
| CMV %                              | CMV ÷ receita líquida × 100                                                                                                                                         |
| Lucro bruto                        | receita líquida − CMV                                                                                                                                               |
| Custo de pessoal                   | remuneração + benefícios + encargos patronais + provisões incrementais; retenções do empregado não são custo patronal extra                                         |
| Férias mensais                     | base elegível ÷ 12; adicional de 1/3 = provisão de férias ÷ 3; 13º = base elegível ÷ 12; evitar duplicação quando valores já estiverem reconhecidos                 |
| FGTS e encargos                    | base elegível × alíquota cadastrada por contrato/empresa/vigência; ausente → pendente, sem presumir enquadramento                                                   |
| Folha %                            | custo total de pessoal ÷ receita líquida × 100; apresentar denominador explicitamente                                                                               |
| Resultado operacional antes de D&A | lucro bruto − despesas operacionais − pessoal; usar nome EBITDA apenas quando D&A for segregada                                                                     |
| Resultado operacional              | resultado antes de D&A − depreciação/amortização                                                                                                                    |
| Lucro líquido gerencial            | resultado operacional − despesas financeiras − juros + receitas financeiras − tributos sobre lucro                                                                  |
| Margens                            | resultado correspondente ÷ receita líquida × 100                                                                                                                    |
| Saldo bancário                     | saldo conciliado na data-base + movimentos posteriores até a data de corte; evitar contar movimentos anteriores novamente                                           |
| Contas em aberto                   | valor devido − liquidações até a data de corte; canceladas excluídas                                                                                                |
| Contas vencidas                    | saldo aberto com vencimento anterior à data de corte                                                                                                                |
| Comprometido                       | obrigações e provisões abertas no horizonte indicado, deduplicadas por origem; prazo padrão 30 dias, vencidos incluídos                                             |
| Caixa livre real                   | saldo bancário − comprometido; recebíveis não são dinheiro disponível                                                                                               |
| Fluxo projetado                    | saldo inicial + recebíveis futuros − obrigações futuras; cenários com vendas ainda não contratadas ficam separados                                                  |
| Falta de caixa                     | primeira data com saldo projetado negativo; necessidade = max(0, −menor saldo)                                                                                      |
| Cobertura futura                   | (caixa + recebíveis no horizonte) ÷ obrigações no horizonte; exibir 7/15/30/60/90 dias                                                                              |
| Geração operacional                | recebimentos operacionais − pagamentos operacionais                                                                                                                 |
| Burn rate                          | max(0, −geração operacional) ÷ dias observados; unidade R$/dia                                                                                                      |
| Runway                             | caixa livre real ÷ burn rate diário; geração positiva → não aplicável; caixa negativo → zero dias                                                                   |
| Ponto de equilíbrio                | despesas fixas ÷ índice de margem de contribuição; contribuição = receita líquida − custos/despesas variáveis; índice ≤0 → operação não atinge equilíbrio nesse mix |
| Capital de giro líquido            | ativo circulante − passivo circulante; sem todas as posições → pendente                                                                                             |
| NCG operacional                    | recebíveis operacionais + estoque + outros ativos operacionais − fornecedores − passivos operacionais; excluir caixa e dívida financeira                            |
| Liquidez corrente                  | ativo circulante ÷ passivo circulante                                                                                                                               |
| Endividamento                      | passivos totais ÷ ativos totais; sem balanço → pendente                                                                                                             |
| Rentabilidade                      | lucro do período ÷ ativo médio do período; requer posições comparáveis                                                                                              |
| Faturamento por funcionário        | receita ÷ quadro médio ativo do período                                                                                                                             |
| Turnover                           | ((admissões + desligamentos) ÷ 2) ÷ quadro médio × 100                                                                                                              |
| Absenteísmo                        | horas ausentes ÷ horas previstas × 100                                                                                                                              |
| Orçamento                          | realizado por competência − orçado; desvio % = diferença ÷ orçado × 100                                                                                             |

## 5. DRE e comparativos

Linhas: receita bruta; deduções detalhadas; impostos sobre vendas; receita líquida; CMV; lucro bruto; folha; encargos/provisões; aluguel; energia; marketing; taxas; administrativas; outras operacionais; resultado antes de D&A; D&A; resultado operacional; despesas financeiras; juros; tributos sobre lucro; resultado líquido.

Mostrar R$, % da receita líquida, orçamento e período anterior, além de colunas por unidade. Compras não são automaticamente CMV. Pagamento de principal não é despesa na DRE. Aporte não é receita. Imposto/folha/compra vinculado ao contas a pagar não deve virar nova despesa ao pagar. Receita e recebimento são eventos distintos.

## 6. Score e alertas

Score = soma(peso × nota do componente) ÷ 100. Pesos: liquidez 15, geração de caixa 15, endividamento 10, margem 10, CMV 10, folha 10, atrasos 10, cobertura de 30 dias 10, metas 5, rentabilidade 5. Notas normalizadas 0–100 com faixas publicadas e limites configuráveis. Política é uma escolha gerencial versionada, não uma verdade universal nem estimativa tributária. Política não cadastrada, componente indisponível ou período sem cobertura → score DADO PENDENTE; mostrar quais componentes faltam, sem redistribuir os pesos.

Classificação: 80–100 Excelente; 65–79 Saudável; 50–64 Atenção; 30–49 Crítico; 0–29 Emergência. O Painel do Dono agrupa Excelente/Saudável como Saudável, Atenção como Atenção e Crítico/Emergência como Crítica.

CMV usa faixas solicitadas: ≤35% saudável; >35% até 40% atenção; >40% crítico. Folha e margens precisam de política definida. Alertas ordenados por criticidade, prazo e impacto monetário conhecido: caixa negativo, vencidos, impostos/folha próximos, CMV, meta em risco, orçamento excedido e completude. Não afirmar problema financeiro quando o que falta é informação. Cada alerta fornece origem, escopo, data de cálculo e acesso ao lançamento/ação.

## 7. Telas e navegação

Saúde do Negócio: leitura executiva, score, três blocos Resultado/Caixa/Compromissos, tendências, próximos vencimentos e ranking. Painel do Dono: indicadores essenciais do pedido e cinco prioridades reais, sem preencher posições vazias com problemas fictícios.

Faturamento e metas: canais, comparáveis, projeção e ritmo necessário. Financeiro: entradas/saídas por natureza e competência. Contas a pagar/receber: títulos, baixas e agenda. Calendário financeiro: dias, vencidos e acumulados de hoje/3/7/15/30 dias. Caixa: tabela diária e horizontes até 90 dias. DRE: linhas e comparativos.

Compras/estoque/produção: cadastros, posições e transferências a custo. Pessoas/folha: custo completo, frequência e provisões. Impostos: provisão, obrigação e pagamentos. Dívidas: contratos, amortização e juros. Orçamento: categorias e desvios. Indicadores/comparativo: métricas por unidade. Central de alertas: prioridades e plano de ação. Fechamento: checklist e bloqueio. Reunião: período semanal, desempenho, caixa e responsáveis. Bases: cadastros e cobertura. Arquitetura/metodologia: fórmulas e política consultáveis.

## 8. Automações e consistência

1. Recalcular visões após snapshots de dados, alteração de filtro e mudança de data; não salvar cards como fatos primários.
2. Criar imposto, folha, compra ou parcela e sua obrigação vinculada de forma atômica, com chave determinística.
3. Baixar título com movimento ligado à origem e conta; permitir parcial e detectar excesso; conciliação confirma saldo.
4. Recorrências/parcelas geram agenda finita conforme quantidade cadastrada, preservando centavos e último dia de mês.
5. Provisões de folha/fiscal calculadas exclusivamente com base e parâmetros confirmados, registrando competência/vigência.
6. Alertas são derivados das bases, com IDs estáveis; planos de ação permanecem persistidos.
7. Fechamento exige checklist integral e bases conferidas; reabrir é operação registrada. Períodos fechados não aceitam novos fatos retroativos sem reabertura.
8. Importação legada exige revisão de mapeamentos e cobertura. Nunca interpretar o retorno vazio de uma falha como ausência de obrigações.
9. Sem serviço agendado configurado, cálculos ocorrem ao abrir/atualizar a aplicação; não alegar monitoramento em segundo plano. Notificações externas exigem serviço e autorização específicos.

## 9. Segurança e implantação

Autenticação existente e grupo/unidade no perfil; consultas e regras limitadas ao grupo e unidades autorizadas. Diretoria/administração pode consolidar; gestão vê sua unidade; escrita restrita por papel. Regras do cliente não substituem regras do Firestore. Regras novas e índices devem ser implantados e testados antes de disponibilizar gravações na produção. Não ampliar acesso por conveniência.

Preservar o endereço GitHub Pages fornecido pelo usuário. Implementar e testar antes de publicar. Separar código pronto, base configurada e produção publicada no relatório final. Dados históricos não são transformados sem revisão; CNPJs e endereços demonstrativos devem ser retirados das visualizações confiáveis.

Testes obrigatórios do motor: nenhuma base; zero confirmado; competência versus pagamento; recebimento parcial; deduplicação; parcelas; virada de mês/ano; transferências internas; consolidado e canal; caixa negativo; score incompleto; divisão por zero; mês fechado; conflito de edição. Build TypeScript/Next e verificação das rotas completam a validação.

Referências conceituais: [CPC 03 — Fluxos de caixa](https://www.cpc.org.br/CPC/Documentos-Emitidos/Pronunciamentos/Pronunciamento?Id=34); [Sebrae — controle de estoque](https://sebrae.com.br/Sebrae/Portal%20Sebrae/Anexos/Artigo%20t%C3%A9cnico%2036%20-%20Controle%20de%20estoque.pdf). Este desenho é gerencial; parâmetros fiscais e trabalhistas precisam refletir os cadastros reais de cada empresa.
