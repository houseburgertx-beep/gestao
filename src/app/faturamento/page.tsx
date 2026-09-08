"use client";

import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  Plus,
  Calendar,
  DollarSign,
  ArrowUpRight,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Layers,
  Store,
  Truck,
  ShoppingBag,
  Key,
  ShieldCheck,
  Building2,
} from "lucide-react";
import { store } from "@/services/store";
import { useUnit } from "@/contexts/UnitContext";
import { DailyRevenue, UnitId } from "@/types";
import { TakeatRevenueRecord, TakeatCredentials } from "@/types/takeat";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { QuickCreateModal } from "@/components/layout/QuickCreateModal";
import { authenticateTakeat, sanitizeToken } from "@/services/takeatService";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// Helper para obter a data atual no fuso de Brasília/Bahia (UTC-03:00)
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

const UNIT_LABELS: Record<string, string> = {
  eunapolis: "House 190 Eunápolis",
  teixeira: "House 190 Teixeira de Freitas",
  foodpark: "House Foodpark",
  central: "Central de Produção",
};

export default function FaturamentoPage() {
  const { currentUnit, filterByUnit, activeUnitData } = useUnit();
  const [revenues, setRevenues] = useState<DailyRevenue[]>([]);
  const [takeatRevenues, setTakeatRevenues] = useState<TakeatRevenueRecord[]>([]);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [isCredsModalOpen, setIsCredsModalOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [syncDate, setSyncDate] = useState(getTodayBahiaDate());
  const [selectedSyncUnit, setSelectedSyncUnit] = useState<Exclude<UnitId, "all">>(
    currentUnit === "all" ? "eunapolis" : currentUnit
  );
  const [, setTick] = useState(0);

  // Connection credentials state per unit
  const [unitConnections, setUnitConnections] = useState<Record<string, boolean>>({});

  // Credentials Modal Form State
  const [credsEmail, setCredsEmail] = useState("");
  const [credsPassword, setCredsPassword] = useState("");
  const [credsManualToken, setCredsManualToken] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "token">("login");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [credsError, setCredsError] = useState<string | null>(null);

  // Carregamento e purga rigorosa de qualquer dado que não seja um JWT real
  useEffect(() => {
    try {
      const credsRaw = localStorage.getItem("house190_takeat_creds");
      if (credsRaw) {
        const parsed = JSON.parse(credsRaw);
        let changed = false;
        for (const k of Object.keys(parsed)) {
          const item = parsed[k];
          // Se o token for mock (começa com tk_ ou não começa com eyJ) e não tem senha real
          if (
            (item?.token && !item.token.startsWith("eyJ")) ||
            (item?.email && item.email.includes("@house190.com.br"))
          ) {
            delete parsed[k];
            changed = true;
          }
        }
        if (changed) {
          localStorage.setItem("house190_takeat_creds", JSON.stringify(parsed));
        }
      }

      const revsRaw = localStorage.getItem("house190_takeat_revenues");
      if (revsRaw && (revsRaw.includes("tk_") || revsRaw.includes("takeat-eunapolis-2026-09-07"))) {
        localStorage.removeItem("house190_takeat_revenues");
      }
    } catch {}

    const refreshData = () => {
      setRevenues(filterByUnit(store.getRevenues()));
      const allTakeat = store.getTakeatRevenues();
      setTakeatRevenues(
        currentUnit === "all"
          ? allTakeat
          : allTakeat.filter((t) => t.unitId === currentUnit)
      );

      // Status de conexão das unidades: APENAS considera conectado se tiver JWT real da Takeat ou email+senha reais
      const units: Exclude<UnitId, "all">[] = ["eunapolis", "teixeira", "foodpark", "central"];
      const connMap: Record<string, boolean> = {};
      for (const u of units) {
        const c = store.getTakeatCredentials(u);
        const hasValidJwt = Boolean(c && c.token && c.token.startsWith("eyJ"));
        const hasValidUserPass = Boolean(c && c.email && c.password && !c.email.includes("@house190.com.br"));
        connMap[u] = hasValidJwt || hasValidUserPass;
      }
      setUnitConnections(connMap);
    };

    refreshData();

    const handleUpdate = () => {
      refreshData();
      setTick((t) => t + 1);
    };

    window.addEventListener("house190_data_updated", handleUpdate);
    return () => window.removeEventListener("house190_data_updated", handleUpdate);
  }, [filterByUnit, currentUnit]);

  // Aggregate Metrics from Takeat records (filtrados pela data selecionada ou total)
  const currentFilteredRecords = takeatRevenues.filter(
    (t) => !syncDate || t.date === syncDate
  );

  const totalTakeatSalao = currentFilteredRecords.reduce((acc, cur) => acc + cur.salao, 0);
  const totalTakeatDelivery = currentFilteredRecords.reduce((acc, cur) => acc + cur.delivery, 0);
  const totalTakeatIfood = currentFilteredRecords.reduce((acc, cur) => acc + cur.ifood, 0);
  const totalTakeatOfficial = currentFilteredRecords.reduce((acc, cur) => acc + cur.totalRevenue, 0);

  const isAnyUnitConnected = Object.values(unitConnections).some(Boolean);
  const isCurrentUnitConnected = currentUnit === "all" ? isAnyUnitConnected : Boolean(unitConnections[currentUnit]);

  const handleSyncTakeat = async () => {
    setSyncing(true);
    setSyncMessage(null);

    try {
      const unitsToSync: Exclude<UnitId, "all">[] =
        currentUnit === "all"
          ? ["eunapolis", "teixeira", "foodpark"]
          : [currentUnit];

      // Verifica se há alguma unidade conectada
      const unconfiguredUnits = unitsToSync.filter((u) => !unitConnections[u]);
      if (unconfiguredUnits.length === unitsToSync.length) {
        setSyncMessage({
          text: "Nenhuma conta da Takeat está conectada ainda. Clique em 'Conectar Takeat' e informe seu e-mail e senha do PDV para importar as vendas reais.",
          type: "error",
        });
        setSyncing(false);
        return;
      }

      let successCount = 0;
      let errors: string[] = [];

      for (const u of unitsToSync) {
        if (!unitConnections[u]) continue; // Pula unidades não configuradas no modo 'all'

        const res = await store.syncTakeatUnit(u, syncDate, "diretoria", "all");
        if (!res.success) {
          errors.push(`${res.unitName}: ${res.error}`);
        } else {
          successCount++;
        }
      }

      if (errors.length > 0) {
        setSyncMessage({
          text: `Aviso: ${errors.join(" | ")}`,
          type: "error",
        });
      } else if (successCount > 0) {
        setSyncMessage({
          text: `Faturamento oficial sincronizado com sucesso diretamente da Takeat API (payment_without_tax) para ${syncDate}!`,
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

  const handleOpenCredsModal = (unitId: Exclude<UnitId, "all">) => {
    setSelectedSyncUnit(unitId);
    const existing = store.getTakeatCredentials(unitId);
    const cleanEmail = existing.email && !existing.email.includes("@house190.com.br") ? existing.email : "";
    setCredsEmail(cleanEmail);
    setCredsPassword(existing.password || "");
    setCredsManualToken(existing.token && existing.token.startsWith("eyJ") ? existing.token : "");
    setCredsError(null);
    setIsCredsModalOpen(true);
  };

  const handleDisconnect = () => {
    store.removeTakeatCredentials(selectedSyncUnit);
    store.clearTakeatRevenues(selectedSyncUnit);
    setCredsEmail("");
    setCredsPassword("");
    setCredsManualToken("");
    setIsCredsModalOpen(false);
    setSyncMessage({
      text: `Conta da Takeat desconectada para ${UNIT_LABELS[selectedSyncUnit]}.`,
      type: "success",
    });
  };

  const handleSaveCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setCredsError(null);

    try {
      let liveToken = "";
      let restaurantId: number | string | undefined = undefined;
      let restaurantName: string | undefined = undefined;

      if (authMode === "login") {
        if (!credsEmail || !credsPassword) {
          throw new Error("Por favor, preencha o e-mail e a senha de acesso ao Takeat.");
        }

        // Autenticação real direta na API da Takeat
        const authRes = await authenticateTakeat(credsEmail, credsPassword);
        liveToken = authRes.token;
        restaurantId = authRes.restaurantId;
        restaurantName = authRes.restaurantName;
      } else {
        const clean = sanitizeToken(credsManualToken);
        if (!clean) {
          throw new Error("Informe o token Bearer da Takeat.");
        }
        liveToken = clean;
      }

      // Salva as credenciais com o token autêntico e sanitizado
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
      setSyncMessage({
        text: `Conta Takeat conectada com sucesso para ${UNIT_LABELS[selectedSyncUnit]}! Realizando a primeira sincronização...`,
        type: "success",
      });

      // Dispara sincronização imediata dos dados reais para a data selecionada
      setSyncing(true);
      const syncResult = await store.syncTakeatUnit(selectedSyncUnit, syncDate, "diretoria", "all");
      if (syncResult.success) {
        setSyncMessage({
          text: `Conta conectada e faturamento real importado com sucesso para ${UNIT_LABELS[selectedSyncUnit]} (${syncDate})!`,
          type: "success",
        });
      } else {
        setSyncMessage({
          text: `Conta conectada! Porém a consulta do dia retornou: ${syncResult.error}`,
          type: "error",
        });
      }
    } catch (err: any) {
      setCredsError(err.message || "Erro desconhecido ao conectar com a Takeat.");
    } finally {
      setIsAuthenticating(false);
      setSyncing(false);
    }
  };

  // Montagem do gráfico estritamente a partir de dados reais sincronizados
  const chartGroupMap: Record<string, Record<string, number>> = {};
  for (const r of takeatRevenues) {
    if (!chartGroupMap[r.date]) {
      chartGroupMap[r.date] = { Eunápolis: 0, Teixeira: 0, Foodpark: 0 };
    }
    if (r.unitId === "eunapolis") chartGroupMap[r.date].Eunápolis = r.totalRevenue;
    if (r.unitId === "teixeira") chartGroupMap[r.date].Teixeira = r.totalRevenue;
    if (r.unitId === "foodpark") chartGroupMap[r.date].Foodpark = r.totalRevenue;
  }

  const chartData = Object.keys(chartGroupMap)
    .sort()
    .slice(-7)
    .map((dateKey) => {
      const parts = dateKey.split("-");
      const label = `${parts[2]}/${parts[1]}`;
      return {
        name: label,
        date: dateKey,
        ...chartGroupMap[dateKey],
      };
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/60 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Faturamento Oficial & Integração Takeat
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Dados de vendas reais extraídos diretamente da Takeat API (PDV) via endpoint oficial
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleOpenCredsModal(selectedSyncUnit)}
            className="gap-1.5"
          >
            <Lock className="h-3.5 w-3.5 text-zinc-500" />
            <span>Conectar Takeat</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setIsQuickCreateOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Lançar Manual</span>
          </Button>
        </div>
      </div>

      {/* UNCONNECTED WARNING BANNER */}
      {!isCurrentUnitConnected && (
        <div className="p-4 rounded-xl border border-amber-200/80 bg-amber-50/60 text-amber-900 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5 dark:text-amber-400" />
            <div>
              <p className="text-xs font-semibold">
                Nenhuma conta da Takeat conectada para esta unidade
              </p>
              <p className="text-[11px] text-amber-800/90 dark:text-amber-300/80 mt-0.5">
                O sistema não exibe números simulados. Conecte com seu e-mail e senha do PDV Takeat para carregar as vendas reais e apurar o faturamento oficial.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => handleOpenCredsModal(selectedSyncUnit)}
            className="bg-amber-900 text-amber-50 hover:bg-amber-800 dark:bg-amber-100 dark:text-amber-950 text-xs shrink-0"
          >
            Conectar Conta Takeat
          </Button>
        </div>
      )}

      {/* STATUS DE CONEXÃO POR UNIDADE */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {(["eunapolis", "teixeira", "foodpark", "central"] as const).map((uid) => {
          const isConnected = unitConnections[uid];
          return (
            <div
              key={uid}
              onClick={() => handleOpenCredsModal(uid)}
              className="p-3 rounded-lg border border-zinc-200/70 bg-white hover:border-zinc-300 dark:bg-zinc-900 dark:border-zinc-800 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-500 truncate">
                  {UNIT_LABELS[uid].replace("House 190 ", "")}
                </span>
                {isConnected ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Conectado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                    Não conectado
                  </span>
                )}
              </div>
              <div className="mt-1 text-[10px] text-zinc-400 truncate">
                {isConnected ? "Clique para gerenciar" : "Clique para conectar"}
              </div>
            </div>
          );
        })}
      </div>

      {/* TAKEAT SYNC CONSOLE CARD */}
      <div className="p-5 rounded-xl border border-zinc-200/80 bg-white space-y-4 dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-zinc-900 flex items-center justify-center text-white dark:bg-zinc-100 dark:text-zinc-900">
              <RefreshCw className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold tracking-wider text-zinc-900 uppercase dark:text-zinc-100">
                  Integração Takeat API — Faturamento Oficial
                </h2>
                <Badge variant="success">Endpoint Oficial v2</Badge>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Base oficial: <code className="font-mono text-zinc-700 dark:text-zinc-300">payment_without_tax</code> (Salão + Delivery + iFood). Fuso: America/Bahia (UTC-03:00).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500 font-medium">Data:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSyncDate(getTodayBahiaDate())}
                  className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors ${
                    syncDate === getTodayBahiaDate()
                      ? "bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100"
                      : "bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
                  }`}
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => setSyncDate(getYesterdayBahiaDate())}
                  className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors ${
                    syncDate === getYesterdayBahiaDate()
                      ? "bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100"
                      : "bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
                  }`}
                >
                  Ontem
                </button>
              </div>
              <input
                type="date"
                value={syncDate}
                onChange={(e) => setSyncDate(e.target.value)}
                className="h-8 px-2 text-xs rounded border border-zinc-200 bg-zinc-50 text-zinc-800 focus:outline-none dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
              />
            </div>

            <Button
              size="sm"
              onClick={handleSyncTakeat}
              isLoading={syncing}
              className="gap-1.5 bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Sincronizar Vendas Takeat</span>
            </Button>
          </div>
        </div>

        {/* Sync message banner */}
        {syncMessage && (
          <div
            className={`p-3 rounded-md text-xs flex items-center gap-2 ${
              syncMessage.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                : "bg-rose-50 text-rose-800 border border-rose-200/60 dark:bg-rose-950/30 dark:text-rose-300"
            }`}
          >
            {syncMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{syncMessage.text}</span>
          </div>
        )}

        {/* Technical query context */}
        <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-100 text-[11px] text-zinc-500 space-y-1 font-mono dark:bg-zinc-800/40 dark:border-zinc-800">
          <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
            <span>GET https://backend-pdv-2.takeat.app/restaurants/v2/reports/general-cards</span>
            <span className="text-zinc-400">Header: Authorization: Bearer &#123;TOKEN&#125;</span>
          </div>
          <div className="text-zinc-400">
            start_date={syncDate}T03:00:00.000Z &nbsp;|&nbsp; end_date={new Date(new Date(syncDate).getTime() + 86400000).toISOString().split("T")[0]}T02:59:59.999Z
          </div>
        </div>
      </div>

      {/* Official Channel Breakdown Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Salão */}
        <div className="p-4 rounded-lg border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Salão (Balcão + Mesa)
            </span>
            <Store className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="mt-1 text-xl font-bold font-mono text-zinc-900 tabular-nums dark:text-zinc-100">
            {formatCurrency(totalTakeatSalao)}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {currentFilteredRecords.length > 0 ? "payment_without_tax.balcony + table" : "Aguardando sincronização"}
          </div>
        </div>

        {/* Delivery */}
        <div className="p-4 rounded-lg border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Delivery Próprio
            </span>
            <Truck className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="mt-1 text-xl font-bold font-mono text-zinc-900 tabular-nums dark:text-zinc-100">
            {formatCurrency(totalTakeatDelivery)}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {currentFilteredRecords.length > 0 ? "payment_without_tax.delivery" : "Aguardando sincronização"}
          </div>
        </div>

        {/* iFood */}
        <div className="p-4 rounded-lg border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Canal iFood
            </span>
            <ShoppingBag className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="mt-1 text-xl font-bold font-mono text-zinc-900 tabular-nums dark:text-zinc-100">
            {formatCurrency(totalTakeatIfood)}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {currentFilteredRecords.length > 0 ? "payment_without_tax.ifood" : "Aguardando sincronização"}
          </div>
        </div>

        {/* Total Oficial Takeat */}
        <div className="p-4 rounded-lg border border-emerald-200/60 bg-emerald-50/20 dark:bg-emerald-950/20 dark:border-emerald-900/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">
              Faturamento Total Oficial
            </span>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-1 text-xl font-bold font-mono text-emerald-700 tabular-nums dark:text-emerald-400">
            {formatCurrency(totalTakeatOfficial)}
          </div>
          <div className="mt-0.5 text-[11px] text-emerald-600/80">
            {currentFilteredRecords.length > 0 ? "Salão + Delivery + iFood" : "Nenhum valor simulado"}
          </div>
        </div>
      </div>

      {/* Takeat Synced Entries Table */}
      <div className="rounded-lg border border-zinc-200/80 bg-white overflow-hidden shadow-2xs dark:bg-zinc-900 dark:border-zinc-800">
        <div className="px-4 py-3 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between dark:bg-zinc-800/40 dark:border-zinc-800">
          <div>
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Registros Oficiais Sincronizados (Takeat)
            </h3>
            <p className="text-[11px] text-zinc-500">Canais apurados estritamente via payment_without_tax</p>
          </div>
          <Badge variant="outline">Origem: takeat API</Badge>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-400 font-semibold uppercase tracking-wider text-[10px] dark:bg-zinc-800/60 dark:border-zinc-800">
            <tr>
              <th className="py-3 px-4">Data</th>
              <th className="py-3 px-4">Unidade</th>
              <th className="py-3 px-4 text-right">Salão (Balcão + Mesa)</th>
              <th className="py-3 px-4 text-right">Delivery</th>
              <th className="py-3 px-4 text-right">iFood</th>
              <th className="py-3 px-4 text-right">Faturamento Total Oficial</th>
              <th className="py-3 px-4">Sincronizado em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {takeatRevenues.map((rec) => (
              <tr key={rec.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50">
                <td className="py-3 px-4 tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatDate(rec.date)}
                </td>
                <td className="py-3 px-4">
                  <span className="uppercase text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {UNIT_LABELS[rec.unitId] || rec.unitId}
                  </span>
                </td>
                <td className="py-3 px-4 text-right font-mono text-zinc-700 dark:text-zinc-300">
                  {formatCurrency(rec.salao)}
                  <div className="text-[10px] text-zinc-400">
                    Mesa: {formatCurrency(rec.rawTable)} | Balcão: {formatCurrency(rec.rawBalcony)}
                  </div>
                </td>
                <td className="py-3 px-4 text-right font-mono text-zinc-700 dark:text-zinc-300">
                  {formatCurrency(rec.delivery)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-zinc-700 dark:text-zinc-300">
                  {formatCurrency(rec.ifood)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(rec.totalRevenue)}
                </td>
                <td className="py-3 px-4 text-zinc-400 text-[11px] font-mono">
                  {rec.syncedAt ? rec.syncedAt.split("T")[1]?.slice(0, 5) : "-"}
                </td>
              </tr>
            ))}

            {takeatRevenues.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-zinc-400">
                  <div className="max-w-xs mx-auto space-y-2">
                    <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      Nenhum faturamento sincronizado ainda
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Conecte sua conta da Takeat informando seu e-mail e senha e clique em <b>Sincronizar Vendas Takeat</b> para carregar os valores autênticos do PDV.
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Evolution Chart (dados reais apenas) */}
      <div className="rounded-lg border border-zinc-200/80 bg-white p-5 dark:bg-zinc-900 dark:border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Evolução do Faturamento Diário Oficial
            </h3>
            <p className="text-[11px] text-zinc-500">Últimos dias sincronizados da Takeat API</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-900 dark:bg-zinc-100" />
              <span>Eunápolis</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-500" />
              <span>Teixeira</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
              <span>Foodpark</span>
            </span>
          </div>
        </div>

        {chartData.length > 0 ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis dataKey="name" stroke="#a1a1aa" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#a1a1aa"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `R$ ${v / 1000}k`}
                />
                <Tooltip
                  formatter={(v: any) => formatCurrency(Number(v))}
                  contentStyle={{
                    backgroundColor: "#18181b",
                    borderColor: "#27272a",
                    borderRadius: "6px",
                    color: "#f4f4f5",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="Eunápolis" fill="#18181b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Teixeira" fill="#71717a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Foodpark" fill="#d4d4d8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-400 text-center px-4">
            O gráfico será gerado automaticamente assim que os dados reais forem sincronizados da Takeat.
          </div>
        )}
      </div>

      {/* Modal: Conectar e Autenticar na Takeat */}
      <Modal
        isOpen={isCredsModalOpen}
        onClose={() => setIsCredsModalOpen(false)}
        title={`Conectar Conta Takeat — ${UNIT_LABELS[selectedSyncUnit]}`}
        subtitle="Autenticação direta com o servidor oficial da Takeat (POST /public/api/sessions)"
      >
        <form onSubmit={handleSaveCreds} className="space-y-4 text-xs">
          {/* Unidade */}
          <div>
            <label className="block text-zinc-700 font-medium mb-1 dark:text-zinc-300">
              Unidade a Conectar
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

          {/* Abas de Modo de Conexão */}
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

          {/* Erro de autenticação */}
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
                  E-mail de Acesso Takeat (PDV)
                </label>
                <input
                  type="email"
                  required
                  placeholder="ex: restaurante@takeat.app"
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
                  A senha é autenticada diretamente com o endpoint oficial da Takeat para gerar o token Bearer e renová-lo a cada 15 dias caso expire (HTTP 401).
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
              <span className="text-[10px] text-zinc-400 mt-1 block">
                Token enviado no cabeçalho: <code>Authorization: Bearer &#123;TOKEN&#125;</code>
              </span>
              <div className="p-2.5 bg-zinc-50 rounded border border-zinc-200 text-[11px] text-zinc-600 space-y-1 dark:bg-zinc-800/50 dark:border-zinc-700 dark:text-zinc-300">
                <p className="font-semibold text-zinc-700 dark:text-zinc-200">Como copiar da sua aba aberta da Takeat:</p>
                <p>1. Na aba da Takeat (Dashboard ou Multilojas), aperte <b>F12</b> (Inspecionar).</p>
                <p>2. Vá na aba <b>Console</b> e digite: <code className="bg-zinc-200 px-1 rounded dark:bg-zinc-700">localStorage.getItem(&apos;token&apos;)</code></p>
                <p>3. Copie o código gerado (sem as aspas) e cole acima.</p>
              </div>
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
            ) : <div />}

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
                {isAuthenticating ? "Conectando e Autenticando..." : "Conectar e Sincronizar"}
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
