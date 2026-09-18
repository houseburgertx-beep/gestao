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
  Check,
  Percent,
  Layers,
  Sparkles,
} from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { calculate } from "@/domain/management/engine";
import { currency as formatManagedCurrency, monthEnd, percent as formatManagedPercent } from "@/domain/management/model";
import { store } from "@/services/store";
import { useUnit } from "@/contexts/UnitContext";
import { UnitId } from "@/types";
import { TakeatRevenueRecord } from "@/types/takeat";
import { formatCurrency, formatPercent, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { QuickCreateModal } from "@/components/layout/QuickCreateModal";
import {
  authenticateTakeat,
  sanitizeToken,
  inspectTakeatToken,
  DiscoveredStore,
  getTodayBahiaDate,
  getYesterdayBahiaDate,
  getCurrentBahiaMonth,
  getPreviousBahiaMonth,
  TAKEAT_OPERATIONS,
  BrandId,
} from "@/services/takeatService";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const CONSOLE_TOKEN_HELPER =
  "copy(localStorage.getItem('@gddashboard:token') || JSON.parse(localStorage.getItem('@managerarea:token') || '\"\"') || localStorage.getItem('token'))";

const UNIT_LABELS: Record<string, string> = {
  teixeira: "House 190 Teixeira de Freitas",
  eunapolis: "House 190 Eunápolis",
  foodpark: "House Foodpark",
  central: "Central de Produção",
};

export default function FaturamentoPage() {
  const { data: managementData, filters: managementFilters } = useManagement();
  const { currentUnit, setCurrentUnit } = useUnit();

  // Mode: Diário vs Mensal
  const [viewMode, setViewMode] = useState<"daily" | "monthly">("daily");
  const [selectedDate, setSelectedDate] = useState<string>(getYesterdayBahiaDate());
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentBahiaMonth());

  // Loja Selecionada na tela (100% individual por padrão)
  const [activeStoreTab, setActiveStoreTab] = useState<"teixeira" | "eunapolis" | "foodpark" | "all">(
    currentUnit === "all" ? "teixeira" : currentUnit === "central" ? "teixeira" : currentUnit
  );

  // Sub-aba de Marca para Teixeira e Eunápolis: "consolidated" | "house" | "bruttus"
  const [selectedBrandView, setSelectedBrandView] = useState<"consolidated" | "house" | "bruttus">("consolidated");

  const [takeatRevenues, setTakeatRevenues] = useState<TakeatRevenueRecord[]>([]);
  const [isCredsModalOpen, setIsCredsModalOpen] = useState(false);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);

  // Sync state & user feedback
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // Unit / Operation credentials state
  const [selectedSyncOp, setSelectedSyncOp] = useState<string>("teixeira");
  const [selectedSyncUnit, setSelectedSyncUnit] = useState<Exclude<UnitId, "all">>("teixeira");
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

  // Sincroniza a aba ativa quando a unidade do contexto global mudar
  useEffect(() => {
    if (currentUnit !== "all" && currentUnit !== "central") {
      setActiveStoreTab(currentUnit);
    }
  }, [currentUnit]);

  // Carregamento de dados limpos e sincronizados
  const refreshData = () => {
    const rawList = store.getTakeatRevenues();
    const reports = new Map(rawList.map((r) => [r.id || `${r.operationKey || r.unitId}-${r.date}`, r]));
    for (const r of managementData.takeatReports || []) {
      const key = (r as any).id || ((r as any).operationKey ? `${(r as any).operationKey}-${r.date}` : `${r.unitId}-${r.date}`);
      if (!reports.has(key) || String(r.syncedAt) > reports.get(key)!.syncedAt) {
        reports.set(key, r as unknown as TakeatRevenueRecord);
      }
    }
    const allTakeat = Array.from(reports.values());
    setTakeatRevenues(allTakeat);

    const connMap: Record<string, boolean> = {};
    for (const op of TAKEAT_OPERATIONS) {
      const c = store.getTakeatCredentials(op.key);
      const hasToken = Boolean(c && c.token && c.token.startsWith("eyJ"));
      const hasPass = Boolean(c && c.email && c.password);
      connMap[op.key] = hasToken || hasPass;
    }
    const units: Exclude<UnitId, "all">[] = ["eunapolis", "teixeira", "foodpark", "central"];
    for (const u of units) {
      const c = store.getTakeatCredentials(u);
      if (c && (c.token || (c.email && c.password))) {
        connMap[u] = true;
      }
    }
    setUnitConnections(connMap);
  };

  useEffect(() => {
    refreshData();
    const handleUpdate = () => refreshData();
    window.addEventListener("house190_data_updated", handleUpdate);
    return () => window.removeEventListener("house190_data_updated", handleUpdate);
  }, [managementData.takeatReports]);

  // Sincronização oficial com a Takeat (suporta cada loja e suas marcas)
  const handleSyncTakeat = async (storeKeyOverride?: string) => {
    setSyncing(true);
    setSyncMessage(null);

    try {
      const targetPeriod = viewMode === "daily" ? selectedDate : selectedMonth;
      const targetStore = storeKeyOverride || activeStoreTab;

      let unitsToSync: Exclude<UnitId, "all">[] = [];
      if (targetStore === "all") {
        unitsToSync = ["teixeira", "eunapolis", "foodpark"];
      } else {
        unitsToSync = [targetStore as Exclude<UnitId, "all">];
      }

      let successCount = 0;
      const errors: string[] = [];

      for (const u of unitsToSync) {
        const res = await store.syncTakeatUnit(u, targetPeriod, "diretoria", "all");
        if (res.success) {
          successCount++;
        } else if (res.error) {
          errors.push(`${UNIT_LABELS[u] || u}: ${res.error}`);
        }
      }

      refreshData();

      if (errors.length > 0 && successCount === 0) {
        setSyncMessage({
          text: `Falha na sincronização: ${errors.join(" | ")}`,
          type: "error",
        });
      } else if (errors.length > 0) {
        setSyncMessage({
          text: `Sincronizado com avisos: ${errors.join(" | ")}`,
          type: "error",
        });
      } else if (successCount > 0) {
        const periodLabel = viewMode === "daily" ? formatDate(selectedDate) : `mês de ${selectedMonth}`;
        setSyncMessage({
          text: `Vendas sincronizadas com sucesso para ${periodLabel}! (${successCount} loja(s) atualizada(s))`,
          type: "success",
        });
      }
    } catch (err: any) {
      setSyncMessage({
        text: `Erro ao sincronizar Takeat: ${err.message}`,
        type: "error",
      });
    } finally {
      setSyncing(false);
    }
  };

  // Auto-sync na troca de data se a loja ativa estiver com R$ 0,00 ou sem dados
  useEffect(() => {
    if (activeStoreTab === "all") return;
    const targetPeriod = viewMode === "daily" ? selectedDate : selectedMonth;
    const hasData = takeatRevenues.some(
      (r) => r.unitId === activeStoreTab && r.date.startsWith(targetPeriod) && r.totalRevenue > 0
    );
    if (!hasData && !syncing) {
      void handleSyncTakeat(activeStoreTab);
    }
  }, [selectedDate, selectedMonth, viewMode, activeStoreTab]);

  // Registros da data ou mês selecionado
  const periodRecords = useMemo(() => {
    if (viewMode === "daily") {
      return takeatRevenues.filter((r) => r.date === selectedDate);
    } else {
      const monthRecords = takeatRevenues.filter((r) => r.date.startsWith(selectedMonth));
      const byKey = new Map<string, TakeatRevenueRecord>();
      for (const r of monthRecords) {
        const key = r.operationKey || `${r.unitId}_${r.brand || "house"}`;
        const existing = byKey.get(key);
        if (existing) {
          existing.salao += r.salao;
          existing.delivery += r.delivery;
          existing.ifood += r.ifood;
          existing.totalRevenue += r.totalRevenue;
        } else {
          byKey.set(key, { ...r });
        }
      }
      return Array.from(byKey.values());
    }
  }, [takeatRevenues, selectedDate, selectedMonth, viewMode]);

  // Separação por Loja para a data/mês
  const storeData = useMemo(() => {
    const getBrandRecord = (unitId: string, brand: "consolidated" | "house" | "bruttus") => {
      if (brand === "consolidated") {
        const directCons = periodRecords.find(
          (r) => r.unitId === unitId && (r.operationKey === `${unitId}_consolidated` || r.brand === "all")
        );
        if (directCons && directCons.totalRevenue > 0) return directCons;

        const baseUnit = periodRecords.find(
          (r) => r.unitId === unitId && (r.operationKey === unitId || !r.operationKey)
        );
        if (baseUnit && baseUnit.totalRevenue > 0) return baseUnit;

        const houseR = periodRecords.find(
          (r) => r.unitId === unitId && (r.operationKey === `${unitId}_house` || r.brand === "house")
        );
        const bruttusR = periodRecords.find(
          (r) => r.unitId === unitId && (r.operationKey === `${unitId}_bruttus` || r.brand === "bruttus")
        );
        if (houseR || bruttusR) {
          return {
            id: `computed-cons-${unitId}`,
            unitId: unitId as any,
            brand: "all" as BrandId,
            date: viewMode === "daily" ? selectedDate : selectedMonth,
            salao: (houseR?.salao || 0) + (bruttusR?.salao || 0),
            delivery: (houseR?.delivery || 0) + (bruttusR?.delivery || 0),
            ifood: (houseR?.ifood || 0) + (bruttusR?.ifood || 0),
            totalRevenue: (houseR?.totalRevenue || 0) + (bruttusR?.totalRevenue || 0),
            source: "takeat" as const,
            syncedAt: new Date().toISOString(),
          } as TakeatRevenueRecord;
        }
        return baseUnit || directCons || null;
      }

      if (brand === "house") {
        const h = periodRecords.find(
          (r) => r.unitId === unitId && (r.operationKey === `${unitId}_house` || r.brand === "house")
        );
        if (h) return h;
        const base = periodRecords.find((r) => r.unitId === unitId);
        return base || null;
      }

      if (brand === "bruttus") {
        return (
          periodRecords.find(
            (r) => r.unitId === unitId && (r.operationKey === `${unitId}_bruttus` || r.brand === "bruttus")
          ) || null
        );
      }
      return null;
    };

    const emptyRecord = (unitId: string, name: string): TakeatRevenueRecord => ({
      id: `empty-${unitId}`,
      unitId: unitId as any,
      brand: "house",
      operationKey: unitId,
      operationName: name,
      date: viewMode === "daily" ? selectedDate : selectedMonth,
      startDateUtc: "",
      endDateUtc: "",
      salao: 0,
      delivery: 0,
      ifood: 0,
      totalRevenue: 0,
      rawBalcony: 0,
      rawTable: 0,
      rawDelivery: 0,
      rawIfood: 0,
      source: "takeat",
      syncedAt: "",
    });

    // Teixeira
    const txConsolidated = getBrandRecord("teixeira", "consolidated") || emptyRecord("teixeira", "Teixeira (Consolidado)");
    const txHouse = getBrandRecord("teixeira", "house") || emptyRecord("teixeira", "House 190 Teixeira");
    const txBruttus = getBrandRecord("teixeira", "bruttus") || emptyRecord("teixeira", "Bruttus Burger TX");

    // Eunápolis
    const eunConsolidated = getBrandRecord("eunapolis", "consolidated") || emptyRecord("eunapolis", "Eunápolis (Consolidado)");
    const eunHouse = getBrandRecord("eunapolis", "house") || emptyRecord("eunapolis", "House 190 Eunápolis");
    const eunBruttus = getBrandRecord("eunapolis", "bruttus") || emptyRecord("eunapolis", "Bruttus Burger EUN");

    // Foodpark
    const foodpark = periodRecords.find((r) => r.unitId === "foodpark") || emptyRecord("foodpark", "House Foodpark");

    return {
      teixeira: {
        consolidated: txConsolidated,
        house: txHouse,
        bruttus: txBruttus,
      },
      eunapolis: {
        consolidated: eunConsolidated,
        house: eunHouse,
        bruttus: eunBruttus,
      },
      foodpark,
    };
  }, [periodRecords, viewMode, selectedDate, selectedMonth]);

  // Registro ativo de exibição baseado na loja selecionada e na marca
  const activeDisplay = useMemo(() => {
    if (activeStoreTab === "teixeira") {
      const data = storeData.teixeira;
      if (selectedBrandView === "house") return data.house;
      if (selectedBrandView === "bruttus") return data.bruttus;
      return data.consolidated;
    }

    if (activeStoreTab === "eunapolis") {
      const data = storeData.eunapolis;
      if (selectedBrandView === "house") return data.house;
      if (selectedBrandView === "bruttus") return data.bruttus;
      return data.consolidated;
    }

    if (activeStoreTab === "foodpark") {
      return storeData.foodpark;
    }

    const tx = storeData.teixeira.consolidated.totalRevenue;
    const eun = storeData.eunapolis.consolidated.totalRevenue;
    const fp = storeData.foodpark.totalRevenue;

    const salao =
      storeData.teixeira.consolidated.salao +
      storeData.eunapolis.consolidated.salao +
      storeData.foodpark.salao;
    const delivery =
      storeData.teixeira.consolidated.delivery +
      storeData.eunapolis.consolidated.delivery +
      storeData.foodpark.delivery;
    const ifood =
      storeData.teixeira.consolidated.ifood +
      storeData.eunapolis.consolidated.ifood +
      storeData.foodpark.ifood;

    return {
      id: "all-consolidated",
      unitId: "all" as any,
      brand: "all" as BrandId,
      date: viewMode === "daily" ? selectedDate : selectedMonth,
      salao,
      delivery,
      ifood,
      totalRevenue: tx + eun + fp,
      source: "takeat" as const,
      syncedAt: new Date().toISOString(),
    } as TakeatRevenueRecord;
  }, [activeStoreTab, selectedBrandView, storeData, viewMode, selectedDate, selectedMonth]);

  // Cálculos de Representatividade
  const totalGeral = activeDisplay.totalRevenue;
  const totalSalao = activeDisplay.salao;
  const totalDelivery = activeDisplay.delivery;
  const totalIfood = activeDisplay.ifood;

  const pctSalao = totalGeral > 0 ? (totalSalao / totalGeral) * 100 : 0;
  const pctDelivery = totalGeral > 0 ? (totalDelivery / totalGeral) * 100 : 0;
  const pctIfood = totalGeral > 0 ? (totalIfood / totalGeral) * 100 : 0;

  // Metas do mês
  const goals = useMemo(() => {
    const month = viewMode === "daily" ? selectedDate.slice(0, 7) : selectedMonth;
    const targetUnit = activeStoreTab === "all" ? "" : activeStoreTab;
    return calculate(managementData, {
      ...managementFilters,
      start: `${month}-01`,
      end: monthEnd(`${month}-01`),
      unitId: targetUnit,
      channel: "",
    }).metrics;
  }, [managementData, managementFilters, activeStoreTab, selectedDate, selectedMonth, viewMode]);

  // Status de conexão
  const isAnyUnitConnected = Object.values(unitConnections).some(Boolean);
  const isCurrentConnected =
    activeStoreTab === "all" ? isAnyUnitConnected : Boolean(unitConnections[activeStoreTab]);

  // Abrir Modal de Credenciais
  const handleOpenCredsModal = (opKey?: string) => {
    const targetOp = opKey || (activeStoreTab === "all" ? "teixeira" : activeStoreTab);
    setSelectedSyncOp(targetOp);
    setSelectedSyncUnit(targetOp as Exclude<UnitId, "all">);
    const existing = store.getTakeatCredentials(targetOp);
    const cleanEmail =
      existing.email && !existing.email.includes("@house190.com.br") ? existing.email : "";
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

      store.saveTakeatCredentials({
        unitId: selectedSyncUnit,
        email: credsEmail,
        password: credsPassword || undefined,
        token: liveToken,
        restaurantId,
        restaurantName,
        tokenExpiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      });

      setIsCredsModalOpen(false);
      refreshData();
      void handleSyncTakeat(selectedSyncUnit);
    } catch (err: any) {
      setCredsError(err.message || "Erro desconhecido ao conectar com a Takeat.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Desconectar Conta
  const handleDisconnect = () => {
    store.removeTakeatCredentials(selectedSyncOp);
    store.removeTakeatCredentials(selectedSyncUnit);
    setIsCredsModalOpen(false);
    refreshData();
  };

  // Dados do gráfico de evolução (últimos 7 dias da loja ativa)
  const chartData = useMemo(() => {
    if (activeStoreTab === "all") {
      return [
        { label: "Teixeira", total: storeData.teixeira.consolidated.totalRevenue },
        { label: "Eunápolis", total: storeData.eunapolis.consolidated.totalRevenue },
        { label: "Foodpark", total: storeData.foodpark.totalRevenue },
      ];
    }

    const byDate: Record<string, { date: string; label: string; total: number }> = {};
    const relevantRecords = takeatRevenues.filter((r) => r.unitId === activeStoreTab);

    for (const r of relevantRecords) {
      if (r.date.length !== 10) continue;
      if (!byDate[r.date]) {
        const parts = r.date.split("-");
        byDate[r.date] = {
          date: r.date,
          label: `${parts[2] || r.date}/${parts[1] || ""}`,
          total: 0,
        };
      }
      if (r.brand === "all" || r.operationKey?.includes("consolidated")) {
        byDate[r.date].total = r.totalRevenue;
      } else if (!byDate[r.date].total) {
        byDate[r.date].total += r.totalRevenue;
      }
    }

    return Object.values(byDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7);
  }, [activeStoreTab, storeData, takeatRevenues]);

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      {/* Header Executivo & Clean */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-zinc-200/70 pb-4 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Vendas & Faturamento
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
              {isCurrentConnected ? "Takeat Integrada" : "Takeat Pendente"}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Vendas oficiais apuradas por loja individual e marcas no PDV Takeat
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

          {/* Seletores de Data Minimalistas */}
          {viewMode === "daily" ? (
            <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg p-1 dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs">
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
                className="h-7 px-2 text-xs bg-transparent border-0 text-zinc-800 font-mono focus:outline-none dark:text-zinc-200 cursor-pointer"
              />
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg p-1 dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs">
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
                className="h-7 px-2 text-xs bg-transparent border-0 text-zinc-800 font-mono focus:outline-none dark:text-zinc-200 cursor-pointer"
              />
            </div>
          )}

          {/* Botão de Sincronizar Vendas */}
          <Button
            size="sm"
            onClick={() => handleSyncTakeat()}
            disabled={syncing}
            isLoading={syncing}
            className="bg-zinc-900 text-white hover:bg-zinc-800 gap-1.5 shadow-2xs dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            <span>{viewMode === "monthly" ? "Sincronizar Mês" : "Sincronizar Dia"}</span>
          </Button>

          {/* Botão de Configurações */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenCredsModal()}
            title="Configurar conexões Takeat"
            className="gap-1.5 text-zinc-600 hover:text-zinc-900 border-zinc-200 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* 1. SELETOR DE LOJAS INDIVIDUAIS (CADA LOJA SEPARADA) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-zinc-200/60 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => {
            setActiveStoreTab("teixeira");
            setSelectedBrandView("consolidated");
            setCurrentUnit("teixeira");
          }}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 shrink-0 ${
            activeStoreTab === "teixeira"
              ? "bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200/80 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800"
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>House 190 Teixeira (TX)</span>
          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-white/20 dark:bg-zinc-800">
            {formatCurrency(storeData.teixeira.consolidated.totalRevenue)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveStoreTab("eunapolis");
            setSelectedBrandView("consolidated");
            setCurrentUnit("eunapolis");
          }}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 shrink-0 ${
            activeStoreTab === "eunapolis"
              ? "bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200/80 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800"
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>House 190 Eunápolis</span>
          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-white/20 dark:bg-zinc-800">
            {formatCurrency(storeData.eunapolis.consolidated.totalRevenue)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveStoreTab("foodpark");
            setCurrentUnit("foodpark");
          }}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 shrink-0 ${
            activeStoreTab === "foodpark"
              ? "bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200/80 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800"
          }`}
        >
          <Store className="h-4 w-4" />
          <span>House Foodpark</span>
          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-white/20 dark:bg-zinc-800">
            {formatCurrency(storeData.foodpark.totalRevenue)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveStoreTab("all");
            setCurrentUnit("all");
          }}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 shrink-0 ml-auto ${
            activeStoreTab === "all"
              ? "bg-violet-600 text-white shadow-sm"
              : "bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200/80 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800"
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Todas as Lojas (Consolidado)</span>
        </button>
      </div>

      {/* 2. SUB-ABAS DE MARCA (APENAS PARA TEIXEIRA OU EUNÁPOLIS) */}
      {(activeStoreTab === "teixeira" || activeStoreTab === "eunapolis") && (
        <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mr-1">
              Visualizar em {activeStoreTab === "teixeira" ? "Teixeira" : "Eunápolis"}:
            </span>
            <button
              type="button"
              onClick={() => setSelectedBrandView("consolidated")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                selectedBrandView === "consolidated"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs"
                  : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 border border-zinc-200 dark:border-zinc-700"
              }`}
            >
              <span>📋 Consolidado (House + Bruttus)</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedBrandView("house")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                selectedBrandView === "house"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs"
                  : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 border border-zinc-200 dark:border-zinc-700"
              }`}
            >
              <span>🏠 House 190</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedBrandView("bruttus")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                selectedBrandView === "bruttus"
                  ? "bg-amber-600 text-white shadow-2xs"
                  : "bg-white dark:bg-zinc-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 border border-amber-200 dark:border-amber-800/60"
              }`}
            >
              <span>🍔 Bruttus Burger</span>
            </button>
          </div>

          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
            <span>Operação atual:</span>
            <strong className="text-zinc-900 dark:text-zinc-100">
              {selectedBrandView === "consolidated"
                ? `Total Oficial ${activeStoreTab === "teixeira" ? "Teixeira" : "Eunápolis"}`
                : selectedBrandView === "house"
                ? `Vendas House 190 ${activeStoreTab === "teixeira" ? "TX" : "Eunápolis"}`
                : `Vendas Bruttus Burger ${activeStoreTab === "teixeira" ? "TX" : "Eunápolis"}`}
            </strong>
          </div>
        </div>
      )}

      {/* Alerta de Feedback */}
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

      {/* 3. CARDS DE DESTAQUE LADO A LADO DAS MARCAS (TEIXEIRA E EUNÁPOLIS) */}
      {(activeStoreTab === "teixeira" || activeStoreTab === "eunapolis") && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card House 190 */}
          {(() => {
            const hData =
              activeStoreTab === "teixeira"
                ? storeData.teixeira.house
                : storeData.eunapolis.house;
            const cData =
              activeStoreTab === "teixeira"
                ? storeData.teixeira.consolidated
                : storeData.eunapolis.consolidated;
            const pct = cData.totalRevenue > 0 ? (hData.totalRevenue / cData.totalRevenue) * 100 : 100;
            return (
              <div
                onClick={() => setSelectedBrandView("house")}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  selectedBrandView === "house"
                    ? "bg-white dark:bg-zinc-900 border-zinc-900 ring-2 ring-zinc-900/10 dark:border-zinc-100"
                    : "bg-white dark:bg-zinc-900 border-zinc-200/80 hover:border-zinc-300 dark:border-zinc-800"
                } shadow-2xs`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    🏠 House 190 {activeStoreTab === "teixeira" ? "TX" : "Eunápolis"}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    Marca Principal
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 font-mono dark:text-zinc-50">
                  {formatCurrency(hData.totalRevenue)}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px]">
                  <div>
                    <span className="text-zinc-400 block">Salão</span>
                    <strong className="font-mono text-zinc-800 dark:text-zinc-200">
                      {formatCurrency(hData.salao)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">Delivery</span>
                    <strong className="font-mono text-zinc-800 dark:text-zinc-200">
                      {formatCurrency(hData.delivery)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">iFood</span>
                    <strong className="font-mono text-zinc-800 dark:text-zinc-200">
                      {formatCurrency(hData.ifood)}
                    </strong>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-zinc-500 flex justify-between">
                  <span>Participação na filial:</span>
                  <span className="font-bold text-zinc-700 dark:text-zinc-300">{formatPercent(pct)}</span>
                </div>
              </div>
            );
          })()}

          {/* Card Bruttus Burger */}
          {(() => {
            const bData =
              activeStoreTab === "teixeira"
                ? storeData.teixeira.bruttus
                : storeData.eunapolis.bruttus;
            const cData =
              activeStoreTab === "teixeira"
                ? storeData.teixeira.consolidated
                : storeData.eunapolis.consolidated;
            const pct = cData.totalRevenue > 0 ? (bData.totalRevenue / cData.totalRevenue) * 100 : 0;
            return (
              <div
                onClick={() => setSelectedBrandView("bruttus")}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  selectedBrandView === "bruttus"
                    ? "bg-amber-50/50 dark:bg-amber-950/20 border-amber-500 ring-2 ring-amber-500/20"
                    : "bg-white dark:bg-zinc-900 border-zinc-200/80 hover:border-amber-300 dark:border-zinc-800"
                } shadow-2xs`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                    🍔 Bruttus Burger {activeStoreTab === "teixeira" ? "TX" : "Eunápolis"}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    Dark Kitchen (2ª Marca)
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold tracking-tight text-amber-600 font-mono dark:text-amber-400">
                  {formatCurrency(bData.totalRevenue)}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px]">
                  <div>
                    <span className="text-zinc-400 block">Salão</span>
                    <strong className="font-mono text-zinc-800 dark:text-zinc-200">
                      {formatCurrency(bData.salao)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">Delivery</span>
                    <strong className="font-mono text-zinc-800 dark:text-zinc-200">
                      {formatCurrency(bData.delivery)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">iFood</span>
                    <strong className="font-mono text-zinc-800 dark:text-zinc-200">
                      {formatCurrency(bData.ifood)}
                    </strong>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-zinc-500 flex justify-between">
                  <span>Participação na filial:</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400">{formatPercent(pct)}</span>
                </div>
              </div>
            );
          })()}

          {/* Card Consolidado (House + Bruttus) */}
          {(() => {
            const cData =
              activeStoreTab === "teixeira"
                ? storeData.teixeira.consolidated
                : storeData.eunapolis.consolidated;
            return (
              <div
                onClick={() => setSelectedBrandView("consolidated")}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  selectedBrandView === "consolidated"
                    ? "bg-violet-50/50 dark:bg-violet-950/20 border-violet-600 ring-2 ring-violet-500/20"
                    : "bg-white dark:bg-zinc-900 border-zinc-200/80 hover:border-violet-300 dark:border-zinc-800"
                } shadow-2xs`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wider">
                    📋 Consolidado {activeStoreTab === "teixeira" ? "Teixeira" : "Eunápolis"}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300">
                    Soma das 2 Marcas
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold tracking-tight text-violet-700 font-mono dark:text-violet-300">
                  {formatCurrency(cData.totalRevenue)}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px]">
                  <div>
                    <span className="text-zinc-400 block">Salão</span>
                    <strong className="font-mono text-zinc-800 dark:text-zinc-200">
                      {formatCurrency(cData.salao)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">Delivery</span>
                    <strong className="font-mono text-zinc-800 dark:text-zinc-200">
                      {formatCurrency(cData.delivery)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">iFood</span>
                    <strong className="font-mono text-zinc-800 dark:text-zinc-200">
                      {formatCurrency(cData.ifood)}
                    </strong>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-zinc-500 flex justify-between">
                  <span>Total oficial Takeat:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">100% Integrado</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* 4. VISÃO DE TODAS AS LOJAS (QUANDO ABA "ALL" ESTIVER ATIVA) */}
      {activeStoreTab === "all" && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
              Teixeira de Freitas
            </span>
            <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50 mt-1">
              {formatCurrency(storeData.teixeira.consolidated.totalRevenue)}
            </div>
            <span className="text-[11px] text-zinc-500 mt-1 block">House + Bruttus TX</span>
          </div>

          <div className="p-4 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
              Eunápolis
            </span>
            <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50 mt-1">
              {formatCurrency(storeData.eunapolis.consolidated.totalRevenue)}
            </div>
            <span className="text-[11px] text-zinc-500 mt-1 block">House + Bruttus EUN</span>
          </div>

          <div className="p-4 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
              House Foodpark
            </span>
            <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50 mt-1">
              {formatCurrency(storeData.foodpark.totalRevenue)}
            </div>
            <span className="text-[11px] text-zinc-500 mt-1 block">Operação Foodpark</span>
          </div>

          <div className="p-4 rounded-xl border border-violet-300 bg-violet-50/50 dark:bg-violet-950/20 dark:border-violet-900 shadow-2xs">
            <span className="text-xs font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wider block">
              Total Geral do Grupo
            </span>
            <div className="text-2xl font-bold font-mono text-violet-800 dark:text-violet-200 mt-1">
              {formatCurrency(
                storeData.teixeira.consolidated.totalRevenue +
                  storeData.eunapolis.consolidated.totalRevenue +
                  storeData.foodpark.totalRevenue
              )}
            </div>
            <span className="text-[11px] text-violet-600 dark:text-violet-400 mt-1 block">Soma de todas as lojas</span>
          </div>
        </div>
      )}

      {/* 5. CARDS DE CANAIS (SALÃO, DELIVERY, IFOOD) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Faturamento do Período */}
        <div className="p-4 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              {viewMode === "daily" ? "Faturamento do Dia" : "Faturamento do Mês"}
            </span>
            <div className="h-7 w-7 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 font-mono dark:text-zinc-50">
            {formatCurrency(totalGeral)}
          </div>
          <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
            <span>Data:</span>
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
          <div className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 font-mono dark:text-zinc-50">
            {formatCurrency(totalSalao)}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>Participação</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">{formatPercent(pctSalao)}</span>
          </div>
        </div>

        {/* Delivery Próprio */}
        <div className="p-4 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Delivery Próprio
            </span>
            <div className="h-7 w-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <Truck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 font-mono dark:text-zinc-50">
            {formatCurrency(totalDelivery)}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>Participação</span>
            <span className="font-semibold text-amber-600 dark:text-amber-400">{formatPercent(pctDelivery)}</span>
          </div>
        </div>

        {/* iFood Oficial */}
        <div className="p-4 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              iFood Oficial
            </span>
            <div className="h-7 w-7 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 font-mono dark:text-zinc-50">
            {formatCurrency(totalIfood)}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>Participação</span>
            <span className="font-semibold text-rose-600 dark:text-rose-400">{formatPercent(pctIfood)}</span>
          </div>
        </div>
      </div>

      {/* 6. METAS DO MÊS */}
      <section className="rounded-xl border border-violet-200/70 bg-gradient-to-r from-violet-50 to-white p-4 shadow-2xs dark:border-violet-900/50 dark:from-violet-950/20 dark:to-zinc-900">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
              Meta do Mês — {activeStoreTab === "all" ? "Todas as Lojas" : UNIT_LABELS[activeStoreTab]}
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Acompanhamento de vendas em relação à meta cadastrada
            </p>
          </div>
          {goals.goalPct.value !== null && (
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                goals.goalPct.value >= 100
                  ? "bg-emerald-100 text-emerald-700"
                  : goals.goalPct.value >= 80
                  ? "bg-amber-100 text-amber-700"
                  : "bg-rose-100 text-rose-700"
              }`}
            >
              {goals.goalPct.value >= 100 ? "Meta atingida" : goals.goalPct.value >= 80 ? "Meta próxima" : "Meta em atenção"}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            ["Meta", formatManagedCurrency(goals.goal.value)],
            ["Realizado", formatManagedCurrency(goals.gross.value)],
            ["Atingimento", formatManagedPercent(goals.goalPct.value)],
            ["Falta vender", formatManagedCurrency(goals.remaining.value)],
            ["Projeção", formatManagedCurrency(goals.projection.value)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/80 bg-white/85 p-3 dark:border-zinc-800 dark:bg-zinc-900/85">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">{label}</span>
              <strong className={`mt-1 block text-base tabular-nums ${value === "DADO PENDENTE" ? "text-xs text-amber-700" : "text-zinc-900 dark:text-zinc-50"}`}>
                {value}
              </strong>
            </div>
          ))}
        </div>
      </section>

      {/* 7. GRÁFICO & MIX DE CANAIS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico */}
        <div className="lg:col-span-2 p-5 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs space-y-4">
          <div>
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              {activeStoreTab === "all"
                ? "Comparativo entre Filiais"
                : `Evolução de Vendas — ${UNIT_LABELS[activeStoreTab] || activeStoreTab}`}
            </h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Dados oficiais integrados diretamente da API Takeat
            </p>
          </div>

          {chartData.length > 0 && chartData.some((d) => d.total > 0) ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888820" />
                  <XAxis dataKey="label" stroke="#88888880" fontSize={11} tickLine={false} axisLine={false} />
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
                Nenhum faturamento registrado para este período
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSyncTakeat()}
                disabled={syncing}
                className="mt-3 text-xs"
              >
                Sincronizar Takeat
              </Button>
            </div>
          )}
        </div>

        {/* Mix de Canais */}
        <div className="p-5 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs space-y-4">
          <div>
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Mix de Canais de Venda
            </h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Participação por canal de atendimento
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
                <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${pctSalao}%` }} />
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
                <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${pctDelivery}%` }} />
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
                <div className="h-full bg-rose-500 rounded-full transition-all duration-500" style={{ width: `${pctIfood}%` }} />
              </div>
            </div>
          </div>

          <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-100 dark:bg-zinc-800/40 dark:border-zinc-800 text-[11px] text-zinc-500 mt-4">
            Valores oficiais extraídos da Takeat com centavos auditados em tempo real.
          </div>
        </div>
      </div>

      {/* 8. TABELA DETALHADA POR LOJA E MARCA */}
      <div className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs">
        <div className="p-4 border-b border-zinc-200/70 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Detalhamento Oficial de Vendas
            </h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {activeStoreTab === "teixeira"
                ? "Teixeira de Freitas: House 190 TX, Bruttus Burger TX e Consolidado"
                : activeStoreTab === "eunapolis"
                ? "Eunápolis: House 190 Eunápolis, Bruttus Burger EUN e Consolidado"
                : activeStoreTab === "foodpark"
                ? "House Foodpark"
                : "Todas as Filiais do Grupo"}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50/70 border-b border-zinc-200/60 dark:bg-zinc-800/40 dark:border-zinc-800 text-zinc-500">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Loja / Operação</th>
                <th className="py-2.5 px-4 font-semibold">Tipo / Marca</th>
                <th className="py-2.5 px-4 font-semibold text-right">Salão & Balcão</th>
                <th className="py-2.5 px-4 font-semibold text-right">Delivery Próprio</th>
                <th className="py-2.5 px-4 font-semibold text-right">iFood</th>
                <th className="py-2.5 px-4 font-semibold text-right">Total Oficial</th>
                <th className="py-2.5 px-4 font-semibold text-center">Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {activeStoreTab === "teixeira" ? (
                <>
                  <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">House 190 Teixeira</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                        🏠 Marca Principal
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.teixeira.house.salao)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.teixeira.house.delivery)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.teixeira.house.ifood)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 dark:text-zinc-50">
                      {formatCurrency(storeData.teixeira.house.totalRevenue)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[10px] text-emerald-600 font-medium">Takeat</span>
                    </td>
                  </tr>
                  <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="py-3 px-4 font-medium text-amber-700 dark:text-amber-400">Bruttus Burger TX</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        🍔 Dark Kitchen
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.teixeira.bruttus.salao)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.teixeira.bruttus.delivery)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.teixeira.bruttus.ifood)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                      {formatCurrency(storeData.teixeira.bruttus.totalRevenue)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[10px] text-emerald-600 font-medium">Takeat</span>
                    </td>
                  </tr>
                  <tr className="bg-violet-50/40 dark:bg-violet-950/20 font-semibold border-t-2 border-violet-200 dark:border-violet-900">
                    <td className="py-3 px-4 text-violet-900 dark:text-violet-200 font-bold">
                      Teixeira de Freitas (Consolidado)
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                        Soma das 2 Marcas
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.teixeira.consolidated.salao)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.teixeira.consolidated.delivery)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.teixeira.consolidated.ifood)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-violet-800 dark:text-violet-200">
                      {formatCurrency(storeData.teixeira.consolidated.totalRevenue)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[10px] text-violet-700 dark:text-violet-300 font-bold">Total Oficial</span>
                    </td>
                  </tr>
                </>
              ) : activeStoreTab === "eunapolis" ? (
                <>
                  <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">House 190 Eunápolis</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                        🏠 Marca Principal
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.eunapolis.house.salao)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.eunapolis.house.delivery)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.eunapolis.house.ifood)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 dark:text-zinc-50">
                      {formatCurrency(storeData.eunapolis.house.totalRevenue)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[10px] text-emerald-600 font-medium">Takeat</span>
                    </td>
                  </tr>
                  <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="py-3 px-4 font-medium text-amber-700 dark:text-amber-400">Bruttus Burger EUN</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        🍔 Dark Kitchen
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.eunapolis.bruttus.salao)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.eunapolis.bruttus.delivery)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.eunapolis.bruttus.ifood)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                      {formatCurrency(storeData.eunapolis.bruttus.totalRevenue)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[10px] text-emerald-600 font-medium">Takeat</span>
                    </td>
                  </tr>
                  <tr className="bg-violet-50/40 dark:bg-violet-950/20 font-semibold border-t-2 border-violet-200 dark:border-violet-900">
                    <td className="py-3 px-4 text-violet-900 dark:text-violet-200 font-bold">
                      Eunápolis (Consolidado)
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                        Soma das 2 Marcas
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.eunapolis.consolidated.salao)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.eunapolis.consolidated.delivery)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.eunapolis.consolidated.ifood)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-violet-800 dark:text-violet-200">
                      {formatCurrency(storeData.eunapolis.consolidated.totalRevenue)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[10px] text-violet-700 dark:text-violet-300 font-bold">Total Oficial</span>
                    </td>
                  </tr>
                </>
              ) : activeStoreTab === "foodpark" ? (
                <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                  <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">House Foodpark</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                      🌴 Operação Única
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.foodpark.salao)}</td>
                  <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.foodpark.delivery)}</td>
                  <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.foodpark.ifood)}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 dark:text-zinc-50">
                    {formatCurrency(storeData.foodpark.totalRevenue)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="text-[10px] text-emerald-600 font-medium">Takeat</span>
                  </td>
                </tr>
              ) : (
                <>
                  <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">Teixeira de Freitas</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                        House + Bruttus TX
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.teixeira.consolidated.salao)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.teixeira.consolidated.delivery)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.teixeira.consolidated.ifood)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 dark:text-zinc-50">
                      {formatCurrency(storeData.teixeira.consolidated.totalRevenue)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[10px] text-emerald-600 font-medium">Takeat</span>
                    </td>
                  </tr>
                  <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">Eunápolis</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                        House + Bruttus EUN
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.eunapolis.consolidated.salao)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.eunapolis.consolidated.delivery)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.eunapolis.consolidated.ifood)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 dark:text-zinc-50">
                      {formatCurrency(storeData.eunapolis.consolidated.totalRevenue)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[10px] text-emerald-600 font-medium">Takeat</span>
                    </td>
                  </tr>
                  <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">House Foodpark</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                        Foodpark
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.foodpark.salao)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.foodpark.delivery)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatCurrency(storeData.foodpark.ifood)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 dark:text-zinc-50">
                      {formatCurrency(storeData.foodpark.totalRevenue)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[10px] text-emerald-600 font-medium">Takeat</span>
                    </td>
                  </tr>
                  <tr className="bg-violet-50/40 dark:bg-violet-950/20 font-semibold border-t-2 border-violet-200 dark:border-violet-900">
                    <td className="py-3 px-4 text-violet-900 dark:text-violet-200 font-bold">
                      Total Consolidado Geral
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300">
                        Todas as Filiais
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {formatCurrency(
                        storeData.teixeira.consolidated.salao +
                          storeData.eunapolis.consolidated.salao +
                          storeData.foodpark.salao
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {formatCurrency(
                        storeData.teixeira.consolidated.delivery +
                          storeData.eunapolis.consolidated.delivery +
                          storeData.foodpark.delivery
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {formatCurrency(
                        storeData.teixeira.consolidated.ifood +
                          storeData.eunapolis.consolidated.ifood +
                          storeData.foodpark.ifood
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-violet-800 dark:text-violet-200">
                      {formatCurrency(
                        storeData.teixeira.consolidated.totalRevenue +
                          storeData.eunapolis.consolidated.totalRevenue +
                          storeData.foodpark.totalRevenue
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[10px] text-violet-700 dark:text-violet-300 font-bold">Grupo House</span>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Conexão com Takeat */}
      <Modal
        isOpen={isCredsModalOpen}
        onClose={() => setIsCredsModalOpen(false)}
        title={`Conectar Integração Takeat — ${UNIT_LABELS[selectedSyncUnit] || selectedSyncUnit}`}
        subtitle="Conexão oficial com Takeat Multilojas e Painel Restaurante"
      >
        <form onSubmit={handleSaveCreds} className="space-y-4 text-xs">
          <div>
            <label className="block text-zinc-700 font-medium mb-1 dark:text-zinc-300">
              Operação / Loja a Configurar
            </label>
            <select
              value={selectedSyncUnit}
              onChange={(e) => setSelectedSyncUnit(e.target.value as any)}
              className="w-full h-9 px-3 rounded border border-zinc-200 bg-white dark:bg-zinc-800 dark:border-zinc-700 focus:outline-none"
            >
              <option value="teixeira">Teixeira de Freitas (House 190 + Bruttus)</option>
              <option value="eunapolis">Eunápolis (House 190 + Bruttus)</option>
              <option value="foodpark">House Foodpark</option>
            </select>
          </div>

          <div className="flex items-center gap-2 p-1 bg-zinc-100 rounded-lg dark:bg-zinc-800">
            <button
              type="button"
              onClick={() => setAuthMode("login")}
              className={`flex-1 py-1.5 rounded-md font-medium transition-all ${
                authMode === "login"
                  ? "bg-white text-zinc-900 shadow-2xs dark:bg-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Login com E-mail e Senha (Recomendado)
            </button>
            <button
              type="button"
              onClick={() => setAuthMode("token")}
              className={`flex-1 py-1.5 rounded-md font-medium transition-all ${
                authMode === "token"
                  ? "bg-white text-zinc-900 shadow-2xs dark:bg-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Inserir Token Manual
            </button>
          </div>

          {credsError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-300">
              {credsError}
            </div>
          )}

          {authMode === "login" ? (
            <>
              <div>
                <label className="block text-zinc-700 font-medium mb-1 dark:text-zinc-300">
                  E-mail de Acesso Takeat
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
            </div>
          )}

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
