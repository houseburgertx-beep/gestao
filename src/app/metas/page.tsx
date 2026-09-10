"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Target,
  TrendingUp,
  Calendar,
  ArrowUpRight,
  Award,
  AlertCircle,
  UtensilsCrossed,
  Bike,
  ShoppingBag,
  CheckCircle2,
  Clock,
  Sparkles,
  Info,
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { store } from "@/services/store";
import { useUnit } from "@/contexts/UnitContext";
import { UnitGoal } from "@/types";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

// Cores dos Canais
const CHANNEL_COLORS = {
  salao: "#3b82f6", // Azul
  delivery: "#8b5cf6", // Violeta
  ifood: "#ef4444", // Vermelho iFood
  restante: "#e4e4e7", // Zinc 200
  restanteDark: "#27272a", // Zinc 800
};

export default function MetasPage() {
  const { currentUnit, filterByUnit } = useUnit();
  const [goals, setGoals] = useState<UnitGoal[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const update = () => setGoals(store.getGoals());
    update();
    window.addEventListener("house190_data_updated", update);
    return () => window.removeEventListener("house190_data_updated", update);
  }, []);

  // Filtra de acordo com a unidade selecionada no seletor global
  const filteredGoals = useMemo(() => {
    if (currentUnit === "all") {
      return goals.filter((g) => g.unitId !== "central");
    }
    return goals.filter((g) => g.unitId === currentUnit);
  }, [goals, currentUnit]);

  // Cálculos de Tempo (Mês de Setembro / 2026)
  const now = new Date();
  const currentDayOfMonth = Math.min(30, Math.max(1, now.getDate()));
  const totalDaysInMonth = 30;
  const daysRemainingInMonth = Math.max(1, totalDaysInMonth - currentDayOfMonth);

  // Metas e Realizados Globais (ou da Unidade Selecionada)
  const totalTarget = filteredGoals.reduce((acc, cur) => acc + cur.targetAmount, 0);
  const totalSuperTarget = filteredGoals.reduce(
    (acc, cur) => acc + (cur.superTargetAmount || cur.targetAmount),
    0
  );
  const totalRealized = filteredGoals.reduce((acc, cur) => acc + cur.currentRealized, 0);
  const totalPercent = totalTarget > 0 ? (totalRealized / totalTarget) * 100 : 0;
  const remainingTotal = Math.max(0, totalTarget - totalRealized);
  const remainingSuperTotal = Math.max(0, totalSuperTarget - totalRealized);

  // Médias Diárias
  const dailyAverageRealized =
    currentDayOfMonth > 0 ? totalRealized / currentDayOfMonth : 0;
  const dailyNeeded = remainingTotal / daysRemainingInMonth;
  const projectedClose =
    dailyAverageRealized > 0
      ? dailyAverageRealized * totalDaysInMonth
      : totalRealized;
  const isAhead = projectedClose >= totalTarget && totalTarget > 0;

  // Canais Consolidados (Salão, Delivery Próprio, iFood)
  const channelData = useMemo(() => {
    let salaoTarget = 0;
    let salaoRealized = 0;
    let salaoBonus = 0;

    let deliveryTarget = 0;
    let deliveryRealized = 0;
    let deliveryBonus = 0;

    let ifoodTarget = 0;
    let ifoodRealized = 0;
    let ifoodBonus = 0;

    filteredGoals.forEach((g) => {
      if (g.channels) {
        salaoTarget += g.channels.salao.target;
        salaoRealized += g.channels.salao.realized;
        salaoBonus += g.channels.salao.bonus;

        deliveryTarget += g.channels.delivery.target;
        deliveryRealized += g.channels.delivery.realized;
        deliveryBonus += g.channels.delivery.bonus;

        ifoodTarget += g.channels.ifood.target;
        ifoodRealized += g.channels.ifood.realized;
        ifoodBonus += g.channels.ifood.bonus;
      }
    });

    return {
      salao: {
        target: salaoTarget,
        realized: salaoRealized,
        percent: salaoTarget > 0 ? (salaoRealized / salaoTarget) * 100 : 0,
        remaining: Math.max(0, salaoTarget - salaoRealized),
        bonus: salaoBonus,
      },
      delivery: {
        target: deliveryTarget,
        realized: deliveryRealized,
        percent: deliveryTarget > 0 ? (deliveryRealized / deliveryTarget) * 100 : 0,
        remaining: Math.max(0, deliveryTarget - deliveryRealized),
        bonus: deliveryBonus,
      },
      ifood: {
        target: ifoodTarget,
        realized: ifoodRealized,
        percent: ifoodTarget > 0 ? (ifoodRealized / ifoodTarget) * 100 : 0,
        remaining: Math.max(0, ifoodTarget - ifoodRealized),
        bonus: ifoodBonus,
      },
    };
  }, [filteredGoals]);

  // Donut 1: Progresso Global (Realizado vs Restante)
  const progressDonutData = useMemo(() => {
    if (totalTarget === 0) return [];
    if (totalRealized >= totalTarget) {
      return [{ name: "Meta Atingida", value: totalRealized, color: "#10b981" }];
    }
    return [
      { name: "Realizado", value: totalRealized, color: "#18181b" },
      { name: "Falta para Meta", value: remainingTotal, color: "#e4e4e7" },
    ];
  }, [totalRealized, totalTarget, remainingTotal]);

  // Donut 2: Composição por Canal (Salão vs Delivery vs iFood)
  const channelDonutData = useMemo(() => {
    const totalChannelsRealized =
      channelData.salao.realized +
      channelData.delivery.realized +
      channelData.ifood.realized;

    if (totalChannelsRealized > 0) {
      return [
        { name: "Salão", value: channelData.salao.realized, color: CHANNEL_COLORS.salao },
        { name: "Delivery Próprio", value: channelData.delivery.realized, color: CHANNEL_COLORS.delivery },
        { name: "iFood", value: channelData.ifood.realized, color: CHANNEL_COLORS.ifood },
      ];
    }

    // Se ainda não houver faturamento lançado, exibe o mix planejado da meta
    return [
      { name: "Salão (Planejado)", value: channelData.salao.target, color: CHANNEL_COLORS.salao },
      { name: "Delivery Próprio (Planejado)", value: channelData.delivery.target, color: CHANNEL_COLORS.delivery },
      { name: "iFood (Planejado)", value: channelData.ifood.target, color: CHANNEL_COLORS.ifood },
    ];
  }, [channelData]);

  // Metas Diárias Oficiais por Dia da Semana (conforme documento oficial)
  const isFoodPark = currentUnit === "foodpark";
  const dailyTargetsConfig = useMemo(() => {
    if (isFoodPark) {
      return [
        { day: "Segunda-feira", salao: 1800, delivery: 1600, ifood: 600, total: 4000, dayIndex: 1 },
        { day: "Terça-feira", salao: 1800, delivery: 1600, ifood: 600, total: 4000, dayIndex: 2 },
        { day: "Quarta-feira", salao: 1800, delivery: 1600, ifood: 600, total: 4000, dayIndex: 3 },
        { day: "Quinta-feira", salao: 1800, delivery: 1600, ifood: 600, total: 4000, dayIndex: 4 },
        { day: "Sexta-feira", salao: 2800, delivery: 2400, ifood: 800, total: 6000, dayIndex: 5 },
        { day: "Sábado", salao: 4500, delivery: 2800, ifood: 1300, total: 8600, dayIndex: 6 },
        { day: "Domingo", salao: 4900, delivery: 2800, ifood: 1300, total: 9000, dayIndex: 0 },
      ];
    } else {
      // Padrão House 190 (Teixeira e Eunápolis)
      return [
        { day: "Segunda-feira", salao: 2100, delivery: 2100, ifood: 800, total: 5000, dayIndex: 1 },
        { day: "Terça-feira", salao: 2100, delivery: 2100, ifood: 800, total: 5000, dayIndex: 2 },
        { day: "Quarta-feira", salao: 2300, delivery: 2400, ifood: 1300, total: 6000, dayIndex: 3 },
        { day: "Quinta-feira", salao: 2500, delivery: 2700, ifood: 1300, total: 6500, dayIndex: 4 },
        { day: "Sexta-feira", salao: 2800, delivery: 3200, ifood: 1500, total: 7500, dayIndex: 5 },
        { day: "Sábado", salao: 3000, delivery: 3500, ifood: 2000, total: 8500, dayIndex: 6 },
        { day: "Domingo", salao: 3500, delivery: 4000, ifood: 2500, total: 10000, dayIndex: 0 },
      ];
    }
  }, [isFoodPark]);

  const currentDayOfWeekIndex = now.getDay(); // 0 = Domingo, 1 = Segunda, etc.
  const todayTarget = dailyTargetsConfig.find((d) => d.dayIndex === currentDayOfWeekIndex);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/60 pb-4 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Metas & Gestão de Performance
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-medium bg-zinc-100 text-zinc-700 rounded-md dark:bg-zinc-800 dark:text-zinc-300">
              Oficial Takeat & Programa de Gestão
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Acompanhamento mensal com projeção matemática, metas diárias e canais de venda (Salão, Delivery Próprio e iFood)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200/80 rounded-lg text-xs text-zinc-600 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300 shadow-2xs">
            <Calendar className="h-3.5 w-3.5 text-zinc-400" />
            <span>Dia {currentDayOfMonth} de {totalDaysInMonth} ({daysRemainingInMonth} dias restantes)</span>
          </div>
        </div>
      </div>

      {/* Cartão Macro de Projeção e Desempenho Global */}
      <div className="p-6 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 space-y-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                {currentUnit === "all"
                  ? "Meta Consolidada do Grupo House"
                  : currentUnit === "foodpark"
                  ? "Meta House Food Park"
                  : currentUnit === "eunapolis"
                  ? "Meta House 190 Eunápolis"
                  : "Meta House 190 Teixeira de Freitas"}
              </span>
              <Badge variant={isAhead ? "success" : "warning"}>
                {isAhead ? "No Ritmo da Meta" : "Abaixo do Ritmo"}
              </Badge>
            </div>

            <div className="mt-1.5 flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-bold tracking-tight text-zinc-900 tabular-nums dark:text-zinc-50">
                {formatCurrency(totalRealized)}
              </span>
              <span className="text-sm font-medium text-zinc-500">
                de {formatCurrency(totalTarget)} ({formatPercent(totalPercent)})
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 font-medium">
                Super Meta: {formatCurrency(totalSuperTarget)}
              </span>
            </div>
          </div>

          {/* Mini Indicadores de Onde Estamos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-3 lg:pt-0 border-t lg:border-t-0 border-zinc-100 dark:border-zinc-800">
            <div>
              <span className="text-[11px] text-zinc-400 block">Falta para a Meta</span>
              <span className="text-base font-bold font-mono text-zinc-900 dark:text-zinc-100">
                {formatCurrency(remainingTotal)}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 block">Média Necessária / dia</span>
              <span className="text-base font-bold font-mono text-zinc-900 dark:text-zinc-100">
                {formatCurrency(dailyNeeded)}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-zinc-400 block">Projeção de Fechamento</span>
              <span
                className={`text-base font-bold font-mono ${
                  isAhead ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {formatCurrency(projectedClose)}
              </span>
            </div>
          </div>
        </div>

        {/* Barra Linear de Progresso com Marcador de Super Meta */}
        <div className="space-y-1.5">
          <div className="relative h-2.5 w-full bg-zinc-100 rounded-full overflow-hidden dark:bg-zinc-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                totalPercent >= 100
                  ? "bg-emerald-500"
                  : !isAhead
                  ? "bg-amber-500"
                  : "bg-zinc-900 dark:bg-zinc-100"
              }`}
              style={{ width: `${Math.min(totalPercent, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-zinc-400 font-medium">
            <span>Início (Dia 1)</span>
            <span>Meta Regular: 100% ({formatCurrency(totalTarget)})</span>
            <span>Super Meta ({formatCurrency(totalSuperTarget)})</span>
          </div>
        </div>
      </div>

      {/* SEÇÃO 2: GRÁFICOS DONUT EXECUTIVOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Donut 1: Progresso Global da Meta */}
        <div className="p-5 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-zinc-400" />
              Progresso Geral da Meta
            </h3>
            <span className="text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-300">
              {formatPercent(totalPercent)}
            </span>
          </div>

          <div className="relative h-52 w-full flex items-center justify-center">
            {isMounted && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    formatter={(value: any) => formatCurrency(Number(value))}
                    contentStyle={{
                      backgroundColor: "#18181b",
                      borderRadius: "8px",
                      border: "none",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                  />
                  <Pie
                    data={progressDonutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {progressDonutData.map((entry, index) => (
                      <Cell key={`cell-p-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="absolute flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50">
                {Math.round(totalPercent)}%
              </span>
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                Atingido
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-900 dark:bg-zinc-100" />
              <div className="truncate">
                <span className="text-[10px] text-zinc-400 block">Realizado</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatCurrency(totalRealized)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
              <div className="truncate">
                <span className="text-[10px] text-zinc-400 block">Faltam</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatCurrency(remainingTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Donut 2: Composição por Canal (Salão vs Delivery vs iFood) */}
        <div className="p-5 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-zinc-400" />
              Composição das Vendas por Canal
            </h3>
            <span className="text-[11px] text-zinc-400">Salão • Delivery • iFood</span>
          </div>

          <div className="relative h-52 w-full flex items-center justify-center">
            {isMounted && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    formatter={(value: any) => formatCurrency(Number(value))}
                    contentStyle={{
                      backgroundColor: "#18181b",
                      borderRadius: "8px",
                      border: "none",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                  />
                  <Pie
                    data={channelDonutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {channelDonutData.map((entry, index) => (
                      <Cell key={`cell-c-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="absolute flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                3 Canais
              </span>
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                Oficiais
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: CHANNEL_COLORS.salao }} />
              <div className="truncate">
                <span className="text-[10px] text-zinc-400 block">Salão</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {formatCurrency(channelData.salao.realized)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: CHANNEL_COLORS.delivery }} />
              <div className="truncate">
                <span className="text-[10px] text-zinc-400 block">Delivery</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {formatCurrency(channelData.delivery.realized)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: CHANNEL_COLORS.ifood }} />
              <div className="truncate">
                <span className="text-[10px] text-zinc-400 block">iFood</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {formatCurrency(channelData.ifood.realized)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO 3: METAS POR CANAL DE VENDA (Salão, Delivery Próprio, iFood) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Award className="h-3.5 w-3.5 text-zinc-400" />
            Acompanhamento das Metas por Canal
          </h2>
          <span className="text-xs text-zinc-500">Apuração via objeto oficial Takeat</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card Salão */}
          <div className="p-5 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                  <UtensilsCrossed className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Salão & Mesas
                  </h3>
                  <p className="text-[11px] text-zinc-400">Balcão + Comandas</p>
                </div>
              </div>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                Bônus: {formatCurrency(channelData.salao.bonus)}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50">
                  {formatCurrency(channelData.salao.realized)}
                </span>
                <span className="text-xs font-mono font-semibold text-zinc-600 dark:text-zinc-300">
                  {formatPercent(channelData.salao.percent)}
                </span>
              </div>

              {/* Barra de progresso */}
              <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden dark:bg-zinc-800">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(channelData.salao.percent, 100)}%`,
                    backgroundColor: CHANNEL_COLORS.salao,
                  }}
                />
              </div>

              <div className="flex justify-between text-[10px] text-zinc-400 pt-0.5">
                <span>Meta: {formatCurrency(channelData.salao.target)}</span>
                <span>Faltam: {formatCurrency(channelData.salao.remaining)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-500 flex justify-between">
              <span>Ritmo Diário Necessário:</span>
              <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                {formatCurrency(channelData.salao.remaining / daysRemainingInMonth)} / dia
              </span>
            </div>
          </div>

          {/* Card Delivery Próprio */}
          <div className="p-5 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
                  <Bike className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Delivery Próprio
                  </h3>
                  <p className="text-[11px] text-zinc-400">Cardápio Web / WhatsApp</p>
                </div>
              </div>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                Bônus: {formatCurrency(channelData.delivery.bonus)}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50">
                  {formatCurrency(channelData.delivery.realized)}
                </span>
                <span className="text-xs font-mono font-semibold text-zinc-600 dark:text-zinc-300">
                  {formatPercent(channelData.delivery.percent)}
                </span>
              </div>

              {/* Barra de progresso */}
              <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden dark:bg-zinc-800">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(channelData.delivery.percent, 100)}%`,
                    backgroundColor: CHANNEL_COLORS.delivery,
                  }}
                />
              </div>

              <div className="flex justify-between text-[10px] text-zinc-400 pt-0.5">
                <span>Meta: {formatCurrency(channelData.delivery.target)}</span>
                <span>Faltam: {formatCurrency(channelData.delivery.remaining)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-500 flex justify-between">
              <span>Ritmo Diário Necessário:</span>
              <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                {formatCurrency(channelData.delivery.remaining / daysRemainingInMonth)} / dia
              </span>
            </div>
          </div>

          {/* Card iFood */}
          <div className="p-5 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                  <ShoppingBag className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Canal iFood
                  </h3>
                  <p className="text-[11px] text-zinc-400">Marketplace Integrado</p>
                </div>
              </div>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                Bônus: {formatCurrency(channelData.ifood.bonus)}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50">
                  {formatCurrency(channelData.ifood.realized)}
                </span>
                <span className="text-xs font-mono font-semibold text-zinc-600 dark:text-zinc-300">
                  {formatPercent(channelData.ifood.percent)}
                </span>
              </div>

              {/* Barra de progresso */}
              <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden dark:bg-zinc-800">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(channelData.ifood.percent, 100)}%`,
                    backgroundColor: CHANNEL_COLORS.ifood,
                  }}
                />
              </div>

              <div className="flex justify-between text-[10px] text-zinc-400 pt-0.5">
                <span>Meta: {formatCurrency(channelData.ifood.target)}</span>
                <span>Faltam: {formatCurrency(channelData.ifood.remaining)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-500 flex justify-between">
              <span>Ritmo Diário Necessário:</span>
              <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                {formatCurrency(channelData.ifood.remaining / daysRemainingInMonth)} / dia
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO 4: METAS DIÁRIAS POR DIA DA SEMANA */}
      <div className="p-6 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-zinc-400" />
              Metas Diárias de Faturamento por Dia da Semana
            </h2>
            <p className="text-xs text-zinc-400">
              Distribuição semanal planejada para {isFoodPark ? "o House Food Park" : "a House 190"}
            </p>
          </div>

          {todayTarget && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-zinc-500 dark:text-zinc-400">Meta de Hoje ({todayTarget.day}):</span>
              <span className="font-bold font-mono text-zinc-900 dark:text-zinc-50">
                {formatCurrency(todayTarget.total)}
              </span>
            </div>
          )}
        </div>

        {/* Tabela Diária Responsiva */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 uppercase text-[10px] font-semibold">
                <th className="py-2.5 px-3">Dia da Semana</th>
                <th className="py-2.5 px-3 text-right">Salão</th>
                <th className="py-2.5 px-3 text-right">Delivery Próprio</th>
                <th className="py-2.5 px-3 text-right">iFood</th>
                <th className="py-2.5 px-3 text-right font-bold text-zinc-700 dark:text-zinc-300">
                  Meta Total do Dia
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-mono">
              {dailyTargetsConfig.map((row) => {
                const isToday = row.dayIndex === currentDayOfWeekIndex;
                return (
                  <tr
                    key={row.day}
                    className={`transition-colors ${
                      isToday
                        ? "bg-zinc-50/80 font-bold dark:bg-zinc-800/50"
                        : "hover:bg-zinc-50/40 dark:hover:bg-zinc-800/20"
                    }`}
                  >
                    <td className="py-3 px-3 font-sans font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                      <span>{row.day}</span>
                      {isToday && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-500 text-white tracking-wider">
                          Hoje
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right text-zinc-600 dark:text-zinc-300">
                      {formatCurrency(row.salao)}
                    </td>
                    <td className="py-3 px-3 text-right text-zinc-600 dark:text-zinc-300">
                      {formatCurrency(row.delivery)}
                    </td>
                    <td className="py-3 px-3 text-right text-zinc-600 dark:text-zinc-300">
                      {formatCurrency(row.ifood)}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-zinc-900 dark:text-zinc-50">
                      {formatCurrency(row.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SEÇÃO 5: REGRAS OFICIAIS DE BONIFICAÇÃO & TRAVAS OPERACIONAIS */}
      <div className="p-5 rounded-xl border border-zinc-200/80 bg-zinc-50/50 dark:bg-zinc-900/50 dark:border-zinc-800 space-y-3">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5" />
          Regras de Apuração e Travas de Bonificação (Programa Oficial)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-white rounded-lg border border-zinc-200/60 dark:bg-zinc-900 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-400 block font-semibold uppercase">Super Meta & Bônus</span>
            <span className="text-zinc-800 dark:text-zinc-200 font-medium">
              Bônus extra de <strong>R$ 1.000,00</strong> ao atingir a Super Meta da unidade.
            </span>
          </div>

          <div className="p-3 bg-white rounded-lg border border-zinc-200/60 dark:bg-zinc-900 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-400 block font-semibold uppercase">Trava de CMV</span>
            <span className="text-zinc-800 dark:text-zinc-200 font-medium">
              CMV máximo de <strong>35%</strong>. Acima deste índice, perde-se toda a bonificação.
            </span>
          </div>

          <div className="p-3 bg-white rounded-lg border border-zinc-200/60 dark:bg-zinc-900 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-400 block font-semibold uppercase">Limite Freelancers</span>
            <span className="text-zinc-800 dark:text-zinc-200 font-medium">
              Máximo de <strong>R$ 1.500,00/mês</strong>. Acima desse teto, perde o bônus do Salão.
            </span>
          </div>

          <div className="p-3 bg-white rounded-lg border border-zinc-200/60 dark:bg-zinc-900 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-400 block font-semibold uppercase">Teto Campanhas iFood</span>
            <span className="text-zinc-800 dark:text-zinc-200 font-medium">
              Promoções e descontos devem permanecer rigorosamente dentro dos <strong>25%</strong>.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
