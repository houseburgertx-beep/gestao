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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function FaturamentoPage() {
  const { currentUnit, filterByUnit, activeUnitData } = useUnit();
  const [revenues, setRevenues] = useState<DailyRevenue[]>([]);
  const [takeatRevenues, setTakeatRevenues] = useState<TakeatRevenueRecord[]>([]);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [isCredsModalOpen, setIsCredsModalOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [syncDate, setSyncDate] = useState("2026-09-07");
  const [selectedSyncUnit, setSelectedSyncUnit] = useState<Exclude<UnitId, "all">>(
    currentUnit === "all" ? "eunapolis" : currentUnit
  );
  const [, setTick] = useState(0);

  // Credentials Modal State
  const [credsEmail, setCredsEmail] = useState("");
  const [credsPassword, setCredsPassword] = useState("");

  useEffect(() => {
    setRevenues(filterByUnit(store.getRevenues()));
    const allTakeat = store.getTakeatRevenues();
    setTakeatRevenues(
      currentUnit === "all"
        ? allTakeat
        : allTakeat.filter((t) => t.unitId === currentUnit)
    );

    const handleUpdate = () => {
      setRevenues(filterByUnit(store.getRevenues()));
      const updatedTakeat = store.getTakeatRevenues();
      setTakeatRevenues(
        currentUnit === "all"
          ? updatedTakeat
          : updatedTakeat.filter((t) => t.unitId === currentUnit)
      );
      setTick((t) => t + 1);
    };
    window.addEventListener("house190_data_updated", handleUpdate);
    return () => window.removeEventListener("house190_data_updated", handleUpdate);
  }, [filterByUnit, currentUnit]);

  // Aggregate Metrics from Takeat records
  const totalTakeatSalao = takeatRevenues.reduce((acc, cur) => acc + cur.salao, 0);
  const totalTakeatDelivery = takeatRevenues.reduce((acc, cur) => acc + cur.delivery, 0);
  const totalTakeatIfood = takeatRevenues.reduce((acc, cur) => acc + cur.ifood, 0);
  const totalTakeatOfficial = takeatRevenues.reduce((acc, cur) => acc + cur.totalRevenue, 0);

  const handleSyncTakeat = async () => {
    setSyncing(true);
    setSyncMessage(null);

    try {
      const unitsToSync: Exclude<UnitId, "all">[] =
        currentUnit === "all"
          ? ["eunapolis", "teixeira", "foodpark"]
          : [currentUnit];

      let anyError = false;
      for (const u of unitsToSync) {
        const res = await store.syncTakeatUnit(u, syncDate, "diretoria", "all");
        if (!res.success) {
          anyError = true;
          setSyncMessage({
            text: `Erro ao sincronizar ${res.unitName}: ${res.error}`,
            type: "error",
          });
          break;
        }
      }

      if (!anyError) {
        setSyncMessage({
          text: `Sincronização concluída com sucesso para ${syncDate}! Faturamento oficial atualizado com base estrita no objeto payment_without_tax.`,
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
    setCredsEmail(existing.email || "");
    setCredsPassword("");
    setIsCredsModalOpen(true);
  };

  const handleSaveCreds = (e: React.FormEvent) => {
    e.preventDefault();
    store.saveTakeatCredentials({
      unitId: selectedSyncUnit,
      email: credsEmail,
      password: credsPassword || undefined,
      token: `tk_${selectedSyncUnit}_live_${Date.now()}`,
    });
    setIsCredsModalOpen(false);
    setSyncMessage({
      text: `Credenciais da Takeat para ${selectedSyncUnit.toUpperCase()} atualizadas com segurança.`,
      type: "success",
    });
  };

  // Chart Data
  const chartData = [
    { name: "01/09", Eunápolis: 14200, Teixeira: 12100, Foodpark: 4500 },
    { name: "02/09", Eunápolis: 15100, Teixeira: 13400, Foodpark: 5100 },
    { name: "03/09", Eunápolis: 14800, Teixeira: 12900, Foodpark: 4900 },
    { name: "04/09", Eunápolis: 18200, Teixeira: 15300, Foodpark: 6200 },
    { name: "05/09", Eunápolis: 22100, Teixeira: 18400, Foodpark: 7900 },
    { name: "06/09", Eunápolis: 19800, Teixeira: 16400, Foodpark: 7200 },
    { name: "07/09", Eunápolis: 17920, Teixeira: 14800, Foodpark: 5900 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/60 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Faturamento Diário & Integração Takeat
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Apuração oficial de vendas sincronizadas via API Takeat (PDV) e faturamento manual
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
            <span>Credenciais Takeat</span>
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

        {/* Sync message banner if any */}
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
          <div className="flex justify-between">
            <span>GET https://backend-pdv-2.takeat.app/restaurants/v2/reports/general-cards</span>
            <span className="text-zinc-400">Auth: Bearer &#123;TOKEN&#125;</span>
          </div>
          <div className="text-zinc-400">
            start_date={syncDate}T03:00:00.000Z &nbsp;|&nbsp; end_date={syncDate === "2026-09-07" ? "2026-09-08" : syncDate}T02:59:59.999Z
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
            payment_without_tax.balcony + table
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
            payment_without_tax.delivery
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
            payment_without_tax.ifood
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
            Salão + Delivery + iFood
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
            <p className="text-[11px] text-zinc-500">Canais separados por unidade e data</p>
          </div>
          <Badge variant="outline">Origem: takeat</Badge>
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
                    {rec.unitId}
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
                  {rec.syncedAt.split("T")[1]?.slice(0, 5) || "-"}
                </td>
              </tr>
            ))}

            {takeatRevenues.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-zinc-400">
                  Nenhum faturamento sincronizado da Takeat para esta unidade.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Comparison Chart */}
      <div className="rounded-lg border border-zinc-200/80 bg-white p-5 dark:bg-zinc-900 dark:border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Evolução do Faturamento Diário Oficial
            </h3>
            <p className="text-[11px] text-zinc-500">Últimos 7 dias apurados</p>
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
      </div>

      {/* Modal: Configurar Credenciais Takeat */}
      <Modal
        isOpen={isCredsModalOpen}
        onClose={() => setIsCredsModalOpen(false)}
        title={`Configurar Acesso Takeat — ${selectedSyncUnit.toUpperCase()}`}
        subtitle="As credenciais são protegidas e utilizadas apenas para sincronização autenticada"
      >
        <form onSubmit={handleSaveCreds} className="space-y-4 text-xs">
          <div>
            <label className="block text-zinc-700 font-medium mb-1 dark:text-zinc-300">
              Unidade
            </label>
            <select
              value={selectedSyncUnit}
              onChange={(e) => {
                const u = e.target.value as any;
                setSelectedSyncUnit(u);
                const ex = store.getTakeatCredentials(u);
                setCredsEmail(ex.email || "");
              }}
              className="w-full h-9 px-3 rounded border border-zinc-200 bg-white dark:bg-zinc-800 dark:border-zinc-700 focus:outline-none"
            >
              <option value="eunapolis">House 190 Eunápolis</option>
              <option value="teixeira">House 190 Teixeira de Freitas</option>
              <option value="foodpark">House Foodpark</option>
              <option value="central">Central de Produção</option>
            </select>
          </div>

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
              placeholder="••••••••••••"
              value={credsPassword}
              onChange={(e) => setCredsPassword(e.target.value)}
              className="w-full h-9 px-3 rounded border border-zinc-200 bg-white dark:bg-zinc-800 dark:border-zinc-700 focus:outline-none"
            />
            <span className="text-[10px] text-zinc-400 mt-1 block">
              Utilizada para renovação automática de token quando a API retornar HTTP 401.
            </span>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCredsModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm">
              Salvar Credenciais
            </Button>
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
