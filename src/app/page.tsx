"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  TrendingUp,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  DollarSign,
  Users,
  CheckSquare,
  ShieldAlert,
} from "lucide-react";
import { useUnit } from "@/contexts/UnitContext";
import { store } from "@/services/store";
import { MetricCard } from "@/components/ui/MetricCard";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { formatCurrency, formatPercent, formatDate } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function DashboardPage() {
  const { currentUnit, activeUnitData, filterByUnit } = useUnit();
  const [period, setPeriod] = useState<"7d" | "30d" | "month" | "year">("30d");
  const [, setTick] = useState(0);

  useEffect(() => {
    const handleUpdate = () => setTick((t) => t + 1);
    window.addEventListener("house190_data_updated", handleUpdate);
    return () => window.removeEventListener("house190_data_updated", handleUpdate);
  }, []);

  const accounts = filterByUnit(store.getAccounts());
  const goals = filterByUnit(store.getGoals());
  const revenues = filterByUnit(store.getRevenues());
  const tasks = filterByUnit(store.getTasks());
  const taxes = filterByUnit(store.getTaxes());
  const employees = filterByUnit(store.getEmployees());

  // Metrics Calculations
  const pendingApprovals = accounts.filter((a) => a.status === "pending_approval");
  const pendingApprovalTotal = pendingApprovals.reduce((acc, cur) => acc + cur.finalAmount, 0);

  const overdueAccounts = accounts.filter((a) => a.status === "overdue");
  const overdueTotal = overdueAccounts.reduce((acc, cur) => acc + cur.finalAmount, 0);

  const todayBahia = new Date(Date.now() - 3 * 3600000).toISOString().split("T")[0];
  const scheduledToday = accounts.filter(
    (a) => a.dueDate === todayBahia && a.status !== "paid" && a.status !== "canceled"
  );
  const scheduledTodayTotal = scheduledToday.reduce((acc, cur) => acc + cur.finalAmount, 0);

  const next7Days = accounts.filter(
    (a) => a.dueDate > "2026-09-07" && a.dueDate <= "2026-09-14" && a.status !== "paid" && a.status !== "canceled"
  );
  const next7DaysTotal = next7Days.reduce((acc, cur) => acc + cur.finalAmount, 0);

  const totalPayablesMonth = accounts
    .filter((a) => a.status !== "canceled")
    .reduce((acc, cur) => acc + cur.finalAmount, 0);

  // Revenue & Goals
  const totalMonthRevenue = goals.reduce((acc, cur) => acc + cur.currentRealized, 0);
  const totalMonthTarget = goals.reduce((acc, cur) => acc + cur.targetAmount, 0);
  const totalMonthPrevious = goals.reduce((acc, cur) => acc + cur.previousMonthRealized, 0);
  const goalPercent = totalMonthTarget > 0 ? (totalMonthRevenue / totalMonthTarget) * 100 : 0;
  const growthVsLastMonth =
    totalMonthPrevious > 0
      ? ((totalMonthRevenue - totalMonthPrevious) / totalMonthPrevious) * 100
      : 0;

  // Chart Data derivado estritamente dos faturamentos reais da base
  const chartData = React.useMemo(() => {
    const byDate: Record<string, { date: string; total: number }> = {};
    for (const r of revenues) {
      if (!byDate[r.date]) {
        const parts = r.date.split("-");
        byDate[r.date] = {
          date: `${parts[2] || r.date}/${parts[1] || ""}`,
          total: 0,
        };
      }
      byDate[r.date].total += r.netRevenue;
    }
    return Object.values(byDate).slice(-7);
  }, [revenues]);

  // Atenção Necessária items
  const attentionItems = [];
  if (pendingApprovals.length > 0) {
    attentionItems.push({
      id: "att-appr",
      text: `${pendingApprovals.length} pagamentos aguardando aprovação (${formatCurrency(pendingApprovalTotal)})`,
      link: "/financeiro?tab=aprovacoes",
      type: "warning",
    });
  }
  const upcomingTaxes = taxes.filter((t) => t.status === "pending_payment" || t.status === "upcoming");
  if (upcomingTaxes.length > 0) {
    attentionItems.push({
      id: "att-tax",
      text: `${upcomingTaxes.length} guias fiscais vencem nos próximos dias`,
      link: "/fiscal",
      type: "warning",
    });
  }
  const overdueTasks = tasks.filter((t) => t.status !== "done" && t.status !== "canceled" && t.dueDate < "2026-09-07");
  if (overdueTasks.length > 0) {
    attentionItems.push({
      id: "att-task",
      text: `${overdueTasks.length} tarefas prioritárias estão em atraso`,
      link: "/tarefas",
      type: "danger",
    });
  }
  // Alerta de metas apenas quando meta definida for > 0
  const lowUnits = goals.filter((g) => g.targetAmount > 0 && (g.projectedClose || 0) < g.targetAmount);
  for (const g of lowUnits) {
    attentionItems.push({
      id: `att-goal-${g.unitId}`,
      text: `Unidade ${g.unitId} está abaixo da meta mensal definida`,
      link: "/metas",
      type: "warning",
    });
  }

  return (
    <div className="space-y-6">
      {/* Title & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-200/60 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Visão Geral da Operação
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {activeUnitData.id === "all"
              ? "Consolidação executiva de todas as 4 unidades House 190"
              : `Painel central exclusivo da unidade ${activeUnitData.name}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-400">Competência:</span>
          <span className="px-2.5 py-1 text-xs font-semibold bg-white border border-zinc-200 rounded-md text-zinc-800 shadow-2xs dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-200">
            Setembro / 2026
          </span>
        </div>
      </div>

      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Faturamento do Mês */}
        <MetricCard
          label="FATURAMENTO DO MÊS"
          value={formatCurrency(totalMonthRevenue)}
          context={`+12,4% vs mês anterior`}
          trend={{
            value: "+12,4%",
            isPositive: true,
          }}
          progress={{
            percent: goalPercent,
            subtext: `${formatPercent(goalPercent)} da meta atingida`,
          }}
        />

        {/* Meta do Mês */}
        <MetricCard
          label="META CONSOLIDADA"
          value={formatCurrency(totalMonthTarget)}
          context={`Faltam ${formatCurrency(Math.max(0, totalMonthTarget - totalMonthRevenue))}`}
          progress={{
            percent: goalPercent,
            subtext: `Projeção: ${formatCurrency(totalMonthRevenue * 3.8)}`,
          }}
        />

        {/* Contas a Pagar */}
        <MetricCard
          label="CONTAS A PAGAR (SETEMBRO)"
          value={formatCurrency(totalPayablesMonth)}
          context={
            overdueAccounts.length > 0
              ? `${overdueAccounts.length} vencida (${formatCurrency(overdueTotal)})`
              : "Nenhuma conta em atraso"
          }
          trend={
            overdueAccounts.length > 0
              ? { value: `${overdueAccounts.length} atrasada`, isPositive: false }
              : undefined
          }
        />

        {/* Pagamentos Aguardando Aprovação */}
        <MetricCard
          label="AGUARDANDO APROVAÇÃO"
          value={formatCurrency(pendingApprovalTotal)}
          context={`${pendingApprovals.length} lançamentos pendentes de alçada`}
          urgent={pendingApprovals.length > 0}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
      </div>

      {/* ATENÇÃO NECESSÁRIA Block */}
      {attentionItems.length > 0 && (
        <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 mb-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
            <h2 className="text-xs font-bold tracking-wider text-amber-900 uppercase dark:text-amber-400">
              Atenção Necessária
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {attentionItems.map((item) => (
              <Link
                key={item.id}
                href={item.link}
                className="flex items-center justify-between p-2.5 rounded-md bg-white/90 border border-amber-200/60 text-xs text-zinc-800 hover:bg-white hover:border-amber-300 transition-colors dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-200"
              >
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  <span>{item.text}</span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Chart & Unit Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Revenue Chart */}
        <div className="lg:col-span-2 rounded-lg border border-zinc-200/80 bg-white p-5 dark:bg-zinc-900 dark:border-zinc-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
            <div>
              <h2 className="text-xs font-bold tracking-wider text-zinc-400 uppercase">
                Curva de Faturamento Diário
              </h2>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {formatCurrency(totalMonthRevenue)}
                </span>
                <span className="text-xs text-zinc-500 font-medium">{growthVsLastMonth > 0 ? `+${growthVsLastMonth.toFixed(1)}% vs anterior` : `${growthVsLastMonth.toFixed(1)}% vs anterior`}</span>
              </div>
            </div>

            {/* Period Switcher */}
            <div className="flex items-center rounded-md border border-zinc-200 bg-zinc-50 p-0.5 dark:bg-zinc-800 dark:border-zinc-700">
              {(["7d", "30d", "month", "year"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    period === p
                      ? "bg-white text-zinc-900 shadow-2xs dark:bg-zinc-900 dark:text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                  }`}
                >
                  {p === "7d" ? "7 Dias" : p === "30d" ? "30 Dias" : p === "month" ? "Mês" : "Ano"}
                </button>
              ))}
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#18181b" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#18181b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis dataKey="date" stroke="#a1a1aa" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#a1a1aa"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `R$ ${val / 1000}k`}
                />
                <Tooltip
                  formatter={(val: any) => [formatCurrency(Number(val)), "Faturamento"]}
                  contentStyle={{
                    backgroundColor: "#18181b",
                    borderColor: "#27272a",
                    borderRadius: "6px",
                    color: "#f4f4f5",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#18181b"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Desempenho por Unidade */}
        <div className="rounded-lg border border-zinc-200/80 bg-white p-5 dark:bg-zinc-900 dark:border-zinc-800 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold tracking-wider text-zinc-400 uppercase">
              Desempenho das Unidades
            </h2>
            <Link
              href="/metas"
              className="text-xs text-zinc-600 hover:text-zinc-900 flex items-center gap-0.5 font-medium dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              <span>Detalhes</span>
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="space-y-4 flex-1">
            {store
              .getGoals()
              .filter((g) => g.unitId !== "central")
              .map((goal) => {
                const percent = (goal.currentRealized / goal.targetAmount) * 100;
                const unitName =
                  goal.unitId === "eunapolis"
                    ? "House 190 Eunápolis"
                    : goal.unitId === "teixeira"
                    ? "House 190 Teixeira"
                    : "House Foodpark";

                return (
                  <div
                    key={goal.id}
                    className="p-3 rounded-md border border-zinc-100 bg-zinc-50/60 dark:bg-zinc-800/40 dark:border-zinc-800 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        {unitName}
                      </span>
                      <span className="text-xs font-mono font-medium text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(goal.currentRealized)}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="h-1.5 w-full bg-zinc-200 rounded-full overflow-hidden dark:bg-zinc-700">
                        <div
                          className={`h-full rounded-full ${
                            percent >= 100
                              ? "bg-emerald-500"
                              : percent < 25
                              ? "bg-amber-500"
                              : "bg-zinc-900 dark:bg-zinc-100"
                          }`}
                          style={{ width: `${Math.min(percent, 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span>Meta: {formatCurrency(goal.targetAmount)}</span>
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                          {formatPercent(percent)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Secondary Row: Contas Prioritárias & Tarefas de Hoje */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Próximos Pagamentos */}
        <div className="rounded-lg border border-zinc-200/80 bg-white p-5 dark:bg-zinc-900 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xs font-bold tracking-wider text-zinc-400 uppercase">
                Próximos Pagamentos
              </h2>
              <p className="text-[11px] text-zinc-500">Contas com vencimento nos próximos 7 dias</p>
            </div>
            <Link
              href="/financeiro"
              className="text-xs text-zinc-600 hover:text-zinc-900 font-medium flex items-center gap-1 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              <span>Ver todas</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {accounts
              .filter((a) => a.status !== "paid" && a.status !== "canceled")
              .slice(0, 4)
              .map((acc) => (
                <div key={acc.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium text-zinc-800 truncate dark:text-zinc-200">
                      {acc.description}
                    </span>
                    <span className="text-[11px] text-zinc-400 truncate">
                      {acc.supplierName} • Vence em {formatDate(acc.dueDate)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                      {formatCurrency(acc.finalAmount)}
                    </span>
                    <StatusBadge status={acc.status} />
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Tarefas Prioritárias */}
        <div className="rounded-lg border border-zinc-200/80 bg-white p-5 dark:bg-zinc-900 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xs font-bold tracking-wider text-zinc-400 uppercase">
                Tarefas Prioritárias
              </h2>
              <p className="text-[11px] text-zinc-500">Pendências operacionais e administrativas</p>
            </div>
            <Link
              href="/tarefas"
              className="text-xs text-zinc-600 hover:text-zinc-900 font-medium flex items-center gap-1 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              <span>Quadro Kanban</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {tasks
              .filter((t) => t.status !== "done")
              .slice(0, 4)
              .map((t) => (
                <div key={t.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <button
                      onClick={() => store.updateTaskStatus(t.id, "done")}
                      className="mt-0.5 h-4 w-4 rounded border border-zinc-300 hover:border-zinc-500 flex items-center justify-center dark:border-zinc-700"
                    >
                      <CheckSquare className="h-3 w-3 text-transparent hover:text-zinc-400" />
                    </button>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium text-zinc-800 truncate dark:text-zinc-200">
                        {t.title}
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        {t.assigneeName} • Até {formatDate(t.dueDate)}
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant={
                      t.priority === "urgent"
                        ? "danger"
                        : t.priority === "high"
                        ? "warning"
                        : "secondary"
                    }
                  >
                    {t.priority === "urgent"
                      ? "Urgente"
                      : t.priority === "high"
                      ? "Alta"
                      : "Média"}
                  </Badge>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
