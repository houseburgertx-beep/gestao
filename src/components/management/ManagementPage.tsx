"use client";
import React, { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  Activity,
  Plus,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Wallet,
  Landmark,
  TrendingUp,
  Database as DatabaseIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { useManagement } from "@/contexts/ManagementContext";
import {
  calculate,
  Calculation,
  Metric,
  Filters,
  healthLabel,
  WEIGHTS,
} from "@/domain/management/engine";
import {
  currency,
  percent,
  dateToday,
  monthEnd,
  addDays,
  RecordData,
  DEFINITIONS,
  CHANNELS,
  str,
} from "@/domain/management/model";
import "./management.css";
import { TakeatConnection } from "./TakeatConnection";
const METRIC_LABELS: Record<string, string> = {
  projectedProfit: "Resultado provável · orçamento",
  marketingPct: "Marketing / receita líquida",
  taxPct: "Impostos / faturamento",
  feesPct: "Taxas / receita líquida",
  fixedPct: "Custos fixos / receita líquida",
  monthlyDebtService: "Parcelas da competência",
  debtCommitment: "Parcelas / faturamento",
  interestPaid: "Juros pagos",
  weightedDebtDays: "Prazo médio da dívida · dias",
  safeSpend: "Limite de gasto · preserva 30 dias",
  gross: "Faturamento",
  net: "Receita líquida",
  receipts: "Recebimentos",
  spending: "Saídas realizadas",
  bank: "Saldo bancário",
  committed: "Dinheiro comprometido",
  freeCash: "Caixa livre real",
  payable: "Contas a pagar",
  receivable: "Contas a receber",
  overdue: "Contas vencidas",
  taxesPayable: "Impostos a pagar",
  payrollPayable: "Folha a pagar",
  purchases: "Compras",
  cmv: "CMV",
  cmvPct: "CMV / receita líquida",
  payroll: "Custo da folha",
  payrollPct: "Folha / receita líquida",
  personnel: "Custo total de pessoal",
  opExpenses: "Despesas operacionais",
  ebitda: "EBITDA gerencial",
  operatingResult: "Resultado operacional",
  profit: "Lucro / prejuízo",
  margin: "Margem líquida",
  breakeven: "Ponto de equilíbrio",
  workingCapital: "Capital de giro líquido",
  ncg: "Necessidade de capital de giro",
  cashProjection: "Projeção de caixa · 30 dias",
  goalPct: "Atingimento da meta",
  goal: "Meta do período",
  remaining: "Falta para a meta",
  dailyNeeded: "Meta diária necessária",
  projection: "Projeção de faturamento",
  cashGeneration: "Geração operacional de caixa",
  debtBalance: "Saldo devedor",
  liquidity: "Liquidez corrente",
  debt: "Endividamento",
  profitability: "Rentabilidade sobre ativos",
  ticket: "Ticket médio",
  orders: "Quantidade de pedidos",
  customers: "Quantidade de clientes",
  headcount: "Funcionários ativos",
  turnover: "Turnover",
  absenteeism: "Absenteísmo",
  revenuePerEmployee: "Faturamento por funcionário",
  costPerEmployee: "Custo por funcionário",
  overtime: "Horas extras",
  burn: "Queima operacional / dia",
  runway: "Runway · dias",
  grossMargin: "Margem bruta",
  operatingMargin: "Margem operacional",
  coverage30: "Cobertura · 30 dias",
};
const PERCENT_KEYS = [
  "marketingPct",
  "taxPct",
  "feesPct",
  "fixedPct",
  "debtCommitment",
  "cmvPct",
  "payrollPct",
  "margin",
  "goalPct",
  "debt",
  "profitability",
  "turnover",
  "absenteeism",
  "grossMargin",
  "operatingMargin",
];
const NUMBER_KEYS = [
  "weightedDebtDays",
  "liquidity",
  "orders",
  "customers",
  "headcount",
  "overtime",
  "runway",
  "coverage30",
];
export function Kpi({
  label,
  metric,
  type = "money",
  emphasis = false,
}: {
  label: string;
  metric: Metric;
  type?: string;
  emphasis?: boolean;
}) {
  const partialRevenue = label === "Faturamento" && metric.value === null && (metric.partial ?? 0) > 0;
  return (
    <div className={"mg-kpi " + (emphasis ? "mg-kpi-featured" : "")}>
      <span className="mg-label">{label}</span>
      <strong
        className={
          metric.value === null
            ? "mg-pending"
            : metric.value < 0
              ? "mg-negative"
              : ""
        }
      >
        {type === "percent"
          ? percent(metric.value)
          : type === "number"
            ? metric.value === null
              ? "DADO PENDENTE"
              : metric.value.toLocaleString("pt-BR", {
                  maximumFractionDigits: 2,
                })
            : currency(partialRevenue ? metric.partial : metric.value)}
      </strong>
      {partialRevenue && <small>PARCIAL · faltam datas ou campos para concluir o período</small>}
      <details>
        <summary>
          {metric.value === null ? "Ver dados necessários" : "Ver cálculo"}
        </summary>
        <p>{metric.formula}</p>
        {metric.missing.slice(0, 8).map((m) => (
          <p key={m}>{m}</p>
        ))}
        {metric.value === null && metric.partial !== null && (
          <p>
            Valor registrado, ainda não conclusivo:{" "}
            {type === "money"
              ? currency(metric.partial)
              : metric.partial.toLocaleString("pt-BR")}
          </p>
        )}
      </details>
    </div>
  );
}
export function MetricGrid({
  result,
  keys,
}: {
  result: Calculation;
  keys: string[];
}) {
  return (
    <div className="mg-grid">
      {keys.map((key) => (
        <Kpi
          key={key}
          label={METRIC_LABELS[key] || key}
          metric={result.metrics[key as keyof Calculation["metrics"]]}
          type={
            PERCENT_KEYS.includes(key)
              ? "percent"
              : NUMBER_KEYS.includes(key)
                ? "number"
                : "money"
          }
        />
      ))}
    </div>
  );
}
export const VIEW_TITLES: Record<string, string> = {
  health: "Visão geral",
  owner: "Resumo do negócio",
  cash: "Fluxo de caixa",
  dre: "DRE gerencial",
  revenues: "Vendas e metas",
  goals: "Metas",
  finance: "Financeiro",
  payables: "Contas a pagar",
  receivables: "Contas a receber",
  purchases: "CMV, compras e estoque",
  payroll: "RH e folha",
  taxes: "Impostos",
  loans: "Empréstimos e dívidas",
  indicators: "Indicadores gerenciais",
  alerts: "Central de alertas",
  comparison: "Comparativo das unidades",
  budget: "Orçamento",
  closing: "Fechamento mensal",
  meeting: "Reunião semanal",
  data: "Ajustes",
};
export function ManagementPage({ view = "health" }: { view?: string }) {
  const { data, errors, loading, allowedUnit, reload, filters, setFilters } =
    useManagement();
  const today = filters.today;
  const result = useMemo(
    () =>
      calculate(data, {
        ...filters,
        unitId: allowedUnit === "all" ? filters.unitId : allowedUnit,
      }),
    [data, filters, allowedUnit],
  );
  const incomplete = loading || Object.keys(errors).length > 0;
  // An unavailable source must never leave previously calculated financial totals looking authoritative.
  if (incomplete) {
    Object.values(result.metrics).forEach((m) => {
      m.value = null;
      m.missing = Array.from(
        new Set([
          ...m.missing,
          loading ? "Carregando bases" : "Leitura das bases indisponível",
        ]),
      );
    });
    result.score = null;
    const due = result.amountDue;
    result.amountDue = (days) => ({
      ...due(days),
      value: null,
      missing: ["Leitura das bases indisponível"],
    });
    result.alerts = result.alerts.filter((a) => a.id === "data-quality");
    result.forecast.forEach((d) => (d.balance = null));
  }
  const change = (key: keyof Filters, value: string) =>
    setFilters((f) => ({
      ...f,
      [key]: value,
      ...(["companyId", "brandId"].includes(key) ? { unitId: "" } : {}),
    }));
  const selectPeriod = (period: string) => {
    let start = today,
      end = today;
    if (period === "month") {
      start = today.slice(0, 7) + "-01";
      end = monthEnd(today);
    }
    if (period === "year") {
      start = today.slice(0, 4) + "-01-01";
      end = today.slice(0, 4) + "-12-31";
    }
    if (period === "week") {
      const weekday = new Date(today + "T12:00:00Z").getUTCDay();
      start = addDays(today, -((weekday + 6) % 7));
      end = addDays(start, 6);
    }
    setFilters((f) => ({ ...f, start, end }));
  };
  return (
    <div className="mg-shell">
      <header className="mg-page-header">
        <div>
          <div className="mg-eyebrow">
            HOUSE 190 <span>/</span> GESTÃO INTEGRADA
          </div>
          <h1>{VIEW_TITLES[view] || view}</h1>
          <p>
            {view === "health"
              ? "As informações mais importantes para decidir hoje."
              : view === "data"
                ? "Lojas, contas e integrações."
              : `Data de corte: ${result.asOf.split("-").reverse().join("/")}`}
          </p>
        </div>
        <div className="mg-header-actions">
          <span className={"mg-sync " + (incomplete ? "is-warning" : "")}>
            {incomplete ? "VERIFICAR DADOS" : "ATUALIZADO"}
          </span>
          <button
            className="mg-icon-button"
            onClick={reload}
            aria-label="Atualizar informações"
          >
            <RefreshCw size={17} />
          </button>
        </div>
      </header>
      {view !== "data" && (
      <section className="mg-filters mg-filters-simple" aria-label="Filtros de gestão">
        <label>
          Unidade
          <select
            value={allowedUnit === "all" ? filters.unitId : allowedUnit}
            disabled={allowedUnit !== "all"}
            onChange={(e) => change("unitId", e.target.value)}
          >
            <option value="">Consolidado do grupo</option>
            {data.units
              .filter(
                (r) =>
                  !r.archived &&
                  (!filters.companyId || r.companyId === filters.companyId) &&
                  (!filters.brandId || r.brandId === filters.brandId),
              )
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {str(r, "name")}
                </option>
              ))}
          </select>
        </label>
        <label>
          Canal
          <select
            value={filters.channel}
            onChange={(e) => change("channel", e.target.value)}
          >
            <option value="">Todos os canais</option>
            {CHANNELS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Mês
          <input
            type="month"
            value={filters.start.slice(0, 7)}
            onChange={(e) => {
              if (e.target.value)
                setFilters((f) => ({
                  ...f,
                  start: e.target.value + "-01",
                  end: monthEnd(e.target.value + "-01"),
                }));
            }}
          />
        </label>
        <div className="mg-periods">
          {[
            ["day", "Hoje"],
            ["week", "Semana"],
            ["month", "Mês"],
            ["year", "Ano"],
          ].map(([p, l]) => (
            <button key={p} onClick={() => selectPeriod(p)}>
              {l}
            </button>
          ))}
        </div>
        <details className="mg-more-filters">
          <summary>Escolher datas específicas</summary>
          <div>
            <label>
              De
              <input type="date" value={filters.start} max={filters.end} onChange={(e) => change("start", e.target.value)} />
            </label>
            <label>
              Até
              <input type="date" value={filters.end} min={filters.start} onChange={(e) => change("end", e.target.value)} />
            </label>
          </div>
        </details>
      </section>
      )}
      {["health", "revenues", "goals"].includes(view) && <TakeatConnection />}
      {Object.keys(errors).length > 0 && (
        <div role="alert" className="mg-notice">
          <AlertTriangle size={20} />
          <div>
            <b>Não foi possível consultar todas as bases de gestão.</b>
            <p>
              Os novos indicadores permanecem como DADO PENDENTE até a conexão e
              as permissões das bases estarem disponíveis.
            </p>
            <details>
              <summary>Detalhes das bases</summary>
              {Object.keys(errors).map((k) => (
                <p key={k}>
                  {DEFINITIONS[k]?.label}: {errors[k]}
                </p>
              ))}
            </details>
          </div>
        </div>
      )}
      {!loading && !data.units.length && (
        <div className="mg-notice">
          <DatabaseIcon size={20} />
          <div>
            <b>Cadastre a estrutura do grupo para começar.</b>
            <p>
              Empresas, marcas e unidades precisam de dados reais. Os cadastros
              anteriores não serão substituídos automaticamente.
            </p>
            <Link href="/bases">
              Abrir bases de gestão <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      )}
      {view === "health" ? (
        <Overview result={result} />
      ) : view === "owner" ? (
        <Owner result={result} />
      ) : (
        <ExtendedView view={view} result={result} filters={filters} />
      )}
      <footer className="mg-footer">
        Valores não informados aparecem como <span>DADO PENDENTE.</span>
      </footer>
    </div>
  );
}
function Overview({ result }: { result: Calculation }) {
  return (
    <>
      <div className="mg-section-title">
        <div>
          <h2>O que você precisa saber</h2>
          <p className="mg-method">Resumo do período selecionado</p>
        </div>
        {result.score !== null && (
          <span className="mg-health-chip">
            Saúde: {healthLabel(result.score)} · {result.score}/100
          </span>
        )}
      </div>
      <MetricGrid
        result={result}
        keys={["gross", "goalPct", "freeCash", "profit", "cmvPct"]}
      />
      <div className="mg-two-columns">
        <section className="mg-panel">
          <div className="mg-section-title">
            <h2>Vendas por dia</h2>
            <span>R$ · registros do período</span>
          </div>
          {result.trend.length ? (
            <div className="mg-chart">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={result.trend}>
                  <defs>
                    <linearGradient
                      id="revenue-fill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#0f766e" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#0f766e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(s) => s.slice(8) + "/" + s.slice(5, 7)}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => currency(v * 100)} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Faturamento"
                    stroke="#0f766e"
                    fill="url(#revenue-fill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty
              text="DADO PENDENTE"
              detail="Registre ou integre o faturamento por dia e canal."
            />
          )}
        </section>
        <section className="mg-panel">
          <div className="mg-section-title">
            <h2>Precisa de atenção</h2>
            <Link href="/alertas">Ver todas</Link>
          </div>
          <AlertList result={result} limit={5} />
        </section>
      </div>
      <section className="mg-quick-links">
        <Link href="/faturamento">Ver vendas e metas <ArrowRight size={15} /></Link>
        <Link href="/financeiro">Ver contas e caixa <ArrowRight size={15} /></Link>
        <Link href="/tarefas">Ver ações <ArrowRight size={15} /></Link>
      </section>
    </>
  );
}
function Owner({ result }: { result: Calculation }) {
  return (
    <>
      <div className="mg-owner-summary">
        <Activity size={26} />
        <div>
          <span>SAÚDE FINANCEIRA</span>
          <h2>
            {result.score === null
              ? "DADO PENDENTE"
              : result.score >= 65
                ? "SAUDÁVEL"
                : result.score >= 50
                  ? "ATENÇÃO"
                  : "CRÍTICA"}
          </h2>
        </div>
      </div>
      <MetricGrid
        result={result}
        keys={[
          "gross",
          "ebitda",
          "profit",
          "bank",
          "committed",
          "freeCash",
          "safeSpend",
        ]}
      />
      <div className="mg-grid">
        <Kpi
          label="Devemos nos próximos 7 dias (com vencidos)"
          metric={result.amountDue(7)}
        />
        <Kpi
          label="Devemos nos próximos 30 dias (com vencidos)"
          metric={result.amountDue(30)}
        />
      </div>
      <MetricGrid
        result={result}
        keys={[
          "cmvPct",
          "payrollPct",
          "margin",
          "goalPct",
          "breakeven",
          "projection",
          "projectedProfit",
        ]}
      />
      <section className="mg-panel">
        <h2>Os 5 principais problemas que precisam da sua atenção hoje</h2>
        <AlertList result={result} limit={5} problemsOnly />
      </section>
    </>
  );
}
export function AlertList({
  result,
  limit,
  problemsOnly = false,
}: {
  result: Calculation;
  limit?: number;
  problemsOnly?: boolean;
}) {
  const list = result.alerts
    .filter((a) => !problemsOnly || a.severity !== "healthy")
    .slice(0, limit);
  return list.length ? (
    <div className="mg-alerts">
      {list.map((a) => (
        <div className={"mg-alert " + a.severity} key={a.id}>
          <span className="mg-dot" />
          <div>
            <strong>
              {a.id === "data-quality" ? "Faltam informações para fechar o resultado" : a.title}
            </strong>
            <p>
              {a.id === "data-quality"
                ? "Existem dias ou informações financeiras que ainda não foram preenchidos."
                : a.detail}
            </p>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <Empty
      text="Nenhum alerta com os dados disponíveis"
      detail="Confira a completude das bases antes de concluir que a operação está saudável."
    />
  );
}
export function Empty({ text, detail }: { text: string; detail: string }) {
  return (
    <div className="mg-empty">
      <DatabaseIcon size={26} />
      <strong>{text}</strong>
      <p>{detail}</p>
    </div>
  );
}
// Loaded separately so the executive page and all management modules share the same calculation engine.
import { ExtendedView } from "./ManagementViews";
