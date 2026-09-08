"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  TrendingUp,
  Calendar,
  DollarSign,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Store,
  Truck,
  ShoppingBag,
  Settings2,
  X,
  Building2,
  Copy,
  Check,
  Percent,
} from "lucide-react";
import { store } from "@/services/store";
import { useUnit } from "@/contexts/UnitContext";
import { UnitId } from "@/types";
import { TakeatRevenueRecord } from "@/types/takeat";
import { formatCurrency, formatPercent, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { QuickCreateModal } from "@/components/layout/QuickCreateModal";
import {
  authenticateTakeat,
  sanitizeToken,
  inspectTakeatToken,
  DiscoveredStore,
} from "@/services/takeatService";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";

const CONSOLE_TOKEN_HELPER =
  "copy(localStorage.getItem('@gddashboard:token') || JSON.parse(localStorage.getItem('@managerarea:token') || '\"\"') || localStorage.getItem('token'))";

function getTodayBahiaDate(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const bahia = new Date(utc - 3 * 3600000);
  return bahia.toISOString().split("T")[0];
}

function getYesterdayBahiaDate(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const bahia = new Date(utc - 3 * 3600000 - 86400000);
  return bahia.toISOString().split("T")[0];
}

function getCurrentBahiaMonth(): string {
  return getTodayBahiaDate().substring(0, 7);
}

function getPreviousBahiaMonth(): string {
  const [yearStr, monthStr] = getCurrentBahiaMonth().split("-");
  let y = parseInt(yearStr, 10);
  let m = parseInt(monthStr, 10) - 1;
  if (m === 0) {
    m = 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

const UNIT_LABELS: Record<string, string> = {
  eunapolis: "House 190 Eunápolis",
  teixeira: "House 190 Teixeira de Freitas",
  foodpark: "House Foodpark",
  central: "Central de Produção",
};

export default function FaturamentoPage() {
  const { currentUnit, activeUnitData } = useUnit();

  // Mode: Diário vs Mensal
  const [viewMode, setViewMode] = useState<"daily" | "monthly">("daily");
  const [selectedDate, setSelectedDate] = useState<string>(getYesterdayBahiaDate());
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentBahiaMonth());

  const [takeatRevenues, setTakeatRevenues] = useState<TakeatRevenueRecord[]>([]);
  const [isCredsModalOpen, setIsCredsModalOpen] = useState(false);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);

  // Sync state & user feedback
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // Unit credentials state
  const [selectedSyncUnit, setSelectedSyncUnit] = useState<Exclude<UnitId, "all">>(
    currentUnit === "all" ? "eunapolis" : currentUnit
  );
  const [unitConnections, setUnitConnections] = useState<Record<string, boolean>>({});

  // Credentials Modal state
  const [credsEmail, setCredsEmail] = useState("");
  const [credsPassword, setCredsPassword] = useState("");
  const [credsManualToken, setCredsManualToken] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "token">("login");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [credsError, setCredsError] = useState<string | null>(null);
  const [applyToAllUnits, setApplyToAllUnits] = useState(true);
  const [copiedHelper, setCopiedHelper] = useState(false);

  // Carregamento de dados limpos e sincronizados
  const refreshData = () => {
    const allTakeat = store.getTakeatRevenues();
    setTakeatRevenues(
      currentUnit === "all"
        ? allTakeat
        : allTakeat.filter((t) => t.unitId === currentUnit)
    );

    const units: Exclude<UnitId, "all">[] = ["eunapolis", "teixeira", "foodpark", "central"];
    const connMap: Record<string, boolean> = {};
    for (const u of units) {
      const c = store.getTakeatCredentials(u);
      const hasToken = Boolean(c && c.token && c.token.startsWith("eyJ"));
      const hasPass = Boolean(c && c.email && c.password);
      connMap[u] = hasToken || hasPass;
    }
    setUnitConnections(connMap);
  };

  useEffect(() => {
    refreshData();
    const handleUpdate = () => refreshData();
    window.addEventListener("house190_data_updated", handleUpdate);
    return () => window.removeEventListener("house190_data_updated", handleUpdate);
  }, [currentUnit]);

  // Se o usuário alternar a unidade no topo, atualiza a unidade de seleção padrão
  useEffect(() => {
    if (currentUnit !== "all") {
      setSelectedSyncUnit(currentUnit);
    }
  }, [currentUnit]);

  // Filtragem dos registros conforme o modo (Diário ou Mensal)
  const activePeriodStr = viewMode === "daily" ? selectedDate : selectedMonth;

  const filteredRecords = useMemo(() => {
    return takeatRevenues.filter((r) => {
      if (viewMode === "daily") {
        return r.date === selectedDate;
      } else {
        return r.date.startsWith(selectedMonth);
      }
    });
  }, [takeatRevenues, viewMode, selectedDate, selectedMonth]);

  // KPIs Oficiais
  const totalSalao = filteredRecords.reduce((acc, cur) => acc + cur.salao, 0);
  const totalDelivery = filteredRecords.reduce((acc, cur) => acc + cur.delivery, 0);
  const totalIfood = filteredRecords.reduce((acc, cur) => acc + cur.ifood, 0);
  const totalGeral = filteredRecords.reduce((acc, cur) => acc + cur.totalRevenue, 0);

  const pctSalao = totalGeral > 0 ? (totalSalao / totalGeral) * 100 : 0;
  const pctDelivery = totalGeral > 0 ? (totalDelivery / totalGeral) * 100 : 0;
  const pctIfood = totalGeral > 0 ? (totalIfood / totalGeral) * 100 : 0;

  const isAnyUnitConnected = Object.values(unitConnections).some(Boolean);
  const isCurrentConnected =
    currentUnit === "all" ? isAnyUnitConnected : Boolean(unitConnections[currentUnit]);

  // Sincronização oficial com a Takeat
  const handleSyncTakeat = async () => {
    setSyncing(true);
    setSyncMessage(null);

    try {
      const unitsToSync: Exclude<UnitId, "all">[] =
        currentUnit === "all"
          ? ["eunapolis", "teixeira", "foodpark"]
          : [currentUnit];

      const targetPeriod = viewMode === "daily" ? selectedDate : selectedMonth;
      const unconfigured = unitsToSync.filter((u) => !unitConnections[u]);

      if (unconfigured.length === unitsToSync.length) {
        setIsCredsModalOpen(true);
        setSyncMessage({
          text: "Nenhuma conta da Takeat conectada ainda. Conecte sua conta para importar as vendas reais.",
          type: "error",
        });
        setSyncing(false);
        return;
      }

      let successCount = 0;
      const errors: string[] = [];

      for (const u of unitsToSync) {
        if (!unitConnections[u]) continue;
        const res = await store.syncTakeatUnit(u, targetPeriod, "diretoria", "all");
        if (res.success) {
          successCount++;
        } else {
          errors.push(`${res.unitName}: ${res.error}`);
        }
      }

      refreshData();

      if (errors.length > 0) {
        setSyncMessage({
          text: `Aviso na sincronização: ${errors.join(" | ")}`,
          type: "error",
        });
      } else if (successCount > 0) {
        const periodLabel =
          viewMode === "daily"
            ? formatDate(selectedDate)
            : `mês de ${selectedMonth}`;
        setSyncMessage({
          text: `Vendas oficiais sincronizadas com sucesso da Takeat para ${periodLabel}!`,
          type: "success",
        });
      }
    } catch (err: any) {
      setSyncMessage({
        text: `Falha na sincronização: ${err.message}`,
        type: "error",
      });
    } finally {
      setSyncing(false);
    }
  };

  // Abrir Modal de Credenciais
  const handleOpenCredsModal = (unitId?: Exclude<UnitId, "all">) => {
    const targetUnit = unitId || (currentUnit === "all" ? "eunapolis" : currentUnit);
    setSelectedSyncUnit(targetUnit);
    const existing = store.getTakeatCredentials(targetUnit);
    const cleanEmail =
      existing.email && !existing.email.includes("@house190.com.br")
        ? existing.email
        : "";
    setCredsEmail(cleanEmail);
    setCredsPassword(existing.password || "");
    setCredsManualToken(existing.token && existing.token.startsWith("eyJ") ? existing.token : "");
    setCredsError(null);
    setIsCredsModalOpen(true);
  };

  // Salvar Credenciais no Modal
  const handleSaveCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setCredsError(null);

    try {
      let liveToken = "";
      let restaurantId: number | string | undefined = undefined;
      let restaurantName: string | undefined = undefined;
      let discoveredStores: DiscoveredStore[] = [];

      if (authMode === "login") {
        if (!credsEmail || !credsPassword) {
          throw new Error("Por favor, preencha o e-mail e a senha de acesso ao Takeat.");
        }
        const authRes = await authenticateTakeat(credsEmail, credsPassword);
        liveToken = authRes.token;
        restaurantId = authRes.restaurantId;
        restaurantName = authRes.restaurantName;
        discoveredStores = authRes.discoveredStores || [];
      } else {
        const clean = sanitizeToken(credsManualToken);
        if (!clean) {
          throw new Error("Informe o token Bearer da Takeat.");
        }
        liveToken = clean;
        try {
          const inspection = await inspectTakeatToken(clean);
          restaurantId = inspection.restaurantId;
          restaurantName = inspection.restaurantName;
          discoveredStores = inspection.discoveredStores || [];
        } catch {}
      }

      // Salva unidade principal
      const matchedForSelected = discoveredStores.find((s) => s.matchedUnitId === selectedSyncUnit);
      const selectedRestId = matchedForSelected ? matchedForSelected.id : restaurantId;
      const selectedRestName = matchedForSelected ? matchedForSelected.name : restaurantName;

      store.saveTakeatCredentials({
        unitId: selectedSyncUnit,
        email: credsEmail,
        password: credsPassword || undefined,
        token: liveToken,
        restaurantId: selectedRestId,
        restaurantName: selectedRestName,
        tokenExpiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      });

      // Aplica a todas as unidades se selecionado ou detectado
      const otherUnits: Exclude<UnitId, "all">[] = (
        ["eunapolis", "teixeira", "foodpark", "central"] as const
      ).filter((u) => u !== selectedSyncUnit);

      for (const u of otherUnits) {
        const matched = discoveredStores.find((s) => s.matchedUnitId === u);
        if (matched) {
          store.saveTakeatCredentials({
            unitId: u,
            email: credsEmail,
            password: credsPassword || undefined,
            token: liveToken,
            restaurantId: matched.id,
            restaurantName: matched.name,
            tokenExpiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
          });
        } else if (applyToAllUnits) {
          store.saveTakeatCredentials({
            unitId: u,
            email: credsEmail,
            password: credsPassword || undefined,
            token: liveToken,
            tokenExpiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      }

      setIsCredsModalOpen(false);
      refreshData();

      const detectedNames = discoveredStores
        .map((s) => `${s.name}${s.matchedUnitId ? ` (${UNIT_LABELS[s.matchedUnitId]})` : ""}`)
        .join(", ");

      setSyncMessage({
        text: `Takeat conectada com sucesso! ${detectedNames ? `Filiais identificadas: ${detectedNames}. ` : ""}Importando vendas...`,
        type: "success",
      });

      // Dispara sincronização inicial
      setSyncing(true);
      const targetPeriod = viewMode === "daily" ? selectedDate : selectedMonth;
      const unitsToSync: Exclude<UnitId, "all">[] =
        currentUnit === "all" ? ["eunapolis", "teixeira", "foodpark"] : [selectedSyncUnit];

      for (const u of unitsToSync) {
        await store.syncTakeatUnit(u, targetPeriod, "diretoria", "all");
      }
      refreshData();
    } catch (err: any) {
      setCredsError(err.message || "Erro desconhecido ao conectar com a Takeat.");
    } finally {
      setIsAuthenticating(false);
      setSyncing(false);
    }
  };

  // Desconectar Conta
  const handleDisconnect = () => {
    store.removeTakeatCredentials(selectedSyncUnit);
    store.clearTakeatRevenues(selectedSyncUnit);
    setIsCredsModalOpen(false);
    refreshData();
    setSyncMessage({
      text: `Conta da Takeat desconectada para ${UNIT_LABELS[selectedSyncUnit]}.`,
      type: "success",
    });
  };

  // Montagem de dados para o gráfico
  const chartData = useMemo(() => {
    if (viewMode === "daily") {
      // Gráfico de evolução dos últimos 7 dias gravados
      const byDate: Record<string, { date: string; label: string; total: number }> = {};
      for (const r of takeatRevenues) {
        if (!byDate[r.date]) {
          const parts = r.date.split("-");
          byDate[r.date] = {
            date: r.date,
            label: `${parts[2] || r.date}/${parts[1] || ""}`,
            total: 0,
          };
        }
        byDate[r.date].total += r.totalRevenue;
      }
      return Object.values(byDate)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-7);
    } else {
      // Gráfico de comparação por Unidade no Mês
      const byUnit: Record<string, number> = {
        eunapolis: 0,
        teixeira: 0,
        foodpark: 0,
      };
      for (const r of filteredRecords) {
        if (byUnit[r.unitId] !== undefined) {
          byUnit[r.unitId] += r.totalRevenue;
        }
      }
      return [
        { label: "Eunápolis", total: byUnit.eunapolis },
        { label: "Teixeira", total: byUnit.teixeira },
        { label: "Foodpark", total: byUnit.foodpark },
      ];
    }
  }, [takeatRevenues, filteredRecords, viewMode]);

  return (
    <div className="space-y-6">
      {/* Header Executivo & Clean */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-zinc-200/70 pb-4 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Faturamento & Vendas
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                isCurrentConnected
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/40"
                  : "bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/40"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isCurrentConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                }`}
              />
              {isCurrentConnected ? "Takeat Conectada" : "Takeat Desconectada"}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {activeUnitData.id === "all"
              ? "Consolidação de vendas oficiais de todas as filiais House 190"
              : `Faturamento oficial da filial ${activeUnitData.name}`}
          </p>
        </div>

        {/* Controles de Período & Sincronização */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Alternador Diário / Mensal */}
          <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setViewMode("daily")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                viewMode === "daily"
                  ? "bg-white text-zinc-900 shadow-2xs dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Diário
            </button>
            <button
              type="button"
              onClick={() => setViewMode("monthly")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                viewMode === "monthly"
                  ? "bg-white text-zinc-900 shadow-2xs dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Mensal
            </button>
          </div>

          {/* Seletores de Data / Mês */}
          {viewMode === "daily" ? (
            <div className="flex items-center gap-1.5 bg-white border border-zinc-200 rounded-lg p-1 dark:bg-zinc-900 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setSelectedDate(getTodayBahiaDate())}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  selectedDate === getTodayBahiaDate()
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(getYesterdayBahiaDate())}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  selectedDate === getYesterdayBahiaDate()
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                Ontem
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-7 px-2 text-xs bg-transparent border-0 text-zinc-800 font-mono focus:outline-none dark:text-zinc-200"
              />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-white border border-zinc-200 rounded-lg p-1 dark:bg-zinc-900 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setSelectedMonth(getCurrentBahiaMonth())}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  selectedMonth === getCurrentBahiaMonth()
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                Este Mês
              </button>
              <button
                type="button"
                onClick={() => setSelectedMonth(getPreviousBahiaMonth())}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  selectedMonth === getPreviousBahiaMonth()
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                Mês Anterior
              </button>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-7 px-2 text-xs bg-transparent border-0 text-zinc-800 font-mono focus:outline-none dark:text-zinc-200"
              />
            </div>
          )}

          {/* Botão de Sincronizar Vendas Takeat */}
          <Button
            size="sm"
            onClick={handleSyncTakeat}
            disabled={syncing}
            isLoading={syncing}
            className="bg-zinc-900 text-white hover:bg-zinc-800 gap-1.5 shadow-2xs dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            <span>Sincronizar Vendas</span>
          </Button>

          {/* Botão de Configurações da Conexão */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenCredsModal()}
            title="Configurar credenciais Takeat"
            className="gap-1.5 text-zinc-600 hover:text-zinc-900 border-zinc-200 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Configurações</span>
          </Button>
        </div>
      </div>

      {/* Alerta de Feedback Elegante e Dispensável */}
      {syncMessage && (
        <div
          className={`p-3.5 rounded-lg text-xs flex items-center justify-between gap-3 border transition-all ${
            syncMessage.type === "success"
              ? "bg-emerald-50/70 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-900/40 dark:text-emerald-300"
              : "bg-rose-50/70 border-rose-200 text-rose-900 dark:bg-rose-950/20 dark:border-rose-900/40 dark:text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {syncMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            )}
            <span className="font-medium">{syncMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncMessage(null)}
            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 4 Cards Principais de Indicadores Oficiais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Faturamento Total */}
        <div className="p-4 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              {viewMode === "daily" ? "Faturamento do Dia" : "Faturamento do Mês"}
            </span>
            <div className="h-7 w-7 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-zinc-900 font-mono dark:text-zinc-50">
              {formatCurrency(totalGeral)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
            <span>Período:</span>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              {viewMode === "daily" ? formatDate(selectedDate) : selectedMonth}
            </span>
          </div>
        </div>

        {/* Salão & Balcão */}
        <div className="p-4 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Salão & Balcão
            </span>
            <div className="h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <Store className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-zinc-900 font-mono dark:text-zinc-50">
              {formatCurrency(totalSalao)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>Representatividade</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {formatPercent(pctSalao)}
            </span>
          </div>
        </div>

        {/* Delivery Direto */}
        <div className="p-4 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Delivery Próprio
            </span>
            <div className="h-7 w-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <Truck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-zinc-900 font-mono dark:text-zinc-50">
              {formatCurrency(totalDelivery)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>Representatividade</span>
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {formatPercent(pctDelivery)}
            </span>
          </div>
        </div>

        {/* iFood Oficial */}
        <div className="p-4 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              iFood
            </span>
            <div className="h-7 w-7 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-zinc-900 font-mono dark:text-zinc-50">
              {formatCurrency(totalIfood)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>Representatividade</span>
            <span className="font-semibold text-rose-600 dark:text-rose-400">
              {formatPercent(pctIfood)}
            </span>
          </div>
        </div>
      </div>

      {/* Gráfico & Distribuição por Canais */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico Visual */}
        <div className="lg:col-span-2 p-5 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                {viewMode === "daily"
                  ? "Evolução do Faturamento Oficial"
                  : "Faturamento por Unidade"}
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {viewMode === "daily"
                  ? "Histórico recente sincronizado diretamente da Takeat"
                  : `Comparativo das filiais para ${selectedMonth}`}
              </p>
            </div>
          </div>

          {chartData.length > 0 && chartData.some((d) => d.total > 0) ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#88888820"
                  />
                  <XAxis
                    dataKey="label"
                    stroke="#88888880"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#88888880"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="rounded-lg border border-zinc-200 bg-white p-2.5 shadow-md text-xs dark:bg-zinc-900 dark:border-zinc-800">
                            <span className="font-medium text-zinc-700 dark:text-zinc-200 block mb-1">
                              {payload[0].payload.label}
                            </span>
                            <span className="font-mono font-bold text-zinc-900 dark:text-zinc-50">
                              {formatCurrency(Number(payload[0].value) || 0)}
                            </span>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]} fill="#18181b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-zinc-200 rounded-lg dark:border-zinc-800">
              <RefreshCw className="h-8 w-8 text-zinc-300 dark:text-zinc-700 mb-2 animate-pulse" />
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Nenhum faturamento sincronizado para este período
              </p>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1 max-w-xs">
                Clique no botão &quot;Sincronizar Vendas&quot; no topo para puxar os dados oficiais da Takeat.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSyncTakeat}
                disabled={syncing}
                className="mt-3 text-xs"
              >
                Sincronizar Agora
              </Button>
            </div>
          )}
        </div>

        {/* Distribuição por Canal */}
        <div className="p-5 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs space-y-4">
          <div>
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Mix de Canais de Venda
            </h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Participação de cada canal no período selecionado
            </p>
          </div>

          <div className="space-y-4 pt-2">
            {/* Salão */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Store className="h-3.5 w-3.5 text-blue-500" />
                  Salão & Balcão
                </span>
                <div className="text-right">
                  <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatCurrency(totalSalao)}
                  </span>
                  <span className="text-[10px] text-zinc-400 ml-1.5 font-mono">
                    ({formatPercent(pctSalao)})
                  </span>
                </div>
              </div>
              <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden dark:bg-zinc-800">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${pctSalao}%` }}
                />
              </div>
            </div>

            {/* Delivery */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5 text-amber-500" />
                  Delivery Próprio
                </span>
                <div className="text-right">
                  <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatCurrency(totalDelivery)}
                  </span>
                  <span className="text-[10px] text-zinc-400 ml-1.5 font-mono">
                    ({formatPercent(pctDelivery)})
                  </span>
                </div>
              </div>
              <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden dark:bg-zinc-800">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${pctDelivery}%` }}
                />
              </div>
            </div>

            {/* iFood */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <ShoppingBag className="h-3.5 w-3.5 text-rose-500" />
                  iFood
                </span>
                <div className="text-right">
                  <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatCurrency(totalIfood)}
                  </span>
                  <span className="text-[10px] text-zinc-400 ml-1.5 font-mono">
                    ({formatPercent(pctIfood)})
                  </span>
                </div>
              </div>
              <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden dark:bg-zinc-800">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all duration-500"
                  style={{ width: `${pctIfood}%` }}
                />
              </div>
            </div>
          </div>

          <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-100 dark:bg-zinc-800/40 dark:border-zinc-800 text-[11px] text-zinc-500 mt-4 space-y-1">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300 block">
              Auditoria de Dados Oficiais
            </span>
            <p>
              Canais calculados via Takeat: Salão (balcão + mesa), Delivery e iFood.
              Dados 100% integrados em tempo real.
            </p>
          </div>
        </div>
      </div>

      {/* Tabela Detalhada de Registros Oficiais */}
      <div className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs">
        <div className="p-4 border-b border-zinc-200/70 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Detalhamento de Vendas por Filial
            </h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Valores oficiais registrados para {viewMode === "daily" ? formatDate(selectedDate) : selectedMonth}
            </p>
          </div>
          <span className="text-xs text-zinc-400 font-mono">
            {filteredRecords.length} registro(s)
          </span>
        </div>

        {filteredRecords.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50/70 border-b border-zinc-200/60 dark:bg-zinc-800/40 dark:border-zinc-800 text-zinc-500">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Período / Data</th>
                  <th className="py-2.5 px-4 font-semibold">Filial House 190</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Salão & Balcão</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Delivery</th>
                  <th className="py-2.5 px-4 font-semibold text-right">iFood</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Total Oficial</th>
                  <th className="py-2.5 px-4 font-semibold text-center">Origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredRecords.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                      {r.date.length === 7 ? r.date : formatDate(r.date)}
                    </td>
                    <td className="py-3 px-4 font-medium text-zinc-700 dark:text-zinc-300">
                      {UNIT_LABELS[r.unitId] || r.unitId}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-zinc-700 dark:text-zinc-300">
                      {formatCurrency(r.salao)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-zinc-700 dark:text-zinc-300">
                      {formatCurrency(r.delivery)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-zinc-700 dark:text-zinc-300">
                      {formatCurrency(r.ifood)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 dark:text-zinc-50">
                      {formatCurrency(r.totalRevenue)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60">
                        <Check className="h-3 w-3" />
                        Takeat Oficial
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center space-y-2">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Nenhum dado de vendas importado para o período selecionado.
            </p>
            <Button
              size="sm"
              onClick={handleSyncTakeat}
              disabled={syncing}
              className="bg-zinc-900 text-white text-xs gap-1.5 dark:bg-zinc-100 dark:text-zinc-900"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              <span>Sincronizar Vendas Takeat Agora</span>
            </Button>
          </div>
        )}
      </div>

      {/* Modal Limpo de Conexão com a Takeat */}
      <Modal
        isOpen={isCredsModalOpen}
        onClose={() => setIsCredsModalOpen(false)}
        title={`Conectar Integração Takeat — ${UNIT_LABELS[selectedSyncUnit]}`}
        subtitle="Conexão oficial com Takeat Multilojas e Painel Restaurante"
      >
        <form onSubmit={handleSaveCreds} className="space-y-4 text-xs">
          <div>
            <label className="block text-zinc-700 font-medium mb-1 dark:text-zinc-300">
              Unidade a Configurar
            </label>
            <select
              value={selectedSyncUnit}
              onChange={(e) => {
                const u = e.target.value as any;
                setSelectedSyncUnit(u);
                const ex = store.getTakeatCredentials(u);
                setCredsEmail(ex.email || "");
                setCredsPassword(ex.password || "");
                setCredsManualToken(ex.token || "");
                setCredsError(null);
              }}
              className="w-full h-9 px-3 rounded border border-zinc-200 bg-white dark:bg-zinc-800 dark:border-zinc-700 focus:outline-none"
            >
              <option value="eunapolis">House 190 Eunápolis</option>
              <option value="teixeira">House 190 Teixeira de Freitas</option>
              <option value="foodpark">House Foodpark</option>
              <option value="central">Central de Produção</option>
            </select>
          </div>

          <div className="flex border-b border-zinc-200 dark:border-zinc-700 pb-1 gap-4">
            <button
              type="button"
              onClick={() => setAuthMode("login")}
              className={`pb-1 text-xs font-semibold transition-colors ${
                authMode === "login"
                  ? "border-b-2 border-zinc-900 text-zinc-900 dark:text-zinc-100 dark:border-zinc-100"
                  : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              }`}
            >
              E-mail e Senha (Recomendado)
            </button>
            <button
              type="button"
              onClick={() => setAuthMode("token")}
              className={`pb-1 text-xs font-semibold transition-colors ${
                authMode === "token"
                  ? "border-b-2 border-zinc-900 text-zinc-900 dark:text-zinc-100 dark:border-zinc-100"
                  : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              }`}
            >
              Token Bearer Direto
            </button>
          </div>

          {credsError && (
            <div className="p-3 rounded-md bg-rose-50 border border-rose-200/80 text-rose-800 dark:bg-rose-950/30 dark:border-rose-900/60 dark:text-rose-300 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{credsError}</span>
            </div>
          )}

          {authMode === "login" ? (
            <>
              <div>
                <label className="block text-zinc-700 font-medium mb-1 dark:text-zinc-300">
                  E-mail de Acesso Takeat (Multilojas ou Dashboard)
                </label>
                <input
                  type="email"
                  required
                  placeholder="ex: contato@house190.com.br"
                  value={credsEmail}
                  onChange={(e) => setCredsEmail(e.target.value)}
                  className="w-full h-9 px-3 rounded border border-zinc-200 bg-white dark:bg-zinc-800 dark:border-zinc-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-700 font-medium mb-1 dark:text-zinc-300">
                  Senha da Conta Takeat
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={credsPassword}
                  onChange={(e) => setCredsPassword(e.target.value)}
                  className="w-full h-9 px-3 rounded border border-zinc-200 bg-white dark:bg-zinc-800 dark:border-zinc-700 focus:outline-none"
                />
                <span className="text-[10px] text-zinc-400 mt-1 block">
                  Autentica com Takeat Multistores e Dashboard, identifica automaticamente as lojas e atualiza os tokens oficiais.
                </span>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-zinc-700 font-medium mb-1 dark:text-zinc-300">
                Token Bearer Takeat
              </label>
              <textarea
                rows={3}
                required
                placeholder="Cole o token JWT (eyJhbGciOi...)"
                value={credsManualToken}
                onChange={(e) => setCredsManualToken(e.target.value)}
                className="w-full p-2.5 rounded border border-zinc-200 bg-white font-mono text-[11px] dark:bg-zinc-800 dark:border-zinc-700 focus:outline-none"
              />
              <div className="mt-2 p-2.5 bg-zinc-50 rounded border border-zinc-200 text-[11px] text-zinc-600 space-y-2 dark:bg-zinc-800/50 dark:border-zinc-700 dark:text-zinc-300">
                <p className="font-semibold text-zinc-700 dark:text-zinc-200">
                  Como copiar da aba aberta no Takeat:
                </p>
                <p>1. Na aba onde o Takeat está aberto, aperte <b>F12</b> (ou Cmd+Option+I).</p>
                <p>2. Vá na aba <b>Console</b> e execute:</p>
                <div className="flex items-center gap-2 bg-zinc-100 p-2 rounded font-mono text-[10px] text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                  <span className="flex-1 truncate">
                    copy(localStorage.getItem('@gddashboard:token') || JSON.parse(localStorage.getItem('@managerarea:token') || '""'))
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(CONSOLE_TOKEN_HELPER);
                      setCopiedHelper(true);
                      setTimeout(() => setCopiedHelper(false), 2000);
                    }}
                    className="px-2 py-1 bg-white border border-zinc-300 rounded hover:bg-zinc-50 text-[10px] shrink-0 dark:bg-zinc-800 dark:border-zinc-700"
                  >
                    {copiedHelper ? "Copiado!" : "Copiar Comando"}
                  </button>
                </div>
                <p>3. O token será copiado para sua área de transferência. Basta colar acima.</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <input
              type="checkbox"
              id="applyAllUnits"
              checked={applyToAllUnits}
              onChange={(e) => setApplyToAllUnits(e.target.checked)}
              className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-700"
            />
            <label
              htmlFor="applyAllUnits"
              className="text-zinc-600 dark:text-zinc-300 select-none cursor-pointer"
            >
              Configurar automaticamente todas as filiais House 190 com esta conta
            </label>
          </div>

          <div className="pt-2 flex items-center justify-between gap-2">
            {unitConnections[selectedSyncUnit] ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 dark:border-rose-900/60 dark:hover:bg-rose-950/30"
              >
                Desconectar Conta
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isAuthenticating}
                onClick={() => setIsCredsModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                isLoading={isAuthenticating}
                className="bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900"
              >
                {isAuthenticating ? "Conectando..." : "Conectar e Sincronizar"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <QuickCreateModal
        isOpen={isQuickCreateOpen}
        onClose={() => setIsQuickCreateOpen(false)}
        defaultTab="revenue"
      />
    </div>
  );
}
