"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Target,
  TrendingUp,
  Calendar,
  Award,
  AlertCircle,
  UtensilsCrossed,
  Bike,
  ShoppingBag,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Info,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  RotateCw,
  Edit3,
  Plus,
  Save,
} from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { store } from "@/services/store";
import { useUnit } from "@/contexts/UnitContext";
import { UnitGoal, UnitId } from "@/types";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { getTodayBahiaDate, getYesterdayBahiaDate } from "@/services/takeatService";

// Cores Oficiais dos Canais
const CHANNEL_COLORS = {
  salao: "#3b82f6", // Azul
  delivery: "#8b5cf6", // Violeta
  ifood: "#ef4444", // Vermelho iFood
  restante: "#e4e4e7", // Zinc 200
};

// Tooltip Personalizado do Donut de Composição por Canal
const CustomChannelTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const item = payload[0];
    const val = Number(item.value || 0);
    const color = item.payload?.color || item.color || "#3b82f6";
    const name = item.name || item.payload?.name || "Canal";
    const percent = item.payload?.percentValue || 0;

    return (
      <div className="bg-zinc-950/95 text-white px-3.5 py-2.5 rounded-xl shadow-xl border border-zinc-800 text-xs backdrop-blur-md">
        <div className="flex items-center gap-2 mb-1">
          <span className="h-3 w-3 rounded-full shrink-0 ring-1 ring-white/20" style={{ backgroundColor: color }} />
          <span className="font-bold text-sm text-zinc-100">{name}</span>
        </div>
        <div className="flex items-baseline gap-2 pt-0.5">
          <span className="font-mono font-bold text-base text-zinc-50">{formatCurrency(val)}</span>
          {percent > 0 && (
            <span className="text-zinc-400 text-xs font-semibold">({percent.toFixed(1)}%)</span>
          )}
        </div>
      </div>
    );
  }
  return null;
};

// Tooltip Personalizado do Donut de Progresso Global
const CustomProgressTooltip = ({ active, payload, totalTarget }: any) => {
  if (active && payload && payload.length) {
    const item = payload[0];
    const val = Number(item.value || 0);
    const color = item.payload?.color || item.color || "#10b981";
    const name = item.name || item.payload?.name || "Valor";
    const percent = totalTarget > 0 ? (val / totalTarget) * 100 : 0;

    return (
      <div className="bg-zinc-950/95 text-white px-3.5 py-2.5 rounded-xl shadow-xl border border-zinc-800 text-xs backdrop-blur-md">
        <div className="flex items-center gap-2 mb-1">
          <span className="h-3 w-3 rounded-full shrink-0 ring-1 ring-white/20" style={{ backgroundColor: color }} />
          <span className="font-bold text-sm text-zinc-100">{name}</span>
        </div>
        <div className="flex items-baseline gap-2 pt-0.5">
          <span className="font-mono font-bold text-base text-zinc-50">{formatCurrency(val)}</span>
          {totalTarget > 0 && (
            <span className="text-zinc-400 text-xs font-semibold">({percent.toFixed(1)}% da Meta)</span>
          )}
        </div>
      </div>
    );
  }
  return null;
};

export default function MetasPage() {
  const { currentUnit } = useUnit();
  // Seletor de Loja ativo em Metas: Central de Produção é fábrica/industrial e não possui metas de venda
  const [activeMetaUnit, setActiveMetaUnit] = useState<Exclude<UnitId, "central"> | "all">(() => {
    return currentUnit === "central" ? "all" : (currentUnit as any);
  });

  // Atualiza activeMetaUnit caso o usuário mude a loja no seletor global do topo
  useEffect(() => {
    if (currentUnit === "central") {
      setActiveMetaUnit("all");
    } else {
      setActiveMetaUnit(currentUnit as any);
    }
  }, [currentUnit]);

  const [goals, setGoals] = useState<UnitGoal[]>([]);
  const [takeatRevenues, setTakeatRevenues] = useState(store.getTakeatRevenues());
  const [dailyRevenues, setDailyRevenues] = useState(store.getRevenues());
  const [isMounted, setIsMounted] = useState(false);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(1); // 1 = Semana Atual (07/09 a 13/09)
  const [syncingDate, setSyncingDate] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [editingDay, setEditingDay] = useState<{ dateStr: string; dayName: string } | null>(null);
  const [editUnit, setEditUnit] = useState<Exclude<UnitId, "all" | "central"> | "all">("all");
  const [editSalao, setEditSalao] = useState("");
  const [editDelivery, setEditDelivery] = useState("");
  const [editIfood, setEditIfood] = useState("");

  useEffect(() => {
    setIsMounted(true);
    const update = () => {
      setGoals(store.getGoals());
      setTakeatRevenues(store.getTakeatRevenues());
      setDailyRevenues(store.getRevenues());
    };
    update();
    window.addEventListener("house190_data_updated", update);
    return () => window.removeEventListener("house190_data_updated", update);
  }, []);

  // Filtra metas de acordo com a unidade selecionada (Central de Produção é estritamente excluída)
  const filteredGoals = useMemo(() => {
    if (activeMetaUnit === "all") {
      return goals.filter((g) => (g.unitId as string) !== "central");
    }
    return goals.filter((g) => g.unitId === activeMetaUnit);
  }, [goals, activeMetaUnit]);

  // Tempo do mês corrente (Setembro / 2026) com fuso oficial da Bahia
  const todayStr = getTodayBahiaDate();
  const yesterdayStr = getYesterdayBahiaDate();
  const now = new Date();
  const currentDayOfMonth = Math.min(30, Math.max(1, now.getDate()));
  const totalDaysInMonth = 30;
  const daysRemainingInMonth = Math.max(1, totalDaysInMonth - currentDayOfMonth);

  // Metas e Realizados Globais
  const totalTarget = filteredGoals.reduce((acc, cur) => acc + cur.targetAmount, 0);
  const totalSuperTarget = filteredGoals.reduce(
    (acc, cur) => acc + (cur.superTargetAmount || cur.targetAmount),
    0
  );
  const totalRealized = filteredGoals.reduce((acc, cur) => acc + cur.currentRealized, 0);
  const totalPercent = totalTarget > 0 ? (totalRealized / totalTarget) * 100 : 0;
  const remainingTotal = Math.max(0, totalTarget - totalRealized);

  // Médias Diárias e Projeção Matemática
  const dailyAverageRealized = currentDayOfMonth > 0 ? totalRealized / currentDayOfMonth : 0;
  const dailyNeeded = remainingTotal / daysRemainingInMonth;
  const projectedClose = dailyAverageRealized > 0 ? dailyAverageRealized * totalDaysInMonth : totalRealized;
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

  // Donut 2: Composição por Canal com Porcentagens para o Tooltip
  const channelDonutData = useMemo(() => {
    const totalChannelsRealized =
      channelData.salao.realized +
      channelData.delivery.realized +
      channelData.ifood.realized;

    if (totalChannelsRealized > 0) {
      return [
        {
          name: "Salão",
          value: channelData.salao.realized,
          color: CHANNEL_COLORS.salao,
          percentValue: (channelData.salao.realized / totalChannelsRealized) * 100,
        },
        {
          name: "Delivery Próprio",
          value: channelData.delivery.realized,
          color: CHANNEL_COLORS.delivery,
          percentValue: (channelData.delivery.realized / totalChannelsRealized) * 100,
        },
        {
          name: "iFood",
          value: channelData.ifood.realized,
          color: CHANNEL_COLORS.ifood,
          percentValue: (channelData.ifood.realized / totalChannelsRealized) * 100,
        },
      ];
    }

    const totalPlanned = channelData.salao.target + channelData.delivery.target + channelData.ifood.target;
    return [
      {
        name: "Salão (Planejado)",
        value: channelData.salao.target,
        color: CHANNEL_COLORS.salao,
        percentValue: totalPlanned > 0 ? (channelData.salao.target / totalPlanned) * 100 : 35,
      },
      {
        name: "Delivery Próprio (Planejado)",
        value: channelData.delivery.target,
        color: CHANNEL_COLORS.delivery,
        percentValue: totalPlanned > 0 ? (channelData.delivery.target / totalPlanned) * 100 : 40,
      },
      {
        name: "iFood (Planejado)",
        value: channelData.ifood.target,
        color: CHANNEL_COLORS.ifood,
        percentValue: totalPlanned > 0 ? (channelData.ifood.target / totalPlanned) * 100 : 25,
      },
    ];
  }, [channelData]);

  // Metas Diárias Oficiais por Dia da Semana (conforme documento)
  const isFoodPark = activeMetaUnit === "foodpark";
  const isAll = activeMetaUnit === "all";

  // Obter a meta diária planejada para um dia da semana (0 = Domingo, 1 = Segunda, etc.)
  const getDailyTargetForDay = (dayIndex: number) => {
    if (isFoodPark) {
      // House Food Park (R$ 180k / Super R$ 190k)
      if (dayIndex >= 1 && dayIndex <= 4) return { salao: 1800, delivery: 1600, ifood: 600, total: 4000 };
      if (dayIndex === 5) return { salao: 2800, delivery: 2400, ifood: 800, total: 6000 };
      if (dayIndex === 6) return { salao: 4500, delivery: 2800, ifood: 1300, total: 8600 };
      return { salao: 4900, delivery: 2800, ifood: 1300, total: 9000 }; // Domingo
    } else if (activeMetaUnit === "teixeira" || activeMetaUnit === "eunapolis") {
      // House 190 Teixeira ou Eunápolis individual (R$ 200k / Super R$ 210k cada)
      if (dayIndex === 1 || dayIndex === 2) return { salao: 2100, delivery: 2100, ifood: 800, total: 5000 };
      if (dayIndex === 3) return { salao: 2300, delivery: 2400, ifood: 1300, total: 6000 };
      if (dayIndex === 4) return { salao: 2500, delivery: 2700, ifood: 1300, total: 6500 };
      if (dayIndex === 5) return { salao: 2800, delivery: 3200, ifood: 1500, total: 7500 };
      if (dayIndex === 6) return { salao: 3000, delivery: 3500, ifood: 2000, total: 8500 };
      return { salao: 3500, delivery: 4000, ifood: 2500, total: 10000 }; // Domingo
    } else {
      // Consolidado Geral Grupo House (Teixeira 200k + Eunápolis 200k + Food Park 180k = R$ 580k mês)
      if (dayIndex === 1 || dayIndex === 2) return { salao: 6000, delivery: 5800, ifood: 2200, total: 14000 };
      if (dayIndex === 3) return { salao: 6400, delivery: 6400, ifood: 3200, total: 16000 };
      if (dayIndex === 4) return { salao: 6800, delivery: 7000, ifood: 3200, total: 17000 };
      if (dayIndex === 5) return { salao: 8400, delivery: 8800, ifood: 3800, total: 21000 };
      if (dayIndex === 6) return { salao: 10500, delivery: 9800, ifood: 5300, total: 25600 };
      return { salao: 11900, delivery: 10800, ifood: 6300, total: 29000 }; // Domingo
    }
  };

  // Função para obter o faturamento real oficial de um dia específico (YYYY-MM-DD)
  const getDayRevenue = (dateStr: string) => {
    let salao = 0;
    let delivery = 0;
    let ifood = 0;

    // Busca dados do Takeat estritamente diários (YYYY-MM-DD - exatamente 10 caracteres)
    // Central de Produção e registros consolidados mensais são estritamente excluídos
    const matchingTakeat = takeatRevenues.filter((r) => {
      if ((r.unitId as string) === "central") return false;
      if (activeMetaUnit !== "all" && r.unitId !== activeMetaUnit) return false;
      if (!r.date || r.date.length !== 10) return false;
      return r.date === dateStr;
    });

    if (matchingTakeat.length > 0) {
      salao = matchingTakeat.reduce((acc, cur) => acc + (cur.salao || 0), 0);
      delivery = matchingTakeat.reduce((acc, cur) => acc + (cur.delivery || 0), 0);
      ifood = matchingTakeat.reduce((acc, cur) => acc + (cur.ifood || 0), 0);
    }

    const takeatTotal = Math.round((salao + delivery + ifood) * 100) / 100;

    // Faturamento manual geral estritamente diário
    const matchingDaily = dailyRevenues.filter((r) => {
      if ((r.unitId as string) === "central") return false;
      if (activeMetaUnit !== "all" && r.unitId !== activeMetaUnit) return false;
      if (!r.date || r.date.length !== 10) return false;
      return r.date === dateStr;
    });
    const dailyTotal = matchingDaily.reduce((acc, cur) => acc + (cur.netRevenue || cur.grossRevenue || 0), 0);

    const total = Math.round(Math.max(takeatTotal, dailyTotal) * 100) / 100;

    return { salao, delivery, ifood, total };
  };

  // Sincroniza dados da Takeat para uma data específica
  const handleSyncDate = async (targetDateStr: string) => {
    setSyncingDate(targetDateStr);
    setSyncFeedback(null);
    try {
      const unitsToSync: Array<Exclude<UnitId, "all" | "central">> =
        activeMetaUnit === "all"
          ? ["foodpark", "teixeira", "eunapolis"]
          : [activeMetaUnit as any];

      let anySuccess = false;
      let totalFetched = 0;
      let lastError = "";

      for (const u of unitsToSync) {
        const res = await store.syncTakeatUnit(u, targetDateStr, "diretoria", "all");
        if (res.success && res.data) {
          anySuccess = true;
          totalFetched += res.data.totalRevenue;
        } else if (!res.success) {
          lastError = res.error || "Erro ao conectar à Takeat";
        }
      }

      setTakeatRevenues(store.getTakeatRevenues());
      setDailyRevenues(store.getRevenues());
      setGoals(store.getGoals());

      if (anySuccess) {
        setSyncFeedback({
          type: "success",
          text: `Vendas de ${targetDateStr.split("-").reverse().join("/")} sincronizadas com sucesso da Takeat (${formatCurrency(totalFetched)})!${
            targetDateStr === "2026-09-08" && selectedWeekIndex !== 1
              ? " Atenção: A terça-feira (08/09) está localizada na aba 'Semana Atual'."
              : ""
          }`,
        });
      } else {
        setSyncFeedback({
          type: "error",
          text: `${lastError}. Você também pode lançar o valor manualmente no botão ao lado.`,
        });
      }
    } catch (err: any) {
      setSyncFeedback({
        type: "error",
        text: err.message || "Erro durante sincronização",
      });
    } finally {
      setSyncingDate(null);
    }
  };

  // Sincroniza todos os dias da semana selecionada
  const handleSyncWeek = async (weekIdx: number) => {
    const week = monthWeeks[weekIdx];
    if (!week) return;

    const daysToSync = week.days.filter((d) => d.dateStr <= todayStr);
    if (daysToSync.length === 0) {
      setSyncFeedback({
        type: "info",
        text: "Esta semana contém apenas dias futuros que ainda não ocorreram.",
      });
      return;
    }

    setSyncingDate(`week-${week.id}`);
    setSyncFeedback({
      type: "info",
      text: `Sincronizando faturamento diário oficial de ${daysToSync.length} dia(s) da ${week.label} na Takeat...`,
    });

    try {
      const unitsToSync: Array<Exclude<UnitId, "all" | "central">> =
        activeMetaUnit === "all"
          ? ["foodpark", "teixeira", "eunapolis"]
          : [activeMetaUnit as any];

      let totalFetched = 0;

      for (const d of daysToSync) {
        for (const u of unitsToSync) {
          const res = await store.syncTakeatUnit(u, d.dateStr, "diretoria", "all");
          if (res.success && res.data) {
            totalFetched += res.data.totalRevenue;
          }
        }
      }

      setTakeatRevenues(store.getTakeatRevenues());
      setDailyRevenues(store.getRevenues());
      setGoals(store.getGoals());

      setSyncFeedback({
        type: "success",
        text: `Sincronização concluída para ${daysToSync.length} dia(s) da ${week.label}! Total apurado: ${formatCurrency(totalFetched)}.`,
      });
    } catch (err: any) {
      setSyncFeedback({
        type: "error",
        text: err.message || "Erro ao sincronizar semana.",
      });
    } finally {
      setSyncingDate(null);
    }
  };

  // Sincroniza todos os dias do mês decorridos (01/09 até Hoje)
  const handleSyncMonthDays = async () => {
    setSyncingDate("month-days");
    setSyncFeedback({
      type: "info",
      text: "Sincronizando faturamento diário oficial de 01/09 até hoje dia a dia da Takeat...",
    });

    try {
      const unitsToSync: Array<Exclude<UnitId, "all" | "central">> =
        activeMetaUnit === "all"
          ? ["foodpark", "teixeira", "eunapolis"]
          : [activeMetaUnit as any];

      const currentDay = parseInt(todayStr.split("-")[2], 10);
      let totalFetched = 0;

      for (let day = 1; day <= currentDay; day++) {
        const dStr = `2026-09-${String(day).padStart(2, "0")}`;
        for (const u of unitsToSync) {
          const res = await store.syncTakeatUnit(u, dStr, "diretoria", "all");
          if (res.success && res.data) {
            totalFetched += res.data.totalRevenue;
          }
        }
      }

      setTakeatRevenues(store.getTakeatRevenues());
      setDailyRevenues(store.getRevenues());
      setGoals(store.getGoals());

      setSyncFeedback({
        type: "success",
        text: `Faturamento diário de 01/09 até hoje sincronizado com sucesso dia a dia da Takeat! Total: ${formatCurrency(totalFetched)}.`,
      });
    } catch (err: any) {
      setSyncFeedback({
        type: "error",
        text: err.message || "Erro ao sincronizar mês.",
      });
    } finally {
      setSyncingDate(null);
    }
  };

  // Abertura do modal de edição
  const handleOpenEditModal = (row: { dateStr: string; dayName: string }) => {
    const rev = getDayRevenue(row.dateStr);
    setEditingDay(row);
    setEditUnit(activeMetaUnit === "all" ? "all" : (activeMetaUnit as any));
    setEditSalao(rev.salao > 0 ? rev.salao.toString().replace(".", ",") : "");
    setEditDelivery(rev.delivery > 0 ? rev.delivery.toString().replace(".", ",") : "");
    setEditIfood(rev.ifood > 0 ? rev.ifood.toString().replace(".", ",") : "");
  };

  // Salva faturamento inserido manualmente
  const handleSaveDailyRevenue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDay) return;

    const salaoVal = parseFloat(editSalao.replace(/\./g, "").replace(",", ".")) || 0;
    const deliveryVal = parseFloat(editDelivery.replace(/\./g, "").replace(",", ".")) || 0;
    const ifoodVal = parseFloat(editIfood.replace(/\./g, "").replace(",", ".")) || 0;
    const totalVal = salaoVal + deliveryVal + ifoodVal;

    const targetUnits: Array<Exclude<UnitId, "all" | "central">> =
      editUnit === "all"
        ? ["foodpark", "teixeira", "eunapolis"]
        : [editUnit as any];

    const weights: Record<string, number> = {
      teixeira: 200 / 580,
      eunapolis: 200 / 580,
      foodpark: 180 / 580,
    };

    for (const u of targetUnits) {
      const weight = editUnit === "all" ? (weights[u] || 1 / 3) : 1;
      const uSalao = Math.round(salaoVal * weight * 100) / 100;
      const uDelivery = Math.round(deliveryVal * weight * 100) / 100;
      const uIfood = Math.round(ifoodVal * weight * 100) / 100;
      const uTotal = Math.round((uSalao + uDelivery + uIfood) * 100) / 100;

      store.saveTakeatRevenue(
        {
          id: `takeat-${u}-${editingDay.dateStr}`,
          unitId: u,
          date: editingDay.dateStr,
          startDateUtc: `${editingDay.dateStr}T03:00:00.000Z`,
          endDateUtc: `${editingDay.dateStr}T23:59:59.999Z`,
          salao: uSalao,
          delivery: uDelivery,
          ifood: uIfood,
          totalRevenue: uTotal,
          rawBalcony: uSalao,
          rawTable: 0,
          rawDelivery: uDelivery,
          rawIfood: uIfood,
          source: "takeat",
          syncedAt: new Date().toISOString(),
        },
        true // isManualEdit = true
      );
    }

    setTakeatRevenues(store.getTakeatRevenues());
    setDailyRevenues(store.getRevenues());
    setGoals(store.getGoals());
    setEditingDay(null);
    setSyncFeedback({
      type: "success",
      text: `Faturamento de ${editingDay.dayName} (${editingDay.dateStr.split("-").reverse().join("/")}) salvo com sucesso: ${formatCurrency(totalVal)}!`,
    });
  };

  // Semanas do mês de Setembro de 2026
  const monthWeeks = [
    {
      id: "w1",
      label: "Semana 1 (01/09 a 06/09)",
      days: [
        { dayName: "Terça-feira", dateStr: "2026-09-01", dayIndex: 2 },
        { dayName: "Quarta-feira", dateStr: "2026-09-02", dayIndex: 3 },
        { dayName: "Quinta-feira", dateStr: "2026-09-03", dayIndex: 4 },
        { dayName: "Sexta-feira", dateStr: "2026-09-04", dayIndex: 5 },
        { dayName: "Sábado", dateStr: "2026-09-05", dayIndex: 6 },
        { dayName: "Domingo", dateStr: "2026-09-06", dayIndex: 0 },
      ],
    },
    {
      id: "w2",
      label: "Semana Atual (07/09 a 13/09)",
      days: [
        { dayName: "Segunda-feira", dateStr: "2026-09-07", dayIndex: 1 },
        { dayName: "Terça-feira", dateStr: "2026-09-08", dayIndex: 2 },
        { dayName: "Quarta-feira", dateStr: "2026-09-09", dayIndex: 3 },
        { dayName: "Quinta-feira", dateStr: "2026-09-10", dayIndex: 4 },
        { dayName: "Sexta-feira", dateStr: "2026-09-11", dayIndex: 5 },
        { dayName: "Sábado", dateStr: "2026-09-12", dayIndex: 6 },
        { dayName: "Domingo", dateStr: "2026-09-13", dayIndex: 0 },
      ],
    },
    {
      id: "w3",
      label: "Semana 3 (14/09 a 20/09)",
      days: [
        { dayName: "Segunda-feira", dateStr: "2026-09-14", dayIndex: 1 },
        { dayName: "Terça-feira", dateStr: "2026-09-15", dayIndex: 2 },
        { dayName: "Quarta-feira", dateStr: "2026-09-16", dayIndex: 3 },
        { dayName: "Quinta-feira", dateStr: "2026-09-17", dayIndex: 4 },
        { dayName: "Sexta-feira", dateStr: "2026-09-18", dayIndex: 5 },
        { dayName: "Sábado", dateStr: "2026-09-19", dayIndex: 6 },
        { dayName: "Domingo", dateStr: "2026-09-20", dayIndex: 0 },
      ],
    },
    {
      id: "w4",
      label: "Semana 4 (21/09 a 27/09)",
      days: [
        { dayName: "Segunda-feira", dateStr: "2026-09-21", dayIndex: 1 },
        { dayName: "Terça-feira", dateStr: "2026-09-22", dayIndex: 2 },
        { dayName: "Quarta-feira", dateStr: "2026-09-23", dayIndex: 3 },
        { dayName: "Quinta-feira", dateStr: "2026-09-24", dayIndex: 4 },
        { dayName: "Sexta-feira", dateStr: "2026-09-25", dayIndex: 5 },
        { dayName: "Sábado", dateStr: "2026-09-26", dayIndex: 6 },
        { dayName: "Domingo", dateStr: "2026-09-27", dayIndex: 0 },
      ],
    },
  ];

  const currentWeek = monthWeeks[selectedWeekIndex];

  // Dados de Hoje calculados dinamicamente com base no dia da semana oficial
  const todayDayOfWeek = new Date(`${todayStr}T12:00:00Z`).getUTCDay();
  const todayRevenue = getDayRevenue(todayStr);
  const todayTargetConfig = getDailyTargetForDay(todayDayOfWeek);
  const todayTargetTotal = todayTargetConfig.total;
  const todayRealizedTotal = todayRevenue.total;
  const todayDifference = todayRealizedTotal - todayTargetTotal;
  const todayBateu = todayRealizedTotal >= todayTargetTotal;
  const todayPercent = todayTargetTotal > 0 ? (todayRealizedTotal / todayTargetTotal) * 100 : 0;

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
            Acompanhamento em tempo real das metas oficiais, faturamento diário real e canais de venda
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200/80 rounded-lg text-xs text-zinc-600 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300 shadow-2xs">
            <Calendar className="h-3.5 w-3.5 text-zinc-400" />
            <span>Dia {currentDayOfMonth} de {totalDaysInMonth} ({daysRemainingInMonth} dias restantes)</span>
          </div>
        </div>
      </div>

      {/* AVISO EXCLUSIVO: Central de Produção não possui metas comerciais */}
      {currentUnit === "central" && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/90 dark:bg-amber-950/40 dark:border-amber-900/60 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200 shadow-xs">
          <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold block">
              Unidade de Fábrica / Apoio Produtivo: Central de Produção (CP)
            </span>
            <p className="text-amber-800 dark:text-amber-300 leading-relaxed font-normal">
              A Central de Produção é o polo fabril/industrial de preparação e logística interna do Grupo House 190, não atuando com atendimento direto ao público (sem salão, delivery ou iFood). Por essa razão, <strong>a Central de Produção não possui metas comerciais de vendas</strong>. Abaixo são exibidas as metas das unidades comerciais ativas.
            </p>
          </div>
        </div>
      )}

      {/* SELETOR RÁPIDO DE VISÃO: CONSOLIDADO OU LOJAS INDIVIDUAIS */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-xl border border-zinc-200/80 bg-zinc-50/70 dark:bg-zinc-900/60 dark:border-zinc-800 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider px-2 flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5 text-zinc-400" />
            Visualizar Metas:
          </span>
          {[
            { id: "all", label: "Visão Geral (Consolidado)", targetStr: "R$ 580k" },
            { id: "teixeira", label: "House 190 Teixeira", targetStr: "R$ 200k" },
            { id: "eunapolis", label: "House 190 Eunápolis", targetStr: "R$ 200k" },
            { id: "foodpark", label: "House Food Park", targetStr: "R$ 180k" },
          ].map((tab) => {
            const active = activeMetaUnit === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveMetaUnit(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                  active
                    ? "bg-zinc-900 text-white shadow-xs dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/60 border border-zinc-200/60 dark:border-zinc-700/60"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                    active
                      ? "bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {tab.targetStr}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cartão Macro de Projeção e Desempenho Global */}
      <div className="p-6 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 space-y-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                {activeMetaUnit === "all"
                  ? "Meta Consolidada do Grupo House (Teixeira + Eunápolis + Food Park)"
                  : activeMetaUnit === "foodpark"
                  ? "Meta House Food Park"
                  : activeMetaUnit === "eunapolis"
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

      {/* SEÇÃO 2: GRÁFICOS DONUT EXECUTIVOS COM TOOLTIP COMPLETO */}
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
                  <Tooltip content={<CustomProgressTooltip totalTarget={totalTarget} />} />
                  <Pie
                    data={progressDonutData}
                    nameKey="name"
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={85}
                    paddingAngle={3}
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

        {/* Donut 2: Composição por Canal COM TOOLTIP COM NOME DO CANAL */}
        <div className="p-5 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-zinc-400" />
              Composição das Vendas por Canal
            </h3>
            <span className="text-[11px] text-zinc-400">Passe o mouse para ver os detalhes</span>
          </div>

          <div className="relative h-52 w-full flex items-center justify-center">
            {isMounted && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<CustomChannelTooltip />} />
                  <Pie
                    data={channelDonutData}
                    nameKey="name"
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    {channelDonutData.map((entry, index) => (
                      <Cell key={`cell-c-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="absolute flex flex-col items-center justify-center pointer-events-none text-center">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
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

      {/* SEÇÃO 4: METAS DIÁRIAS, FATURAMENTO REAL, STATUS E QUANTO FALTOU */}
      <div className="p-6 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 space-y-5 shadow-2xs">
        {/* Banner de Destaque: HOJE (Quarta-feira) */}
        <div className="p-4 rounded-xl border border-zinc-200/80 bg-zinc-50/60 dark:bg-zinc-800/40 dark:border-zinc-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Acompanhamento de Hoje (Quarta-feira, 09/09)
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  todayBateu
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : todayRealizedTotal > 0
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {todayBateu ? "Meta do Dia Batida!" : todayRealizedTotal > 0 ? "Em Andamento" : "Aguardando Vendas"}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-baseline gap-3">
              <div>
                <span className="text-[10px] text-zinc-400 block font-medium">Faturamento Real Hoje:</span>
                <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50">
                  {formatCurrency(todayRealizedTotal)}
                </span>
              </div>
              <span className="text-zinc-300 dark:text-zinc-700 text-lg">/</span>
              <div>
                <span className="text-[10px] text-zinc-400 block font-medium">Meta do Dia:</span>
                <span className="text-lg font-bold font-mono text-zinc-500 dark:text-zinc-400">
                  {formatCurrency(todayTargetTotal)}
                </span>
              </div>
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                ({formatPercent(todayPercent)})
              </span>
            </div>
          </div>

          <div className="flex flex-col md:items-end gap-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {todayBateu ? "Superavit do Dia:" : "Falta para bater a meta de hoje:"}
            </span>
            <span
              className={`text-xl font-bold font-mono ${
                todayBateu
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {todayBateu
                ? `+ ${formatCurrency(todayDifference)} acima`
                : formatCurrency(Math.abs(todayDifference))}
            </span>
          </div>
        </div>

        {/* Feedback de Sincronização */}
        {syncFeedback && (
          <div
            className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
              syncFeedback.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-200"
                : syncFeedback.type === "info"
                ? "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-200"
                : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-200"
            }`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span>{syncFeedback.text}</span>
              {selectedWeekIndex !== 1 && (
                <button
                  type="button"
                  onClick={() => setSelectedWeekIndex(1)}
                  className="px-2 py-0.5 rounded bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700 transition-colors inline-flex items-center gap-1"
                >
                  Ir para a Semana Atual (07/09 a 13/09) →
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSyncFeedback(null)}
              className="text-xs font-bold opacity-70 hover:opacity-100 px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Destaque para Terça-feira (08/09) */}
        {getDayRevenue("2026-09-08").total === 0 ? (
          <div className="p-3.5 rounded-lg border border-amber-200 bg-amber-50/80 dark:bg-amber-950/30 dark:border-amber-900/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
            <div className="flex items-start sm:items-center gap-2.5">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <span className="font-bold text-amber-900 dark:text-amber-200 block sm:inline mr-1.5">
                  Faturamento de Terça-feira (08/09) não registrado:
                </span>
                <span className="text-amber-700 dark:text-amber-300">
                  Os valores do dia anterior ainda não foram importados ou inseridos (fica na aba "Semana Atual").
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedWeekIndex(1);
                  handleSyncDate("2026-09-08");
                }}
                disabled={syncingDate === "2026-09-08"}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-semibold text-xs inline-flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
              >
                <RotateCw className={`h-3.5 w-3.5 ${syncingDate === "2026-09-08" ? "animate-spin" : ""}`} />
                Sincronizar Terça-feira (Takeat)
              </button>
              <button
                type="button"
                onClick={() => handleOpenEditModal({ dateStr: "2026-09-08", dayName: "Terça-feira" })}
                className="px-3 py-1.5 bg-white dark:bg-zinc-800 border border-amber-300 dark:border-amber-700 hover:bg-amber-100/50 text-amber-900 dark:text-amber-200 rounded-md font-semibold text-xs inline-flex items-center gap-1.5 transition-colors"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Lançar Valor
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>
                <strong>Terça-feira (08/09) oficial:</strong> {formatCurrency(getDayRevenue("2026-09-08").total)} registrados.
              </span>
            </div>
            {selectedWeekIndex !== 1 && (
              <button
                type="button"
                onClick={() => setSelectedWeekIndex(1)}
                className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:underline inline-flex items-center gap-1 self-start sm:self-auto"
              >
                Conferir na Semana Atual (07/09 a 13/09) →
              </button>
            )}
          </div>
        )}

        {/* Cabeçalho da Seção com Seletor de Semanas e Ações em Massa */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pt-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-zinc-400" />
              Metas Diárias vs Faturamento Real (Por Dia da Semana)
            </h2>
            <p className="text-xs text-zinc-400">
              Acompanhamento oficial dia a dia — Selecione a semana ou sincronize com a Takeat
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Botões de Sincronização em Massa */}
            <button
              type="button"
              onClick={() => handleSyncWeek(selectedWeekIndex)}
              disabled={syncingDate !== null}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
              title="Sincronizar todos os dias já ocorridos desta semana na Takeat"
            >
              <RotateCw className={`h-3 w-3 ${syncingDate?.startsWith("week-") ? "animate-spin" : ""}`} />
              Sincronizar Esta Semana
            </button>

            <button
              type="button"
              onClick={handleSyncMonthDays}
              disabled={syncingDate !== null}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Consultar e sincronizar dia a dia de 01/09 até hoje na Takeat"
            >
              <RotateCw className={`h-3 w-3 ${syncingDate === "month-days" ? "animate-spin" : ""}`} />
              Sincronizar Mês Inteiro
            </button>

            {/* Seletor de Semana */}
            <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg text-xs">
              {monthWeeks.map((week, idx) => (
                <button
                  key={week.id}
                  onClick={() => setSelectedWeekIndex(idx)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    selectedWeekIndex === idx
                      ? "bg-white text-zinc-900 shadow-2xs font-semibold dark:bg-zinc-900 dark:text-zinc-100"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  {week.label.split(" ")[0]} {week.label.split(" ")[1]}
                  {idx === 1 && " • Atual"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tabela Diária com Realizado, Se Bateu e Quanto Faltou */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 uppercase text-[10px] font-semibold">
                <th className="py-3 px-3">Dia da Semana & Data</th>
                <th className="py-3 px-3 text-right">Salão (Meta | Real)</th>
                <th className="py-3 px-3 text-right">Delivery (Meta | Real)</th>
                <th className="py-3 px-3 text-right">iFood (Meta | Real)</th>
                <th className="py-3 px-3 text-right font-bold text-zinc-700 dark:text-zinc-300">
                  Meta do Dia
                </th>
                <th className="py-3 px-3 text-right font-bold text-zinc-900 dark:text-zinc-100">
                  Faturamento Real
                </th>
                <th className="py-3 px-3 text-center font-bold">Status</th>
                <th className="py-3 px-3 text-right font-bold">Quanto Faltou / Saldo</th>
                <th className="py-3 px-3 text-right font-bold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-mono">
              {currentWeek.days.map((row) => {
                const isToday = row.dateStr === todayStr;
                const isPast = row.dateStr < todayStr;
                const isFuture = row.dateStr > todayStr;
                const isYesterday = row.dateStr === yesterdayStr;

                const dayTargets = getDailyTargetForDay(row.dayIndex);
                const dayRev = getDayRevenue(row.dateStr);

                const targetTotal = dayTargets.total;
                const realizedTotal = dayRev.total;
                const difference = realizedTotal - targetTotal;
                const bateu = realizedTotal >= targetTotal;

                // Formatação da data (ex: 09/09)
                const dateParts = row.dateStr.split("-");
                const formattedDate = `${dateParts[2]}/${dateParts[1]}`;

                return (
                  <tr
                    key={row.dateStr}
                    className={`transition-colors ${
                      isToday
                        ? "bg-blue-50/40 dark:bg-blue-950/20 font-semibold"
                        : isYesterday
                        ? "bg-zinc-50/70 dark:bg-zinc-800/40"
                        : "hover:bg-zinc-50/40 dark:hover:bg-zinc-800/20"
                    }`}
                  >
                    {/* Dia da Semana e Data */}
                    <td className="py-3 px-3 font-sans font-medium text-zinc-900 dark:text-zinc-100">
                      <div className="flex items-center gap-2">
                        <span>
                          {row.dayName} <span className="text-zinc-400 font-normal">({formattedDate})</span>
                        </span>
                        {isToday && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-500 text-white tracking-wider">
                            Hoje
                          </span>
                        )}
                        {isYesterday && !isToday && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200 tracking-wider">
                            Ontem
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Salão: Meta vs Real */}
                    <td className="py-3 px-3 text-right">
                      <span className="text-zinc-400 text-[10px] block">{formatCurrency(dayTargets.salao)}</span>
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">
                        {isFuture ? "-" : formatCurrency(dayRev.salao)}
                      </span>
                    </td>

                    {/* Delivery: Meta vs Real */}
                    <td className="py-3 px-3 text-right">
                      <span className="text-zinc-400 text-[10px] block">{formatCurrency(dayTargets.delivery)}</span>
                      <span className="text-violet-600 dark:text-violet-400 font-semibold">
                        {isFuture ? "-" : formatCurrency(dayRev.delivery)}
                      </span>
                    </td>

                    {/* iFood: Meta vs Real */}
                    <td className="py-3 px-3 text-right">
                      <span className="text-zinc-400 text-[10px] block">{formatCurrency(dayTargets.ifood)}</span>
                      <span className="text-rose-600 dark:text-rose-400 font-semibold">
                        {isFuture ? "-" : formatCurrency(dayRev.ifood)}
                      </span>
                    </td>

                    {/* Meta Total do Dia */}
                    <td className="py-3 px-3 text-right font-bold text-zinc-600 dark:text-zinc-400">
                      {formatCurrency(targetTotal)}
                    </td>

                    {/* Faturamento Real do Dia */}
                    <td className="py-3 px-3 text-right font-bold text-zinc-900 dark:text-zinc-50 text-sm">
                      {isFuture ? (
                        <span className="text-zinc-400 font-normal text-xs">Aguardando</span>
                      ) : (
                        <div>
                          <div>{formatCurrency(realizedTotal)}</div>
                          {realizedTotal === 0 && !isFuture && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(row)}
                              className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline block font-sans font-normal"
                            >
                              + Lançar
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Status: Bateu ou Não */}
                    <td className="py-3 px-3 text-center">
                      {isFuture ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          A Realizar
                        </span>
                      ) : bateu ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          Bateu a Meta
                        </span>
                      ) : isToday ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          <Clock className="h-3 w-3" />
                          Em Andamento
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                          <XCircle className="h-3 w-3" />
                          Não Bateu
                        </span>
                      )}
                    </td>

                    {/* Diferença / Quanto Faltou */}
                    <td className="py-3 px-3 text-right">
                      {isFuture ? (
                        <span className="text-zinc-400 font-sans">-</span>
                      ) : bateu ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs inline-flex items-center justify-end gap-0.5">
                          <ArrowUpRight className="h-3.5 w-3.5" />+ {formatCurrency(difference)}
                        </span>
                      ) : (
                        <span className="text-rose-600 dark:text-rose-400 font-bold text-xs inline-flex items-center justify-end gap-0.5">
                          <ArrowDownRight className="h-3.5 w-3.5" /> Faltou {formatCurrency(Math.abs(difference))}
                        </span>
                      )}
                    </td>

                    {/* Ações: Sincronizar e Editar */}
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          title="Sincronizar este dia da Takeat"
                          onClick={() => handleSyncDate(row.dateStr)}
                          disabled={syncingDate === row.dateStr || isFuture}
                          className="p-1.5 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-30"
                        >
                          <RotateCw className={`h-3.5 w-3.5 ${syncingDate === row.dateStr ? "animate-spin text-blue-600" : ""}`} />
                        </button>
                        <button
                          type="button"
                          title="Lançar ou Ajustar Faturamento Real deste dia"
                          onClick={() => handleOpenEditModal(row)}
                          disabled={isFuture}
                          className="p-1.5 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-30"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                      </div>
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

      {/* MODAL PARA LANÇAR / EDITAR FATURAMENTO REAL DO DIA */}
      {editingDay && (
        <Modal
          isOpen={!!editingDay}
          onClose={() => setEditingDay(null)}
          title={`Faturamento Real — ${editingDay.dayName} (${editingDay.dateStr.split("-").reverse().join("/")})`}
          subtitle={`Informe os valores oficiais por canal ou sincronize diretamente da Takeat API`}
          maxWidth="md"
        >
          <form onSubmit={handleSaveDailyRevenue} className="space-y-4 pt-2">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Unidade de Destino
                </label>
                <select
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Consolidado Geral (Rateio proporcional entre as 3 lojas)</option>
                  <option value="teixeira">House 190 Teixeira de Freitas</option>
                  <option value="eunapolis">House 190 Eunápolis</option>
                  <option value="foodpark">House Food Park</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1 flex items-center justify-between">
                  <span>Salão (Balcão + Mesa)</span>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-normal">Canal Salão</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-zinc-400">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={editSalao}
                    onChange={(e) => setEditSalao(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1 flex items-center justify-between">
                  <span>Delivery Próprio (WhatsApp / Cardápio Digital)</span>
                  <span className="text-[10px] text-violet-600 dark:text-violet-400 font-normal">Canal Delivery Próprio</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-zinc-400">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={editDelivery}
                    onChange={(e) => setEditDelivery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1 flex items-center justify-between">
                  <span>iFood</span>
                  <span className="text-[10px] text-rose-600 dark:text-rose-400 font-normal">Canal iFood</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-zinc-400">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={editIfood}
                    onChange={(e) => setEditIfood(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {/* Total Calculado */}
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg flex items-center justify-between border border-zinc-200/60 dark:border-zinc-700/60">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Total do Dia:</span>
                <span className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100">
                  {formatCurrency(
                    (parseFloat(editSalao.replace(/\./g, "").replace(",", ".")) || 0) +
                    (parseFloat(editDelivery.replace(/\./g, "").replace(",", ".")) || 0) +
                    (parseFloat(editIfood.replace(/\./g, "").replace(",", ".")) || 0)
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => handleSyncDate(editingDay.dateStr)}
                disabled={syncingDate === editingDay.dateStr}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-medium disabled:opacity-50"
              >
                <RotateCw className={`h-3.5 w-3.5 ${syncingDate === editingDay.dateStr ? "animate-spin" : ""}`} />
                Puxar da Takeat
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingDay(null)}
                  className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                >
                  Cancelar
                </button>
                <Button type="submit" size="sm">
                  <Save className="h-3.5 w-3.5 mr-1" />
                  Salvar Faturamento
                </Button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
