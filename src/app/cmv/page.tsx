"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  RefreshCw,
  Copy,
  Check,
  TrendingDown,
  TrendingUp,
  Wine,
  Package,
  Beef,
  Factory,
  Building2,
  AlertTriangle,
  ArrowRight,
  Filter,
  CheckCircle2,
  ExternalLink,
  DollarSign,
  ChevronDown,
} from "lucide-react";
import { useUnit } from "@/contexts/UnitContext";

interface CostCenterData {
  label: string;
  total: number;
  percent: number;
  items: Array<{
    id: number;
    description: string;
    value: number;
    dueDate: string;
    category: string;
    provider: string;
    paid: boolean;
    storeName: string;
  }>;
}

interface StoreResult {
  storeId: string;
  storeName: string;
  faturamento: number;
  totalInsumos: number;
  cmvPercent: number;
  costCenters: {
    bebida: CostCenterData;
    embalagem: CostCenterData;
    mPrima: CostCenterData;
    cProducao: CostCenterData;
  };
  items: any[];
}

interface CmvApiResponse {
  success: boolean;
  period: { startDate: string; endDate: string };
  unitId: string;
  isConsolidated: boolean;
  summary: {
    faturamento: number;
    totalInsumos: number;
    cmvPercent: number;
    costCenters: {
      bebida: CostCenterData;
      embalagem: CostCenterData;
      mPrima: CostCenterData;
      cProducao: CostCenterData;
    };
  };
  stores: StoreResult[];
}

const STORE_TABS = [
  { id: "all", label: "Todas as Lojas (Consolidado)" },
  { id: "eunapolis", label: "House 190 Eunápolis" },
  { id: "teixeira", label: "House 190 Hamburgueria" },
  { id: "foodpark", label: "House Food Park" },
  { id: "central", label: "Central Alimentos" },
  { id: "tios", label: "Tios Rockets Pizzaria" },
];

export default function CmvPage() {
  const { currentUnit } = useUnit();

  // Estados de Período
  const hoje = useMemo(() => new Date(), []);
  const [startDate, setStartDate] = useState(() => {
    // Início da semana atual (ou dia 1 do mês)
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Loja selecionada
  const [selectedUnit, setSelectedUnit] = useState<string>("eunapolis");

  // Dados da API
  const [data, setData] = useState<CmvApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtro na tabela de lançamentos
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCenterFilter, setActiveCenterFilter] = useState<string>("all");

  // Botão de Copiar WhatsApp
  const [copied, setCopied] = useState(false);

  // Sincronizar com UnitContext quando o usuário troca no header global
  useEffect(() => {
    if (currentUnit && currentUnit !== "all") {
      const match = STORE_TABS.find((t) => t.id === currentUnit);
      if (match) {
        setSelectedUnit(match.id);
      }
    }
  }, [currentUnit]);

  // Função para buscar dados
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { fetchCmvData } = await import("@/services/cmvService");
      const json = await fetchCmvData(startDate, endDate, selectedUnit);
      setData(json);
    } catch (err: any) {
      console.error("Erro ao buscar CMV:", err);
      setError(err.message || "Falha ao carregar dados de CMV da Takeat.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, selectedUnit]);

  // Presets rápidos de data
  const handlePreset = (type: "estaSemana" | "semanaPassada" | "esteMes" | "mesPassado") => {
    const now = new Date();
    if (type === "estaSemana") {
      const start = new Date(now);
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Segunda-feira
      start.setDate(diff);
      setStartDate(start.toISOString().split("T")[0]);
      setEndDate(now.toISOString().split("T")[0]);
    } else if (type === "semanaPassada") {
      const end = new Date(now);
      const day = end.getDay();
      const diffToMonday = end.getDate() - day + (day === 0 ? -6 : 1);
      const mondayLastWeek = new Date(now);
      mondayLastWeek.setDate(diffToMonday - 7);
      const sundayLastWeek = new Date(now);
      sundayLastWeek.setDate(diffToMonday - 1);
      setStartDate(mondayLastWeek.toISOString().split("T")[0]);
      setEndDate(sundayLastWeek.toISOString().split("T")[0]);
    } else if (type === "esteMes") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(start.toISOString().split("T")[0]);
      setEndDate(now.toISOString().split("T")[0]);
    } else if (type === "mesPassado") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(start.toISOString().split("T")[0]);
      setEndDate(end.toISOString().split("T")[0]);
    }
  };

  const formatBRL = (val: number) => {
    return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const formatPercent = (val: number) => {
    return `${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}`;
  };

  // Copiar formato WhatsApp
  const handleCopyWhatsApp = () => {
    if (!data) return;
    const storeName =
      STORE_TABS.find((t) => t.id === selectedUnit)?.label || "Todas as Lojas";
    const dIni = formatDateDisplay(startDate);
    const dFim = formatDateDisplay(endDate);
    const s = data.summary;

    const text = `*RELATÓRIO CMV*\n(${storeName})\n*${dIni} - ${dFim}*\n\n*CMV ${formatPercent(s.cmvPercent)}:*\nBebida - ${formatBRL(s.costCenters.bebida.total)}\nEmbalagem - ${formatBRL(s.costCenters.embalagem.total)}\nM Prima - ${formatBRL(s.costCenters.mPrima.total)}\nC Produção - ${formatBRL(s.costCenters.cProducao.total)}\n*Total - ${formatBRL(s.totalInsumos)}*\n\n*Faturamento - ${formatBRL(s.faturamento)}*`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Badge de saúde do CMV
  const getCmvStatus = (pct: number) => {
    if (pct === 0) return { label: "Sem dados", color: "text-zinc-500 bg-zinc-100 dark:bg-zinc-800" };
    if (pct <= 32) return { label: "Excelente (Abaixo de 32%)", color: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60" };
    if (pct <= 38) return { label: "Meta Ideal (32% - 38%)", color: "text-indigo-700 bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800/60" };
    if (pct <= 42) return { label: "Atenção (38% - 42%)", color: "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60" };
    return { label: "Crítico (> 42%)", color: "text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60" };
  };

  // Coleta de todos os itens de despesa para auditoria
  const allFilteredItems = useMemo(() => {
    if (!data) return [];
    let items: any[] = [];
    if (data.isConsolidated) {
      data.stores.forEach((st) => {
        items.push(...st.items);
      });
    } else if (data.stores.length > 0) {
      items = data.stores[0].items;
    }

    return items.filter((it) => {
      const matchCenter =
        activeCenterFilter === "all" || it.costCenterKey === activeCenterFilter;
      const matchSearch =
        !searchTerm ||
        it.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (it.provider && it.provider.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchCenter && matchSearch;
    });
  }, [data, activeCenterFilter, searchTerm]);

  return (
    <div className="space-y-6 select-none animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#6658d3] to-[#8072eb] text-white flex items-center justify-center font-bold text-sm shadow-md">
              %
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                CMV · Custo de Mercadoria Vendida
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Cálculo oficial de insumos sobre faturamento direto da Takeat (Bebida, Embalagem, M. Prima e C. Produção)
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>

          <button
            onClick={handleCopyWhatsApp}
            disabled={!data || loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#17162f] hover:bg-[#252347] text-white transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copiar WhatsApp</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Control Bar: Seletor de Loja + Seletor de Período */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
        {/* Seletor de Loja */}
        <div className="lg:col-span-5 flex flex-col justify-center">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-zinc-400" />
            Unidade
          </label>
          <div className="relative">
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="w-full h-9 px-3 pr-8 rounded-lg text-xs font-medium bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#6658d3] appearance-none"
            >
              {STORE_TABS.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          </div>
        </div>

        {/* Presets Rápidos de Data */}
        <div className="lg:col-span-4 flex flex-col justify-center">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-zinc-400" />
            Atalhos de Período
          </label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handlePreset("estaSemana")}
              className="flex-1 py-1.5 px-2 rounded-md text-[11px] font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              Esta sem.
            </button>
            <button
              onClick={() => handlePreset("semanaPassada")}
              className="flex-1 py-1.5 px-2 rounded-md text-[11px] font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              Sem. ant.
            </button>
            <button
              onClick={() => handlePreset("esteMes")}
              className="flex-1 py-1.5 px-2 rounded-md text-[11px] font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              Mês atual
            </button>
            <button
              onClick={() => handlePreset("mesPassado")}
              className="flex-1 py-1.5 px-2 rounded-md text-[11px] font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              Mês ant.
            </button>
          </div>
        </div>

        {/* Inputs de Data Início e Fim */}
        <div className="lg:col-span-3 flex items-center gap-2">
          <div className="flex-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1 block">
              Início
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full h-9 px-2 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#6658d3]"
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1 block">
              Fim
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full h-9 px-2 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#6658d3]"
            />
          </div>
        </div>
      </div>

      {/* Alerta de Erro */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-center gap-3 text-red-700 dark:text-red-400 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-32 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
          <div className="h-32 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
          <div className="h-32 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
        </div>
      )}

      {/* Conteúdo Principal */}
      {data && (
        <>
          {/* CARDS PRINCIPAIS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: CMV Principal */}
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  CMV Realizado
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    getCmvStatus(data.summary.cmvPercent).color
                  }`}
                >
                  {getCmvStatus(data.summary.cmvPercent).label}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl lg:text-4xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
                  {formatPercent(data.summary.cmvPercent)}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-2">
                Impacto total dos 4 centros de insumos sobre a venda líquida do período.
              </p>
              <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-5 pointer-events-none">
                <TrendingDown className="w-24 h-24 text-zinc-900 dark:text-white" />
              </div>
            </div>

            {/* Card 2: Total de Insumos */}
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block mb-2">
                Total Insumos (Custo)
              </span>
              <div className="text-3xl lg:text-4xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
                {formatBRL(data.summary.totalInsumos)}
              </div>
              <p className="text-[11px] text-zinc-500 mt-2">
                Bebida + Embalagem + M. Prima + C. Produção
              </p>
            </div>

            {/* Card 3: Faturamento */}
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block mb-2">
                Faturamento Oficial (Takeat)
              </span>
              <div className="text-3xl lg:text-4xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight text-emerald-600 dark:text-emerald-400">
                {formatBRL(data.summary.faturamento)}
              </div>
              <p className="text-[11px] text-zinc-500 mt-2">
                Total de vendas registradas no período selecionado.
              </p>
            </div>
          </div>

          {/* GRID DOS 4 CENTROS DE CUSTO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Bebida */}
            <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center">
                      <Wine className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      Bebida
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-zinc-500">
                    {formatPercent(data.summary.costCenters.bebida.percent)}
                  </span>
                </div>
                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {formatBRL(data.summary.costCenters.bebida.total)}
                </div>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-amber-500 h-full rounded-full"
                  style={{
                    width: `${Math.min(data.summary.costCenters.bebida.percent, 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Embalagem */}
            <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center">
                      <Package className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      Embalagem
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-zinc-500">
                    {formatPercent(data.summary.costCenters.embalagem.percent)}
                  </span>
                </div>
                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {formatBRL(data.summary.costCenters.embalagem.total)}
                </div>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full"
                  style={{
                    width: `${Math.min(data.summary.costCenters.embalagem.percent, 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Matéria Prima */}
            <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center">
                      <Beef className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      M Prima
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-zinc-500">
                    {formatPercent(data.summary.costCenters.mPrima.percent)}
                  </span>
                </div>
                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {formatBRL(data.summary.costCenters.mPrima.total)}
                </div>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-red-500 h-full rounded-full"
                  style={{
                    width: `${Math.min(data.summary.costCenters.mPrima.percent, 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Central de Produção */}
            <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center">
                      <Factory className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      C Produção
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-zinc-500">
                    {formatPercent(data.summary.costCenters.cProducao.percent)}
                  </span>
                </div>
                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {formatBRL(data.summary.costCenters.cProducao.total)}
                </div>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-purple-500 h-full rounded-full"
                  style={{
                    width: `${Math.min(data.summary.costCenters.cProducao.percent, 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* TABELA COMPARATIVA POR LOJA (Se for Consolidado) */}
          {data.isConsolidated && data.stores.length > 1 && (
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-[#6658d3]" />
                Comparativo por Unidade da Rede
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-500">
                      <th className="py-2.5 px-3">Loja</th>
                      <th className="py-2.5 px-3">Faturamento</th>
                      <th className="py-2.5 px-3">Bebida</th>
                      <th className="py-2.5 px-3">Embalagem</th>
                      <th className="py-2.5 px-3">M. Prima</th>
                      <th className="py-2.5 px-3">C. Produção</th>
                      <th className="py-2.5 px-3">Total Insumos</th>
                      <th className="py-2.5 px-3 text-right">CMV (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {data.stores.map((st) => (
                      <tr key={st.storeId} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                        <td className="py-2.5 px-3 font-semibold text-zinc-900 dark:text-zinc-100">
                          {st.storeName}
                        </td>
                        <td className="py-2.5 px-3 text-emerald-600 dark:text-emerald-400 font-medium">
                          {formatBRL(st.faturamento)}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300">
                          {formatBRL(st.costCenters.bebida.total)}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300">
                          {formatBRL(st.costCenters.embalagem.total)}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300">
                          {formatBRL(st.costCenters.mPrima.total)}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300">
                          {formatBRL(st.costCenters.cProducao.total)}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-zinc-900 dark:text-zinc-100">
                          {formatBRL(st.totalInsumos)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-zinc-900 dark:text-zinc-100">
                          {formatPercent(st.cmvPercent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TABELA DE AUDITORIA DE LANÇAMENTOS */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                  Lançamentos e Notas do CMV
                </h3>
                <p className="text-[11px] text-zinc-500">
                  Audite individualmente cada compra ou nota lançada nos centros de custo.
                </p>
              </div>

              {/* Filtros da Tabela */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Buscar lançamento..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 px-2.5 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#6658d3]"
                />
                <select
                  value={activeCenterFilter}
                  onChange={(e) => setActiveCenterFilter(e.target.value)}
                  className="h-8 px-2.5 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#6658d3]"
                >
                  <option value="all">Todos os centros</option>
                  <option value="bebida">Bebida</option>
                  <option value="embalagem">Embalagem</option>
                  <option value="mPrima">M. Prima</option>
                  <option value="cProducao">C. Produção</option>
                </select>
              </div>
            </div>

            {allFilteredItems.length === 0 ? (
              <div className="text-center py-8 text-zinc-400 text-xs">
                Nenhum lançamento de insumo encontrado para este filtro.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-500">
                      <th className="py-2.5 px-3">Vencimento</th>
                      <th className="py-2.5 px-3">Descrição</th>
                      <th className="py-2.5 px-3">Centro de Custo</th>
                      <th className="py-2.5 px-3">Fornecedor</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {allFilteredItems.map((item, idx) => (
                      <tr key={`${item.id}-${idx}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                        <td className="py-2.5 px-3 text-zinc-500">
                          {item.dueDate ? formatDateDisplay(item.dueDate) : "-"}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-zinc-900 dark:text-zinc-100 max-w-[250px] truncate">
                          {item.description}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              item.costCenterKey === "bebida"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                : item.costCenterKey === "embalagem"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                                : item.costCenterKey === "mPrima"
                                ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                                : "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300"
                            }`}
                          >
                            {item.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-500">
                          {item.provider || "-"}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`text-[10px] font-semibold ${
                              item.paid ? "text-emerald-600" : "text-amber-600"
                            }`}
                          >
                            {item.paid ? "Pago" : "A Pagar"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-zinc-900 dark:text-zinc-100">
                          {formatBRL(item.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
