"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  RefreshCw,
  Copy,
  Check,
  TrendingDown,
  Wine,
  Package,
  Beef,
  Factory,
  Building2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Edit3,
  RotateCcw,
  CupSoda,
  Receipt,
  CheckSquare,
  Square,
  SlidersHorizontal,
  Layers,
  Search,
  Eye,
  Info,
  X,
  Settings2,
} from "lucide-react";
import { useUnit } from "@/contexts/UnitContext";
import {
  fetchCmvData,
  CmvApiResponse,
  CostCenterKey,
  CostCenterItem,
  CostCenterSubcategory,
  computeSubcategories,
} from "@/services/cmvService";

const STORE_TABS = [
  { id: "all", label: "Todas as Lojas (Consolidado)" },
  { id: "eunapolis", label: "House 190 Eunápolis" },
  { id: "teixeira", label: "House 190 Hamburgueria" },
  { id: "foodpark", label: "House Food Park" },
  { id: "central", label: "Central Alimentos" },
  { id: "tios", label: "Tios Rockets Pizzaria" },
];

interface CostCenterConfig {
  key: CostCenterKey;
  label: string;
  icon: React.ElementType;
  color: string;
  badgeBg: string;
  borderActive: string;
  defaultIncluded: boolean;
  description: string;
}

const COST_CENTERS_CONFIG: CostCenterConfig[] = [
  {
    key: "cProducao",
    label: "Central de Produção",
    icon: Factory,
    color: "text-purple-600 dark:text-purple-400",
    badgeBg: "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    borderActive: "border-purple-500 ring-1 ring-purple-500/20",
    defaultIncluded: true,
    description: "Transferências, carnes e pré-preparo da Central",
  },
  {
    key: "mPrima",
    label: "Matéria Prima",
    icon: Beef,
    color: "text-red-600 dark:text-red-400",
    badgeBg: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
    borderActive: "border-red-500 ring-1 ring-red-500/20",
    defaultIncluded: true,
    description: "Carnes, queijos, bacon, batatas e hortifruti",
  },
  {
    key: "embalagem",
    label: "Embalagem",
    icon: Package,
    color: "text-blue-600 dark:text-blue-400",
    badgeBg: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    borderActive: "border-blue-500 ring-1 ring-blue-500/20",
    defaultIncluded: true,
    description: "Caixas, sacolas, copos, potes e descartáveis",
  },
  {
    key: "bebida",
    label: "Bebida",
    icon: Wine,
    color: "text-amber-600 dark:text-amber-400",
    badgeBg: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    borderActive: "border-amber-500 ring-1 ring-amber-500/20",
    defaultIncluded: true,
    description: "Refrigerantes, cervejas, águas e destilados",
  },
  {
    key: "suco",
    label: "Suco",
    icon: CupSoda,
    color: "text-emerald-600 dark:text-emerald-400",
    badgeBg: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    borderActive: "border-emerald-500 ring-1 ring-emerald-500/20",
    defaultIncluded: false,
    description: "Polpas, concentrados e sucos (opcional)",
  },
  {
    key: "outros",
    label: "Outras Despesas",
    icon: Receipt,
    color: "text-zinc-600 dark:text-zinc-400",
    badgeBg: "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
    borderActive: "border-zinc-500 ring-1 ring-zinc-500/20",
    defaultIncluded: false,
    description: "Motoboys, aluguel, luz, taxas e manutenção",
  },
];

interface DetailTarget {
  type: "center" | "subcategory";
  key: string;
  label: string;
  badgeBg?: string;
  icon?: React.ElementType;
}

export default function CmvPage() {
  const { currentUnit } = useUnit();

  // Estados de Período
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [dateType, setDateType] = useState<"due_date" | "competence_date">("due_date");

  // Loja selecionada
  const [selectedUnit, setSelectedUnit] = useState<string>("eunapolis");

  // Centros de custo principais que fazem parte da soma (Checkboxes)
  const [activeCenters, setActiveCenters] = useState<Record<CostCenterKey, boolean>>({
    cProducao: true,
    mPrima: true,
    embalagem: true,
    bebida: true,
    suco: false,
    outros: false,
  });

  // Subcategorias específicas de Outras Despesas selecionadas individualmente
  const [selectedOutrosSubcategories, setSelectedOutrosSubcategories] = useState<Record<string, boolean>>({});
  const [showOutrosBreakdown, setShowOutrosBreakdown] = useState(false);

  // Alvo do modal do olhinho minimalista (Centro ou Subcategoria)
  const [selectedDetailTarget, setSelectedDetailTarget] = useState<DetailTarget | null>(null);

  // Ajuste manual de Faturamento
  const [manualFaturamento, setManualFaturamento] = useState<string>("");
  const [isEditingFat, setIsEditingFat] = useState(false);

  // Dados da API
  const [data, setData] = useState<CmvApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros na tabela de auditoria
  const [searchTerm, setSearchTerm] = useState("");
  const [tableFilter, setTableFilter] = useState<string>("all_entries");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "pending">("all");

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
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchCmvData(startDate, endDate, selectedUnit, dateType);
      setData(json);
    } catch (err: any) {
      console.error("Erro ao buscar CMV:", err);
      setError(err.message || "Falha ao carregar dados de CMV da Takeat.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Limpar faturamento manual ao mudar parâmetros de consulta
    setManualFaturamento("");
    setIsEditingFat(false);
    setSelectedOutrosSubcategories({});
  }, [startDate, endDate, selectedUnit, dateType]);

  // Presets rápidos de data
  const handlePreset = (type: "estaSemana" | "semanaPassada" | "esteMes" | "mesPassado") => {
    const now = new Date();
    if (type === "estaSemana") {
      const start = new Date(now);
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
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
    const parts = dateStr.split("-");
    if (parts.length >= 3) {
      return `${parts[2]}/${parts[1]}`;
    }
    return dateStr;
  };

  // Subcategorias disponíveis de Outras Despesas
  const outrosSubcategories: CostCenterSubcategory[] = useMemo(() => {
    if (!data) return [];
    if (data.isConsolidated) {
      const allOutrosItems: CostCenterItem[] = [];
      data.stores.forEach((st) => {
        if (st.costCenters.outros?.items) {
          allOutrosItems.push(...st.costCenters.outros.items);
        }
      });
      return computeSubcategories(allOutrosItems);
    }
    return data.summary.costCenters.outros?.subcategories || [];
  }, [data]);

  // Total das Outras Despesas selecionadas individualmente
  const selectedOutrosSum = useMemo(() => {
    return outrosSubcategories.reduce((acc, sub) => {
      if (selectedOutrosSubcategories[sub.rawCategory]) {
        return acc + sub.total;
      }
      return acc;
    }, 0);
  }, [outrosSubcategories, selectedOutrosSubcategories]);

  const countSelectedOutros = useMemo(() => {
    return outrosSubcategories.filter((s) => selectedOutrosSubcategories[s.rawCategory]).length;
  }, [outrosSubcategories, selectedOutrosSubcategories]);

  // Faturamento efetivo
  const effectiveFaturamento = useMemo(() => {
    if (manualFaturamento && !isNaN(parseFloat(manualFaturamento))) {
      return parseFloat(manualFaturamento);
    }
    return data?.summary.faturamento || 0;
  }, [manualFaturamento, data]);

  // Soma dos Custos SELECIONADOS pelo usuário
  const selectedCostSum = useMemo(() => {
    if (!data) return 0;
    let sum = 0;
    // Soma os 5 centros principais se ativos
    (["cProducao", "mPrima", "embalagem", "bebida", "suco"] as CostCenterKey[]).forEach((k) => {
      if (activeCenters[k]) {
        sum += data.summary.costCenters[k]?.total || 0;
      }
    });
    // Soma as subcategorias específicas de Outras Despesas selecionadas
    sum += selectedOutrosSum;
    return sum;
  }, [data, activeCenters, selectedOutrosSum]);

  // CMV recalculado sobre o faturamento efetivo e centros selecionados
  const effectiveCmvPercent = useMemo(() => {
    if (!data || effectiveFaturamento <= 0 || selectedCostSum <= 0) return 0;
    return Math.round((selectedCostSum / effectiveFaturamento) * 10000) / 100;
  }, [data, effectiveFaturamento, selectedCostSum]);

  // Nomes dos centros ativos para exibição
  const activeCenterLabels = useMemo(() => {
    const list = COST_CENTERS_CONFIG.filter(
      (cfg) => cfg.key !== "outros" && activeCenters[cfg.key]
    ).map((cfg) => cfg.label);

    if (countSelectedOutros > 0) {
      const names = outrosSubcategories
        .filter((s) => selectedOutrosSubcategories[s.rawCategory])
        .map((s) => s.label);
      list.push(...names);
    }
    return list;
  }, [activeCenters, countSelectedOutros, outrosSubcategories, selectedOutrosSubcategories]);

  // Alternar centro de custo principal na soma
  const toggleCenter = (key: CostCenterKey) => {
    if (key === "outros") {
      // Se clicar no card de Outras Despesas, abre/alterna o desdobramento
      setShowOutrosBreakdown((prev) => !prev);
      return;
    }
    setActiveCenters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Alternar subcategoria individual de Outras Despesas
  const toggleOutrosSubcategory = (rawCategory: string) => {
    setSelectedOutrosSubcategories((prev) => ({
      ...prev,
      [rawCategory]: !prev[rawCategory],
    }));
  };

  const selectAllOutros = () => {
    const next: Record<string, boolean> = {};
    outrosSubcategories.forEach((s) => {
      next[s.rawCategory] = true;
    });
    setSelectedOutrosSubcategories(next);
  };

  const deselectAllOutros = () => {
    setSelectedOutrosSubcategories({});
  };

  // Restaurar padrão (4 centros oficiais: Bebida, Embalagem, M. Prima, C. Produção)
  const resetToStandardCmv = () => {
    setActiveCenters({
      cProducao: true,
      mPrima: true,
      embalagem: true,
      bebida: true,
      suco: false,
      outros: false,
    });
    setSelectedOutrosSubcategories({});
    setShowOutrosBreakdown(false);
  };

  // Selecionar todos os centros e todas as outras despesas
  const selectAllCenters = () => {
    setActiveCenters({
      cProducao: true,
      mPrima: true,
      embalagem: true,
      bebida: true,
      suco: true,
      outros: true,
    });
    selectAllOutros();
  };

  // Configuração e itens detalhados do alvo clicado no olhinho (centro ou subcategoria)
  const detailItems = useMemo(() => {
    if (!data || !selectedDetailTarget) return [];
    let baseList: CostCenterItem[] = [];

    if (data.isConsolidated) {
      data.stores.forEach((st) => {
        if (selectedDetailTarget.type === "center") {
          const c = st.costCenters[selectedDetailTarget.key as CostCenterKey];
          if (c?.items) baseList.push(...c.items);
        } else {
          // É subcategoria: filtra por item.category
          if (st.items) {
            const matched = st.items.filter((it) => it.category === selectedDetailTarget.key);
            baseList.push(...matched);
          }
        }
      });
    } else {
      if (selectedDetailTarget.type === "center") {
        baseList = data.summary.costCenters[selectedDetailTarget.key as CostCenterKey]?.items || [];
      } else {
        const allItems = data.stores[0]?.items || [];
        baseList = allItems.filter((it) => it.category === selectedDetailTarget.key);
      }
    }

    return baseList;
  }, [data, selectedDetailTarget]);

  // Calcula o acumulado passo a passo até chegar no total
  const { detailItemsWithCumulative, detailTotalVal } = useMemo(() => {
    let run = 0;
    const list = detailItems.map((item) => {
      run += item.value;
      return {
        ...item,
        cumulative: run,
      };
    });
    return { detailItemsWithCumulative: list, detailTotalVal: run };
  }, [detailItems]);

  // Copiar formato WhatsApp com os centros e subcategorias selecionados
  const handleCopyWhatsApp = () => {
    if (!data) return;
    const storeName =
      STORE_TABS.find((t) => t.id === selectedUnit)?.label || "Todas as Lojas";
    const dIni = formatDateDisplay(startDate);
    const dFim = formatDateDisplay(endDate);
    const s = data.summary;

    const centerLines: string[] = [];
    COST_CENTERS_CONFIG.forEach((cfg) => {
      if (cfg.key === "outros") {
        // Se for outros, inclui apenas as subcategorias que foram marcadas individualmente!
        outrosSubcategories.forEach((sub) => {
          if (selectedOutrosSubcategories[sub.rawCategory]) {
            centerLines.push(`${sub.label} - ${formatBRL(sub.total)}`);
          }
        });
      } else if (activeCenters[cfg.key]) {
        const val = s.costCenters[cfg.key]?.total || 0;
        centerLines.push(`${cfg.label} - ${formatBRL(val)}`);
      }
    });

    const text = `*RELATÓRIO CMV*\n(${storeName})\n*${dIni} - ${dFim}*\n\n*CMV ${formatPercent(
      effectiveCmvPercent
    )}:*\n${centerLines.join("\n")}\n*Total Selecionado - ${formatBRL(
      selectedCostSum
    )}*\n\n*Faturamento - ${formatBRL(effectiveFaturamento)}*`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Badge de saúde do CMV
  const getCmvStatus = (pct: number) => {
    if (pct === 0)
      return {
        label: "Sem dados",
        color: "text-zinc-500 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700",
      };
    if (pct <= 32)
      return {
        label: "Excelente (< 32%)",
        color:
          "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60",
      };
    if (pct <= 38)
      return {
        label: "Meta Ideal (32% - 38%)",
        color:
          "text-indigo-700 bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800/60",
      };
    if (pct <= 42)
      return {
        label: "Atenção (38% - 42%)",
        color:
          "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60",
      };
    return {
      label: "Crítico (> 42%)",
      color:
        "text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60",
    };
  };

  // Coleta e filtragem de lançamentos para a tabela completa
  const allFilteredItems = useMemo(() => {
    if (!data) return [];
    let items: CostCenterItem[] = [];
    if (data.isConsolidated) {
      data.stores.forEach((st) => {
        items.push(...st.items);
      });
    } else if (data.stores.length > 0) {
      items = data.stores[0].items;
    }

    return items.filter((it) => {
      // Filtro de centro de custo / subcategoria
      let matchCenter = true;
      if (tableFilter === "all_entries") {
        matchCenter = true;
      } else if (tableFilter === "selected_cmv") {
        if (it.costCenterKey === "outros") {
          matchCenter = Boolean(selectedOutrosSubcategories[it.category]);
        } else {
          matchCenter = Boolean(activeCenters[it.costCenterKey]);
        }
      } else if (tableFilter.startsWith("sub:")) {
        const raw = tableFilter.replace("sub:", "");
        matchCenter = it.category === raw;
      } else {
        matchCenter = it.costCenterKey === tableFilter;
      }

      // Filtro de status
      let matchStatus = true;
      if (statusFilter === "paid") matchStatus = it.paid === true;
      if (statusFilter === "pending") matchStatus = it.paid === false;

      // Filtro de busca textual
      const q = searchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        it.description.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q) ||
        (it.provider && it.provider.toLowerCase().includes(q)) ||
        it.value.toString().includes(q);

      return matchCenter && matchStatus && matchSearch;
    });
  }, [data, tableFilter, statusFilter, searchTerm, activeCenters, selectedOutrosSubcategories]);

  // Total dos itens atualmente visíveis na tabela
  const tableFilteredTotal = useMemo(() => {
    return allFilteredItems.reduce((acc, cur) => acc + cur.value, 0);
  }, [allFilteredItems]);

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
                Auditoria 100% precisa com controle granular de centros e desdobramento de despesas.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Recalcular
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

      {/* Control Bar: Seletor de Loja + Seletor de Período + Regime de Data */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
        {/* Seletor de Loja */}
        <div className="lg:col-span-4 flex flex-col justify-center">
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
        <div className="lg:col-span-3 flex flex-col justify-center">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-zinc-400" />
            Período Rápido
          </label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handlePreset("estaSemana")}
              className="flex-1 py-1.5 px-1.5 rounded-md text-[11px] font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              Esta sem.
            </button>
            <button
              onClick={() => handlePreset("semanaPassada")}
              className="flex-1 py-1.5 px-1.5 rounded-md text-[11px] font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              Sem. ant.
            </button>
            <button
              onClick={() => handlePreset("esteMes")}
              className="flex-1 py-1.5 px-1.5 rounded-md text-[11px] font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              Mês atual
            </button>
            <button
              onClick={() => handlePreset("mesPassado")}
              className="flex-1 py-1.5 px-1.5 rounded-md text-[11px] font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
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

        {/* Regime de Data (Vencimento vs Competência) */}
        <div className="lg:col-span-2 flex flex-col justify-center">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1 block">
            Regime
          </label>
          <select
            value={dateType}
            onChange={(e) => setDateType(e.target.value as any)}
            className="w-full h-9 px-2 rounded-lg text-[11px] font-medium bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#6658d3]"
          >
            <option value="due_date">Vencimento</option>
            <option value="competence_date">Competência</option>
          </select>
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
          {/* BARRA DE SELEÇÃO DE CENTROS DE CUSTO NA SOMA */}
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-[#6658d3]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                  Centros de Custo Incluídos na Soma do CMV
                </h3>
                <span className="text-[11px] text-zinc-500 font-medium">
                  ({activeCenterLabels.length} ativos)
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={resetToStandardCmv}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#6658d3] hover:bg-[#6658d3]/10 transition-colors"
                >
                  Padrão (4 Centros)
                </button>
                <span className="text-zinc-300 dark:text-zinc-700">|</span>
                <button
                  onClick={selectAllCenters}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                >
                  Selecionar Todos
                </button>
              </div>
            </div>

            {/* Checkbox Chips principais */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {COST_CENTERS_CONFIG.map((cfg) => {
                const isOutros = cfg.key === "outros";
                const isActive = isOutros ? countSelectedOutros > 0 : activeCenters[cfg.key];
                const centerData = data.summary.costCenters[cfg.key];
                const displayedVal = isOutros ? selectedOutrosSum : centerData?.total || 0;
                const Icon = cfg.icon;

                return (
                  <div
                    key={cfg.key}
                    onClick={() => toggleCenter(cfg.key)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      isActive
                        ? `${cfg.borderActive} bg-white dark:bg-zinc-850 shadow-sm`
                        : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden flex-1">
                      <div className={`p-1 rounded-md shrink-0 ${cfg.badgeBg}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="truncate">
                        <span className="text-[11px] font-bold block truncate text-zinc-900 dark:text-zinc-100">
                          {cfg.label}
                        </span>
                        <span className="text-[10px] text-zinc-500 block truncate">
                          {isOutros && countSelectedOutros > 0
                            ? `${formatBRL(displayedVal)} (${countSelectedOutros})`
                            : isOutros
                            ? `R$ 0 (${formatBRL(centerData?.total || 0)})`
                            : formatBRL(displayedVal)}
                        </span>
                      </div>
                    </div>

                    <div className="ml-1 shrink-0 flex items-center gap-1">
                      {/* Olhinho minimalista */}
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDetailTarget({
                            type: "center",
                            key: cfg.key,
                            label: cfg.label,
                            badgeBg: cfg.badgeBg,
                            icon: cfg.icon,
                          });
                        }}
                        className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                        title={`Ver saídas de ${cfg.label} até o valor total`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </span>

                      {/* Ícone de status */}
                      {isOutros ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowOutrosBreakdown((prev) => !prev);
                          }}
                          className="p-0.5 rounded text-zinc-400 hover:text-zinc-700"
                          title="Desdobrar subcategorias de Outras Despesas"
                        >
                          {showOutrosBreakdown ? (
                            <ChevronUp className="h-3.5 w-3.5 text-[#6658d3]" />
                          ) : (
                            <Settings2 className="h-3.5 w-3.5 text-zinc-400" />
                          )}
                        </button>
                      ) : isActive ? (
                        <CheckSquare className="h-4 w-4 text-[#6658d3]" />
                      ) : (
                        <Square className="h-4 w-4 text-zinc-400" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* PAINEL DE DESDOBRAMENTO ESPECÍFICO DE OUTRAS DESPESAS */}
            {outrosSubcategories.length > 0 && (
              <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-3.5 w-3.5 text-zinc-500" />
                    <span className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200">
                      Desdobramento de Outras Despesas: Escolha literalmente quais entram na soma
                    </span>
                    <span className="text-[10px] text-zinc-500 font-medium">
                      ({countSelectedOutros} de {outrosSubcategories.length} ativas · {formatBRL(selectedOutrosSum)})
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={selectAllOutros}
                      className="text-[#6658d3] hover:underline font-semibold"
                    >
                      Marcar Todas
                    </button>
                    <span className="text-zinc-300 dark:text-zinc-700">|</span>
                    <button
                      type="button"
                      onClick={deselectAllOutros}
                      className="text-zinc-500 hover:underline"
                    >
                      Desmarcar Todas
                    </button>
                  </div>
                </div>

                {/* Grid das subcategorias reais (Motoboy, Freelancer, Gás, Limpeza, etc.) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {outrosSubcategories.map((sub) => {
                    const isChecked = !!selectedOutrosSubcategories[sub.rawCategory];

                    return (
                      <div
                        key={sub.rawCategory}
                        className={`flex items-center justify-between p-2 rounded-xl border text-xs transition-all ${
                          isChecked
                            ? "bg-purple-50/60 dark:bg-purple-950/20 border-purple-300 dark:border-purple-800 text-zinc-900 dark:text-zinc-100"
                            : "bg-zinc-50 dark:bg-zinc-850 border-zinc-200 dark:border-zinc-800 text-zinc-500 opacity-75 hover:opacity-100"
                        }`}
                      >
                        <label className="flex items-center gap-2 cursor-pointer flex-1 truncate mr-1.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleOutrosSubcategory(sub.rawCategory)}
                            className="rounded text-[#6658d3] focus:ring-[#6658d3] h-3.5 w-3.5"
                          />
                          <span className="font-semibold truncate text-[11px]" title={sub.rawCategory}>
                            {sub.label}
                          </span>
                        </label>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-bold text-[11px] text-zinc-900 dark:text-zinc-100">
                            {formatBRL(sub.total)}
                          </span>

                          {/* Olhinho da subcategoria específica! */}
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedDetailTarget({
                                type: "subcategory",
                                key: sub.rawCategory,
                                label: sub.label,
                              })
                            }
                            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                            title={`Ver saídas de ${sub.label} até ${formatBRL(sub.total)}`}
                          >
                            <Eye className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* CARDS PRINCIPAIS DE KPI */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: CMV Realizado */}
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  CMV Realizado
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    getCmvStatus(effectiveCmvPercent).color
                  }`}
                >
                  {getCmvStatus(effectiveCmvPercent).label}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl lg:text-4xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
                  {formatPercent(effectiveCmvPercent)}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-2">
                Calculado sobre os {activeCenterLabels.length} centros e subcategorias selecionados.
              </p>
              <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-5 pointer-events-none">
                <TrendingDown className="w-24 h-24 text-zinc-900 dark:text-white" />
              </div>
            </div>

            {/* Card 2: Total de Custos Selecionados */}
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Total de Custos Selecionados
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {activeCenterLabels.length} itens ativos
                </span>
              </div>
              <div className="text-3xl lg:text-4xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
                {formatBRL(selectedCostSum)}
              </div>
              <p className="text-[11px] text-zinc-500 mt-2 truncate" title={activeCenterLabels.join(" + ")}>
                {activeCenterLabels.join(" + ") || "Nenhum centro selecionado"}
              </p>
            </div>

            {/* Card 3: Faturamento da Loja */}
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Faturamento da Loja
                </span>
                {!isEditingFat ? (
                  <button
                    onClick={() => {
                      setManualFaturamento(String(data.summary.faturamento));
                      setIsEditingFat(true);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-[#6658d3] hover:underline font-medium"
                    title="Ajustar faturamento manualmente"
                  >
                    <Edit3 className="h-3 w-3" />
                    <span>Ajustar</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setManualFaturamento("");
                      setIsEditingFat(false);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 font-medium"
                    title="Restaurar valor oficial automático"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Restaurar</span>
                  </button>
                )}
              </div>

              {!isEditingFat ? (
                <div className="text-3xl lg:text-4xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight text-emerald-600 dark:text-emerald-400">
                  {formatBRL(effectiveFaturamento)}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-zinc-400">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={manualFaturamento}
                    onChange={(e) => setManualFaturamento(e.target.value)}
                    className="w-full text-2xl font-bold px-2 py-1 rounded bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#6658d3]"
                    placeholder="Valor exato..."
                    autoFocus
                  />
                </div>
              )}

              <p className="text-[11px] text-zinc-500 mt-2">
                {manualFaturamento
                  ? "⚠️ Valor ajustado manualmente (recalculando CMV em tempo real)."
                  : "Receita oficial registrada na Takeat."}
              </p>
            </div>
          </div>

          {/* DETALHAMENTO DE TODOS OS CENTROS DE CUSTO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {COST_CENTERS_CONFIG.map((cfg) => {
              const isOutros = cfg.key === "outros";
              const isActive = isOutros ? countSelectedOutros > 0 : activeCenters[cfg.key];
              const center = data.summary.costCenters[cfg.key];
              const totalVal = center?.total || 0;
              const countItems = center?.items?.length || 0;
              const displayedVal = isOutros && countSelectedOutros > 0 ? selectedOutrosSum : totalVal;
              const pct = effectiveFaturamento > 0 ? (displayedVal / effectiveFaturamento) * 100 : 0;
              const Icon = cfg.icon;

              return (
                <div
                  key={cfg.key}
                  className={`p-4 rounded-xl border transition-all ${
                    isActive
                      ? "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm"
                      : "bg-zinc-50/70 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${cfg.badgeBg}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">
                          {cfg.label}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {countItems} lançamento{countItems === 1 ? "" : "s"}
                          {isOutros && ` (${outrosSubcategories.length} subcategorias)`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Olhinho minimalista */}
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedDetailTarget({
                            type: "center",
                            key: cfg.key,
                            label: cfg.label,
                            badgeBg: cfg.badgeBg,
                            icon: cfg.icon,
                          })
                        }
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title={`Ver saídas de ${cfg.label} até o valor total`}
                      >
                        <Eye className="h-4 w-4" />
                      </button>

                      {isOutros ? (
                        <button
                          type="button"
                          onClick={() => setShowOutrosBreakdown((prev) => !prev)}
                          className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all flex items-center gap-1"
                        >
                          <Settings2 className="h-3 w-3" />
                          <span>{countSelectedOutros > 0 ? `${countSelectedOutros} ativas` : "Escolher"}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleCenter(cfg.key)}
                          className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all ${
                            isActive
                              ? "bg-[#6658d3]/10 border-[#6658d3]/30 text-[#6658d3]"
                              : "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-zinc-700"
                          }`}
                        >
                          {isActive ? "✓ Na soma" : "+ Incluir"}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between mt-3">
                    <div>
                      <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        {formatBRL(displayedVal)}
                      </span>
                      {isOutros && countSelectedOutros > 0 && (
                        <span className="text-[10px] text-zinc-400 block">
                          de {formatBRL(totalVal)} totais
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-zinc-500">
                      {formatPercent(pct)}
                    </span>
                  </div>

                  <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full mt-2.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        cfg.key === "cProducao"
                          ? "bg-purple-500"
                          : cfg.key === "mPrima"
                          ? "bg-red-500"
                          : cfg.key === "embalagem"
                          ? "bg-blue-500"
                          : cfg.key === "bebida"
                          ? "bg-amber-500"
                          : cfg.key === "suco"
                          ? "bg-emerald-500"
                          : "bg-zinc-400"
                      }`}
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* TABELA COMPARATIVA POR LOJA (Consolidado) */}
          {data.isConsolidated && data.stores.length > 1 && (
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-[#6658d3]" />
                  Comparativo por Unidade da Rede (Recalculado Dinamicamente)
                </h3>
                <span className="text-[11px] text-zinc-400 font-mono">
                  Base: {activeCenterLabels.join(", ")}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-500">
                      <th className="py-2.5 px-3">Loja</th>
                      <th className="py-2.5 px-3">Faturamento</th>
                      <th className="py-2.5 px-3">C. Produção</th>
                      <th className="py-2.5 px-3">M. Prima</th>
                      <th className="py-2.5 px-3">Embalagem</th>
                      <th className="py-2.5 px-3">Bebida</th>
                      {activeCenters.suco && <th className="py-2.5 px-3">Suco</th>}
                      {countSelectedOutros > 0 && <th className="py-2.5 px-3">Outras Sel.</th>}
                      <th className="py-2.5 px-3">Total Selecionado</th>
                      <th className="py-2.5 px-3 text-right">CMV (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {data.stores.map((st) => {
                      let storeSum = 0;
                      (["cProducao", "mPrima", "embalagem", "bebida", "suco"] as CostCenterKey[]).forEach((k) => {
                        if (activeCenters[k]) {
                          storeSum += st.costCenters[k]?.total || 0;
                        }
                      });
                      const storeOutrosSel = st.costCenters.outros?.items?.reduce((acc, it) => {
                        return selectedOutrosSubcategories[it.category] ? acc + it.value : acc;
                      }, 0) || 0;
                      storeSum += storeOutrosSel;
                      const storePct = st.faturamento > 0 ? (storeSum / st.faturamento) * 100 : 0;

                      return (
                        <tr key={st.storeId} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                          <td className="py-2.5 px-3 font-semibold text-zinc-900 dark:text-zinc-100">
                            {st.storeName}
                          </td>
                          <td className="py-2.5 px-3 text-emerald-600 dark:text-emerald-400 font-medium">
                            {formatBRL(st.faturamento)}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300">
                            {formatBRL(st.costCenters.cProducao?.total || 0)}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300">
                            {formatBRL(st.costCenters.mPrima?.total || 0)}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300">
                            {formatBRL(st.costCenters.embalagem?.total || 0)}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300">
                            {formatBRL(st.costCenters.bebida?.total || 0)}
                          </td>
                          {activeCenters.suco && (
                            <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300">
                              {formatBRL(st.costCenters.suco?.total || 0)}
                            </td>
                          )}
                          {countSelectedOutros > 0 && (
                            <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300">
                              {formatBRL(storeOutrosSel)}
                            </td>
                          )}
                          <td className="py-2.5 px-3 font-semibold text-zinc-900 dark:text-zinc-100">
                            {formatBRL(storeSum)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-extrabold text-zinc-900 dark:text-zinc-100">
                            {formatPercent(storePct)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TABELA DE AUDITORIA COMPLETA DE LANÇAMENTOS */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-[#6658d3]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                    Auditoria de Lançamentos Takeat
                  </h3>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold">
                    {allFilteredItems.length} lançamentos · {formatBRL(tableFilteredTotal)}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Exibição detalhada de cada gasto, nota ou compra registrada no sistema.
                </p>
              </div>

              {/* Controles de Filtro e Busca */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Busca rápida */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar por descrição, fornecedor..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8 pl-8 pr-3 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#6658d3] w-48 sm:w-64"
                  />
                </div>

                {/* Seletor de Categoria/Centro */}
                <select
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                  className="h-8 px-2.5 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#6658d3]"
                >
                  <option value="all_entries">🌐 Todos os Lançamentos</option>
                  <option value="selected_cmv">✓ Apenas Centros na Soma</option>
                  <option value="cProducao">🏭 Central de Produção</option>
                  <option value="mPrima">🥩 Matéria Prima</option>
                  <option value="embalagem">📦 Embalagem</option>
                  <option value="bebida">🍷 Bebida</option>
                  <option value="suco">🥤 Suco</option>
                  <option value="outros">🧾 Outras Despesas (Geral)</option>
                  {outrosSubcategories.map((sub) => (
                    <option key={`opt-${sub.rawCategory}`} value={`sub:${sub.rawCategory}`}>
                      ↳ {sub.label}
                    </option>
                  ))}
                </select>

                {/* Seletor de Status (Pago / A Pagar) */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="h-8 px-2 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#6658d3]"
                >
                  <option value="all">Status: Todos</option>
                  <option value="paid">Pagos</option>
                  <option value="pending">A Pagar</option>
                </select>
              </div>
            </div>

            {allFilteredItems.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-400 text-xs">
                Nenhum lançamento encontrado para os filtros selecionados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-500">
                      <th className="py-2.5 px-3">Data</th>
                      {data.isConsolidated && <th className="py-2.5 px-3">Loja</th>}
                      <th className="py-2.5 px-3">Descrição</th>
                      <th className="py-2.5 px-3">Centro de Custo</th>
                      <th className="py-2.5 px-3">Fornecedor</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {allFilteredItems.map((item, idx) => {
                      const cfg = COST_CENTERS_CONFIG.find(
                        (c) => c.key === item.costCenterKey
                      );

                      return (
                        <tr
                          key={`${item.id}-${idx}`}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                        >
                          <td className="py-2.5 px-3 text-zinc-500 whitespace-nowrap">
                            {formatDateDisplay(
                              dateType === "competence_date"
                                ? item.competenceDate
                                : item.dueDate
                            )}
                          </td>
                          {data.isConsolidated && (
                            <td className="py-2.5 px-3 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                              {item.storeName}
                            </td>
                          )}
                          <td className="py-2.5 px-3 font-medium text-zinc-900 dark:text-zinc-100 max-w-[280px] truncate" title={item.description}>
                            {item.description}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                cfg?.badgeBg || "bg-zinc-100 text-zinc-700"
                              }`}
                            >
                              {item.costCenterKey === "outros"
                                ? item.category.split(":").pop()?.trim() || item.category
                                : cfg?.label || item.category}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-zinc-500 max-w-[180px] truncate" title={item.provider}>
                            {item.provider || "-"}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`text-[10px] font-semibold ${
                                item.paid ? "text-emerald-600" : "text-amber-600"
                              }`}
                            >
                              {item.paid ? "Pago" : "A Pagar"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                            {formatBRL(item.value)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* MODAL MINIMALISTA DE COMPOSIÇÃO DE SAÍDAS DO ALVO (CENTRO OU SUBCATEGORIA) */}
      {selectedDetailTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                    selectedDetailTarget.badgeBg || "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"
                  }`}
                >
                  {selectedDetailTarget.icon ? (
                    React.createElement(selectedDetailTarget.icon, { className: "h-5 w-5" })
                  ) : (
                    <Receipt className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    Composição de Saídas: {selectedDetailTarget.label}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Soma passo a passo até o valor final de{" "}
                    <strong className="text-zinc-900 dark:text-zinc-100 font-bold">
                      {formatBRL(detailTotalVal)}
                    </strong>{" "}
                    ({detailItemsWithCumulative.length} saídas)
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedDetailTarget(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content Table */}
            <div className="p-4 overflow-y-auto flex-1">
              {detailItemsWithCumulative.length === 0 ? (
                <div className="text-center py-12 text-zinc-400 text-xs">
                  Nenhuma saída encontrada neste período para este item.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-500">
                        <th className="py-2 px-2 text-center w-8">#</th>
                        <th className="py-2 px-2.5">Data</th>
                        <th className="py-2 px-2.5">Descrição</th>
                        <th className="py-2 px-2.5">Fornecedor</th>
                        <th className="py-2 px-2.5 text-right">Saída (R$)</th>
                        <th className="py-2 px-2.5 text-right font-bold text-[#6658d3]">Acumulado (R$)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {detailItemsWithCumulative.map((item, idx) => (
                        <tr key={`${item.id}-${idx}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                          <td className="py-2 px-2 text-center text-zinc-400 font-mono text-[10px]">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-2.5 text-zinc-500 whitespace-nowrap">
                            {formatDateDisplay(
                              dateType === "competence_date" ? item.competenceDate : item.dueDate
                            )}
                          </td>
                          <td
                            className="py-2 px-2.5 font-medium text-zinc-900 dark:text-zinc-100 max-w-[200px] truncate"
                            title={item.description}
                          >
                            {item.description}
                          </td>
                          <td
                            className="py-2 px-2.5 text-zinc-500 max-w-[130px] truncate"
                            title={item.provider}
                          >
                            {item.provider || "-"}
                          </td>
                          <td className="py-2 px-2.5 text-right font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                            {formatBRL(item.value)}
                          </td>
                          <td className="py-2 px-2.5 text-right font-extrabold text-[#6658d3] whitespace-nowrap bg-purple-50/40 dark:bg-purple-950/20">
                            {formatBRL(item.cumulative)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-zinc-300 dark:border-zinc-700 font-bold bg-zinc-50 dark:bg-zinc-800/60">
                        <td colSpan={4} className="py-2.5 px-3 text-zinc-900 dark:text-zinc-100">
                          Total Final ({detailItemsWithCumulative.length} saídas)
                        </td>
                        <td colSpan={2} className="py-2.5 px-3 text-right text-sm font-extrabold text-[#6658d3]">
                          {formatBRL(detailTotalVal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 bg-zinc-50 dark:bg-zinc-850 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <span className="text-[11px] text-zinc-500">
                Cada saída acumula progressivamente até atingir o total do centro.
              </span>
              <button
                onClick={() => setSelectedDetailTarget(null)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
