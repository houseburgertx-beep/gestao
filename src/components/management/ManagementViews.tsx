"use client";
import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  Calculation,
  Filters,
  calculate,
  outstanding,
} from "@/domain/management/engine";
import {
  currency,
  percent,
  DEFINITIONS,
  CHANNELS,
  str,
  addDays,
  daysBetween,
  monthEnd,
  RecordData,
} from "@/domain/management/model";
import { useManagement } from "@/contexts/ManagementContext";
import { MetricGrid, Kpi, AlertList, Empty } from "./ManagementPage";
import { Tables, RecordTable } from "./RecordTable";
import { LegacyImport } from "./LegacyImport";
export function ExtendedView({
  view,
  result,
  filters,
}: {
  view: string;
  result: Calculation;
  filters: Filters;
}) {
  const { data } = useManagement();
  if (view === "cash")
    return (
      <>
        <MetricGrid
          result={result}
          keys={[
            "bank",
            "operatingReceipts",
            "operatingSpending",
            "cashGeneration",
            "committed",
            "freeCash",
          ]}
        />
        <CashForecast result={result} />
        <Tables
          kinds={["bankAccounts", "transactions", "receivables", "payables"]}
          filters={filters}
        />
      </>
    );
  if (view === "dre")
    return (
      <>
        <MetricGrid
          result={result}
          keys={[
            "net",
            "cmv",
            "ebitda",
            "profit",
            "grossMargin",
            "operatingMargin",
            "margin",
            "breakeven",
          ]}
        />
        <DreTable result={result} filters={filters} />
      </>
    );
  if (view === "revenues")
    return (
      <>
        <MetricGrid
          result={result}
          keys={[
            "gross",
            "goal",
            "goalPct",
            "remaining",
            "projection",
          ]}
        />
        <div className="mg-quick-links">
          <Link href="/metas">Editar metas <ArrowRight size={15} /></Link>
          <Link href="/integracoes/takeat">Configurar Takeat <ArrowRight size={15} /></Link>
        </div>
        <section className="mg-panel">
          <h2>Faturamento por canal</h2>
          <div className="mg-table-wrap">
            <table className="mg-table">
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Bruto</th>
                  <th>Descontos e cancelamentos</th>
                  <th>Receita comercial</th>
                  <th>Pedidos</th>
                  <th>Ticket médio</th>
                </tr>
              </thead>
              <tbody>
                {CHANNELS.map((channel) => {
                  const r = calculate(data, { ...filters, channel });
                  return (
                    <tr key={channel}>
                      <td>{channel}</td>
                      <td>{currency(r.metrics.gross.value)}</td>
                      <td>{currency(r.metrics.deductions.value)}</td>
                      <td>{currency(r.metrics.commercial.value)}</td>
                      <td>{r.metrics.orders.value ?? "DADO PENDENTE"}</td>
                      <td>{currency(r.metrics.ticket.value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <details className="mg-panel mg-collapsible">
          <summary>Outros lançamentos de vendas</summary>
          <p className="mg-method">Use somente para vendas que não vieram da Takeat.</p>
          <Tables kinds={["revenues", "sales"]} filters={filters} />
        </details>
      </>
    );
  if (view === "goals")
    return (
      <>
        <MetricGrid
          result={result}
          keys={[
            "goal",
            "gross",
            "goalPct",
            "remaining",
            "dailyNeeded",
            "projection",
          ]}
        />
        <p className="mg-method">
          Restam {result.remainingDays} dias futuros no calendário informado.
          Sem calendário de operação, o cálculo usa dias corridos. Metas
          comerciais consideram faturamento bruto. Cadastre as metas por
          unidade; empresa e marca são consolidações das unidades selecionadas.
        </p>
        <AlertList result={result} />
        <RecordTable kind="goals" filters={filters} />
      </>
    );
  if (view === "finance")
    return (
      <>
        <MetricGrid
          result={result}
          keys={[
            "receipts",
            "spending",
            "bank",
            "freeCash",
            "payable",
            "overdue",
          ]}
        />
        <p className="mg-method">
          Cadastre o que precisa pagar ou receber. Quando o dinheiro movimentar,
          use o botão “Baixar”.
        </p>
        <Tables
          kinds={[
            "payables",
            "receivables",
            "bankAccounts",
            "transactions",
          ]}
          filters={filters}
        />
      </>
    );
  if (view === "payables")
    return (
      <>
        <div className="mg-grid">
          {[0, 3, 7, 15, 30].map((days) => (
            <Kpi
              key={days}
              label={
                days === 0
                  ? "Vencidos + vencendo hoje"
                  : `Até ${days} dias · inclui vencidos`
              }
              metric={result.amountDue(days)}
            />
          ))}
          <Kpi label="Total vencido" metric={result.metrics.overdue} />
        </div>
        <FinancialCalendar result={result} filters={filters} />
        <RecordTable kind="payables" filters={filters} />
      </>
    );
  if (view === "receivables")
    return (
      <>
        <MetricGrid
          result={result}
          keys={["receivable", "receipts", "cashProjection"]}
        />
        <p className="mg-method">
          Recebíveis vencidos não entram automaticamente como caixa futuro.
          Atualize a previsão após negociar a data de recebimento.
        </p>
        <RecordTable kind="receivables" filters={filters} />
      </>
    );
  if (view === "purchases")
    return (
      <>
        <MetricGrid
          result={result}
          keys={["purchases", "cmv", "cmvPct", "grossMargin"]}
        />
        <p className="mg-method">
          CMV saudável até 35%; atenção acima de 35% até 40%; crítico acima de
          40%. O CMV exige estoque valorado conferido na véspera do início e na
          data de corte. Compras não substituem o consumo.
        </p>
        <PurchasePressure result={result} />
        <Tables
          kinds={[
            "purchases",
            "inventory",
            "transfers",
            "production",
            "products",
            "suppliers",
          ]}
          filters={filters}
        />
      </>
    );
  if (view === "payroll")
    return (
      <>
        <MetricGrid
          result={result}
          keys={[
            "headcount",
            "payroll",
            "personnel",
            "payrollPct",
            "revenuePerEmployee",
            "costPerEmployee",
            "turnover",
            "absenteeism",
            "overtime",
          ]}
        />
        <Tables
          kinds={["employees", "payroll", "attendance"]}
          filters={filters}
        />
      </>
    );
  if (view === "taxes")
    return (
      <>
        <MetricGrid
          result={result}
          keys={["taxesPayable", "committed", "freeCash"]}
        />
        <TaxSummary result={result} filters={filters} />
        <RecordTable kind="taxes" filters={filters} />
      </>
    );
  if (view === "loans")
    return (
      <>
        <MetricGrid
          result={result}
          keys={[
            "debtBalance",
            "monthlyDebtService",
            "interestPaid",
            "debtCommitment",
            "weightedDebtDays",
            "debt",
            "coverage30",
          ]}
        />
        <p className="mg-method">
          Cadastre cada parcela com amortização e juros. O principal reduz a
          dívida, enquanto os juros entram no resultado. O sistema não presume
          taxa, sistema de amortização ou prazo de contratos.
        </p>
        <LoanSummary filters={filters} />
        <Tables kinds={["loans", "loanInstallments"]} filters={filters} />
      </>
    );
  if (view === "indicators")
    return (
      <>
        <MetricGrid
          result={result}
          keys={[
            "cmvPct",
            "payrollPct",
            "marketingPct",
            "taxPct",
            "feesPct",
            "fixedPct",
            "grossMargin",
            "operatingMargin",
            "margin",
            "ebitda",
            "ticket",
            "breakeven",
            "workingCapital",
            "ncg",
            "liquidity",
            "debt",
            "cashGeneration",
            "burn",
            "runway",
            "profitability",
          ]}
        />
        <DreTable result={result} filters={filters} />
      </>
    );
  if (view === "alerts")
    return (
      <>
        <section className="mg-panel">
          <h2>Prioridade por gravidade e impacto conhecido</h2>
          <AlertList result={result} />
        </section>
        <RecordTable kind="actions" filters={filters} filterPeriod={false} />
      </>
    );
  if (view === "comparison") return <Comparison filters={filters} />;
  if (view === "budget")
    return (
      <>
        <section className="mg-panel">
          <h2>Orçado × realizado</h2>
          <div className="mg-table-wrap">
            <table className="mg-table">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Orçado</th>
                  <th>Realizado</th>
                  <th>Diferença</th>
                  <th>Diferença %</th>
                </tr>
              </thead>
              <tbody>
                {result.budgets.map((b) => (
                  <tr key={b.record.id}>
                    <td>
                      {String(
                        data.categories.find(
                          (c) => c.id === b.record.categoryId,
                        )?.name || "DADO PENDENTE",
                      )}
                    </td>
                    <td>{currency(Number(b.record.amount))}</td>
                    <td>{currency(b.actual.value)}</td>
                    <td>
                      {currency(b.actual.value === null ? null : b.difference)}
                    </td>
                    <td>
                      {percent(b.actual.value === null ? null : b.percent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!result.budgets.length && (
            <Empty
              text="DADO PENDENTE"
              detail="Cadastre o orçamento por competência e categoria."
            />
          )}
        </section>
        <RecordTable kind="budgets" filters={filters} />
      </>
    );
  if (view === "closing")
    return (
      <>
        <p className="mg-method">
          O fechamento exige todos os itens conferidos, cobertura das bases, DRE
          e saldo bancário completos. Após fechar, os lançamentos da competência
          ficam bloqueados. Reabra o registro para corrigir o período; a mudança
          fica registrada na auditoria.
        </p>
        <Tables kinds={["closings", "coverage"]} filters={filters} />
      </>
    );
  if (view === "meeting")
    return (
      <>
        <p className="mg-method">
          Selecione “Semana” nos filtros para a reunião. Custos por competência
          permanecem pendentes até a conferência do recorte semanal; não há
          rateio automático.
        </p>
        <MetricGrid
          result={result}
          keys={[
            "gross",
            "goalPct",
            "cmvPct",
            "payrollPct",
            "bank",
            "payable",
            "overdue",
            "cashProjection",
            "projectedProfit",
          ]}
        />
        <Comparison filters={filters} />
        <section className="mg-panel">
          <h2>Problemas críticos e prioridades</h2>
          <AlertList result={result} problemsOnly />
        </section>
        <RecordTable kind="actions" filters={filters} filterPeriod={false} />
      </>
    );
  if (view === "data")
    return (
      <>
        <p className="mg-method">
          Ajuste lojas, contas e integrações. Os controles técnicos ficam
          recolhidos abaixo e só precisam ser usados na implantação ou no
          fechamento contábil.
        </p>
        <div className="mg-quick-links">
          <Link href="/integracoes/takeat">Integração Takeat <ArrowRight size={15} /></Link>
          <Link href="/fornecedores">Fornecedores <ArrowRight size={15} /></Link>
          <Link href="/documentos">Documentos <ArrowRight size={15} /></Link>
        </div>
        <Tables
          kinds={["units", "bankAccounts"]}
          filters={filters}
        />
        <details className="mg-panel mg-collapsible">
          <summary>Configurações avançadas</summary>
          <Tables
            kinds={[
              "companies",
              "brands",
              "categories",
              "costCenters",
              "suppliers",
              "products",
              "positions",
              "policies",
              "coverage",
            ]}
            filters={filters}
          />
        </details>
        <details className="mg-panel mg-collapsible">
          <summary>Importar outros cadastros existentes</summary>
          <LegacyImport />
        </details>
      </>
    );
  return null;
}
function CashForecast({ result }: { result: Calculation }) {
  const [horizon, setHorizon] = useState(30);
  const rows = result.forecast.slice(0, horizon + 1);
  return (
    <section className="mg-panel">
      <div className="mg-section-title">
        <h2>Projeção de caixa</h2>
        <div className="mg-tabs">
          {[7, 15, 30, 60, 90].map((n) => (
            <button
              key={n}
              className={horizon === n ? "active" : ""}
              onClick={() => setHorizon(n)}
            >
              {n} dias
            </button>
          ))}
        </div>
      </div>
      <p className="mg-method mt-4">
        Saldo inicial: {currency(result.metrics.bank.value)} · menor saldo no
        horizonte:{" "}
        {currency(
          rows.every((r) => r.balance !== null)
            ? Math.min(...rows.map((r) => r.balance!))
            : null,
        )}{" "}
        · necessidade de capital:{" "}
        {currency(
          rows.every((r) => r.balance !== null)
            ? Math.max(0, -Math.min(...rows.map((r) => r.balance!)))
            : null,
        )}
      </p>
      {rows.some((r) => r.balance !== null) && (
        <div className="mg-chart">
          <ResponsiveContainer height={230} width="100%">
            <LineChart
              data={rows.map((r) => ({
                ...r,
                balance: r.balance === null ? null : r.balance / 100,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(s) => s.slice(8) + "/" + s.slice(5, 7)}
              />
              <YAxis />
              <Tooltip formatter={(v: number) => currency(v * 100)} />
              <ReferenceLine y={0} stroke="#c84b3c" />
              <Line
                dataKey="balance"
                name="Saldo projetado"
                stroke="#0e766e"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mg-table-wrap mt-4">
        <table className="mg-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Entradas previstas</th>
              <th>Saídas previstas</th>
              <th>Saldo final projetado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date}>
                <td>{r.date.split("-").reverse().join("/")}</td>
                <td>
                  {currency(
                    result.metrics.receivable.value === null
                      ? null
                      : r.incoming,
                  )}
                </td>
                <td>
                  {currency(
                    result.metrics.payable.value === null ? null : r.outgoing,
                  )}
                </td>
                <td>{currency(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function DreTable({
  result,
  filters,
}: {
  result: Calculation;
  filters: Filters;
}) {
  const { data } = useManagement();
  const end = addDays(filters.start, -1),
    start =
      filters.start.slice(8) === "01" && filters.end === monthEnd(filters.end)
        ? end.slice(0, 7) + "-01"
        : addDays(filters.start, -daysBetween(filters.start, filters.end) - 1);
  const previous = calculate(data, { ...filters, start, end });
  return (
    <section className="mg-panel">
      <h2>DRE por competência</h2>
      <p className="mg-method mt-3">
        % sobre receita líquida. Comparação com o período anterior; mês aberto
        ainda está em formação ({start} a {end}). Campos não conferidos
        permanecem pendentes.
      </p>
      <div className="mg-table-wrap mt-4">
        <table className="mg-table">
          <thead>
            <tr>
              <th>Resultado</th>
              <th className="num">Realizado</th>
              <th className="num">% receita líquida</th>
              <th className="num">Período anterior</th>
              <th className="num">Orçado</th>
            </tr>
          </thead>
          <tbody>
            {result.dre.map((line, i) => {
              const categoryIds = data.categories
                .filter((c) => c.dreLine === line.label)
                .map((c) => c.id);
              const budgets = result.budgets.filter((b) =>
                categoryIds.includes(str(b.record, "categoryId")),
              );
              return (
                <tr key={line.label}>
                  <td>{line.label}</td>
                  <td className="num">{currency(line.metric.value)}</td>
                  <td className="num">
                    {percent(
                      line.metric.value !== null &&
                        result.metrics.net.value !== null &&
                        result.metrics.net.value > 0
                        ? (line.metric.value / result.metrics.net.value) * 100
                        : null,
                    )}
                  </td>
                  <td className="num">
                    {currency(previous.dre[i]?.metric.value ?? null)}
                  </td>
                  <td className="num">
                    {currency(
                      budgets.length
                        ? budgets.reduce(
                            (s, b) => s + Number(b.record.amount),
                            0,
                          )
                        : null,
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function RevenueComparisons({ filters }: { filters: Filters }) {
  const { data } = useManagement();
  const today = filters.today;
  const dow = new Date(today + "T12:00:00Z").getUTCDay();
  const weekStart = addDays(today, -((dow + 6) % 7));
  const current = [
    {
      name: "Hoje × ontem",
      start: today,
      end: today,
      previousStart: addDays(today, -1),
      previousEnd: addDays(today, -1),
    },
    {
      name: "Semana × anterior",
      start: weekStart,
      end: today,
      previousStart: addDays(weekStart, -7),
      previousEnd: addDays(today, -7),
    },
    {
      name: "Mês × anterior (mesmos dias)",
      start: today.slice(0, 7) + "-01",
      end: today,
      previousStart: "",
      previousEnd: "",
    },
    {
      name: "Ano × anterior (mesmos dias)",
      start: today.slice(0, 4) + "-01-01",
      end: today,
      previousStart: Number(today.slice(0, 4)) - 1 + "-01-01",
      previousEnd: Number(today.slice(0, 4)) - 1 + today.slice(4),
    },
  ];
  const previousMonth = addDays(today.slice(0, 7) + "-01", -1);
  current[2].previousStart = previousMonth.slice(0, 7) + "-01";
  current[2].previousEnd =
    previousMonth.slice(0, 7) +
    "-" +
    String(
      Math.min(Number(today.slice(8)), Number(previousMonth.slice(8))),
    ).padStart(2, "0");
  return (
    <div className="mg-grid">
      {current.map((p) => {
        const a = calculate(data, { ...filters, start: p.start, end: p.end })
            .metrics.gross,
          b = calculate(data, {
            ...filters,
            start: p.previousStart,
            end: p.previousEnd,
          }).metrics.gross;
        return (
          <Kpi
            key={p.name}
            label={p.name}
            type="percent"
            metric={{
              value:
                a.value !== null && b.value !== null && b.value > 0
                  ? ((a.value - b.value) / b.value) * 100
                  : null,
              partial: null,
              formula: "(Atual − comparável anterior) ÷ anterior × 100",
              missing: [
                ...a.missing,
                ...b.missing,
                ...(b.value === 0
                  ? ["Período anterior sem base positiva"]
                  : []),
              ],
            }}
          />
        );
      })}
    </div>
  );
}
function FinancialCalendar({
  result,
  filters,
}: {
  result: Calculation;
  filters: Filters;
}) {
  const { data } = useManagement();
  const start = filters.start.slice(0, 7) + "-01";
  const end = monthEnd(start);
  const padding = (new Date(start + "T12:00:00Z").getUTCDay() + 6) % 7;
  const days = Number(end.slice(8));
  return (
    <section className="mg-panel">
      <div className="mg-section-title">
        <h2>
          Calendário financeiro · {start.slice(5, 7)}/{start.slice(0, 4)}
        </h2>
        <span>Obrigações abertas por vencimento</span>
      </div>
      <div className="mg-calendar mt-4">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
          <b className="text-xs text-center" key={d}>
            {d}
          </b>
        ))}
        {Array.from({ length: padding }, (_, i) => (
          <div key={"pad" + i} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const date = addDays(start, i);
          const due = result.accounts.filter((r) => r.dueDate === date);
          return (
            <div
              key={date}
              className={
                "mg-calendar-day " + (date === filters.today ? "today" : "")
              }
            >
              <b>{i + 1}</b>
              {due.length ? (
                <>
                  <span>
                    {currency(
                      due.reduce(
                        (s, r) => s + outstanding(r, data, filters.today),
                        0,
                      ),
                    )}
                  </span>
                  <details>
                    <summary className="text-xs">{due.length} títulos</summary>
                    {due.map((r) => (
                      <p className="text-xs whitespace-normal" key={r.id}>
                        {str(r, "description")}
                      </p>
                    ))}
                  </details>
                </>
              ) : (
                <span>
                  {result.metrics.payable.value === null ? "Pendente" : "—"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
function Comparison({ filters }: { filters: Filters }) {
  const { data } = useManagement();
  const [sort, setSort] = useState("profit");
  const units = data.units.filter(
    (u) =>
      !u.archived &&
      (!filters.companyId || u.companyId === filters.companyId) &&
      (!filters.brandId || u.brandId === filters.brandId) &&
      (!filters.group ||
        str(u, "groups")
          .split(",")
          .map((s) => s.trim())
          .includes(filters.group)),
  );
  const rows = units
    .map((unit) => {
      const result = calculate(data, { ...filters, unitId: unit.id });
      const prevEnd = addDays(filters.start, -1),
        prevStart =
          filters.start.slice(8) === "01"
            ? prevEnd.slice(0, 7) + "-01"
            : addDays(
                filters.start,
                -daysBetween(filters.start, filters.end) - 1,
              );
      const elapsed = Math.max(0, daysBetween(filters.start, result.asOf));
      const last =
        addDays(prevStart, elapsed) > prevEnd
          ? prevEnd
          : addDays(prevStart, elapsed);
      const previous = calculate(data, {
        ...filters,
        unitId: unit.id,
        start: prevStart,
        end: last,
      }).metrics.gross.value;
      const growth =
        result.metrics.gross.value !== null && previous !== null && previous > 0
          ? ((result.metrics.gross.value - previous) / previous) * 100
          : null;
      return { unit, result, growth };
    })
    .sort((a, b) => {
      const key = sort === "cash-consumed" ? "cashGeneration" : sort;
      const av =
          sort === "growth"
            ? a.growth
            : a.result.metrics[key as keyof Calculation["metrics"]].value,
        bv =
          sort === "growth"
            ? b.growth
            : b.result.metrics[key as keyof Calculation["metrics"]].value;
      if (av === null) return bv === null ? 0 : 1;
      if (bv === null) return -1;
      return ["cmvPct", "cash-consumed"].includes(sort) ? av - bv : bv - av;
    });
  return (
    <section className="mg-panel">
      <div className="mg-toolbar">
        <h2>Ranking das unidades</h2>
        <select
          aria-label="Ordenar ranking"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          style={{ maxWidth: 280 }}
        >
          <option value="profit">Mais lucrativa</option>
          <option value="growth">Maior crescimento</option>
          <option value="gross">Maior faturamento</option>
          <option value="margin">Melhor margem</option>
          <option value="cmvPct">Melhor CMV</option>
          <option value="cashGeneration">Maior geração de caixa</option>
          <option value="cash-consumed">Maior consumo de caixa</option>
        </select>
      </div>
      <div className="mg-table-wrap">
        <table className="mg-table">
          <thead>
            <tr>
              <th>Unidade</th>
              {[
                "Faturamento",
                "Crescimento comparável",
                "Meta %",
                "CMV %",
                "Folha %",
                "Margem",
                "Lucro",
                "Ticket",
                "Caixa gerado",
              ].map((k) => (
                <th key={k}>{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ unit, result: r, growth }) => (
              <tr key={unit.id}>
                <td>{str(unit, "name")}</td>
                <td>{currency(r.metrics.gross.value)}</td>
                <td>{percent(growth)}</td>
                <td>{percent(r.metrics.goalPct.value)}</td>
                <td>{percent(r.metrics.cmvPct.value)}</td>
                <td>{percent(r.metrics.payrollPct.value)}</td>
                <td>{percent(r.metrics.margin.value)}</td>
                <td>{currency(r.metrics.profit.value)}</td>
                <td>{currency(r.metrics.ticket.value)}</td>
                <td>{currency(r.metrics.cashGeneration.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <Empty
          text="DADO PENDENTE"
          detail="Cadastre as unidades para comparar os resultados."
        />
      )}
    </section>
  );
}
function PurchasePressure({ result }: { result: Calculation }) {
  const { data } = useManagement();
  const ids = new Set(result.units.map((r) => r.id));
  const purchases = data.purchases.filter(
    (r) => !r.archived && ids.has(r.unitId) && str(r, "date") <= result.asOf,
  );
  const map = new Map<string, number>();
  purchases.forEach((r) =>
    map.set(
      str(r, "supplierId"),
      (map.get(str(r, "supplierId")) || 0) + Number(r.amount || 0),
    ),
  );
  const list = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  return (
    <section className="mg-panel">
      <h2>Fornecedores com maior valor de compras registrado</h2>
      <p>
        Concentração de compras é um sinal para investigar; não determina
        sozinha o CMV.
      </p>
      <div className="mg-table-wrap">
        <table className="mg-table">
          <thead>
            <tr>
              <th>Fornecedor</th>
              <th>Compras acumuladas até o corte</th>
            </tr>
          </thead>
          <tbody>
            {list.map(([id, amount]) => (
              <tr key={id}>
                <td>
                  {String(
                    data.suppliers.find((s) => s.id === id)?.name ||
                      "DADO PENDENTE",
                  )}
                </td>
                <td>{currency(amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!list.length && (
        <Empty
          text="DADO PENDENTE"
          detail="Registre compras com fornecedor e produto."
        />
      )}
    </section>
  );
}
function TaxSummary({
  result,
  filters,
}: {
  result: Calculation;
  filters: Filters;
}) {
  const { data } = useManagement();
  const ids = new Set(result.units.map((u) => u.id));
  const taxes = data.taxes.filter(
    (r) =>
      !r.archived &&
      ids.has(r.unitId) &&
      str(r, "competence") >= filters.start.slice(0, 7) &&
      str(r, "competence") <= filters.end.slice(0, 7),
  );
  const taxIds = new Set(taxes.map((t) => t.id));
  const obligations = data.payables.filter(
    (p) =>
      !p.archived && p.sourceKind === "taxes" && taxIds.has(str(p, "sourceId")),
  );
  const total = taxes.reduce((s, t) => s + Number(t.amount), 0);
  const open = obligations.reduce(
    (s, p) => s + outstanding(p, data, result.asOf),
    0,
  );
  const complete = result.metrics.taxesPayable.value !== null;
  return (
    <div className="mg-grid">
      {[
        ["Tributos da competência", total],
        ["Impostos pagos", total - open],
        ["Impostos pendentes", open],
      ].map(([label, value]) => (
        <Kpi
          key={String(label)}
          label={String(label)}
          metric={{
            value: complete ? Number(value) : null,
            partial: Number(value),
            missing: result.metrics.taxesPayable.missing,
            formula: "Guias por competência e obrigações vinculadas",
          }}
        />
      ))}
      <Kpi
        label="Carga tributária / faturamento bruto"
        type="percent"
        metric={{
          value:
            complete &&
            result.metrics.gross.value &&
            result.metrics.gross.value > 0
              ? (total / result.metrics.gross.value) * 100
              : null,
          partial: null,
          missing: [
            ...result.metrics.taxesPayable.missing,
            ...result.metrics.gross.missing,
          ],
          formula:
            "Tributos cadastrados da competência ÷ faturamento bruto × 100",
        }}
      />
    </div>
  );
}
function LoanSummary({ filters }: { filters: Filters }) {
  const { data } = useManagement();
  const selected = data.loanInstallments.filter(
    (r) =>
      !r.archived &&
      (!filters.unitId || r.unitId === filters.unitId) &&
      str(r, "dueDate") >= filters.start &&
      str(r, "dueDate") <= filters.end,
  );
  return (
    <section className="mg-panel">
      <h2>Parcelas do período · valores cadastrados</h2>
      <div className="mg-table-wrap">
        <table className="mg-table">
          <thead>
            <tr>
              <th>Contrato</th>
              <th>Vencimento</th>
              <th>Principal</th>
              <th>Juros</th>
              <th>Total da parcela</th>
            </tr>
          </thead>
          <tbody>
            {selected.map((r) => (
              <tr key={r.id}>
                <td>
                  {String(
                    data.loans.find((l) => l.id === r.loanId)?.contract ||
                      "DADO PENDENTE",
                  )}
                </td>
                <td>{str(r, "dueDate")}</td>
                <td>{currency(Number(r.principal))}</td>
                <td>{currency(Number(r.interest))}</td>
                <td>{currency(Number(r.principal) + Number(r.interest))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
