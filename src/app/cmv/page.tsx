"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  RefreshCw,
  Copy,
  Check,
  TrendingDown,
  TrendingUp,
  DollarSign,
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
  barColor: string;
  defaultIncluded: boolean;
  description: string;
}

const COST_CENTERS_CONFIG: CostCenterConfig[] = [
  {
    key: "cProducao",
    label: "Central de Produção",
    icon: Factory,
    color: "text-[#007A74]",
    badgeBg: "bg-[#00C7BE]/15 text-[#007A74]",
    borderActive: "border-[#00C7BE]/40 ring-1 ring-[#00C7BE]/20",
    barColor: "#00C7BE",
    defaultIncluded: true,
    description: "Transferências, carnes e pré-preparo da Central",
  },
  {
    key: "mPrima",
    label: "Matéria Prima",
    icon: Beef,
    color: "text-[#3634A3]",
    badgeBg: "bg-[#5856D6]/15 text-[#3634A3]",
    borderActive: "border-[#5856D6]/40 ring-1 ring-[#5856D6]/20",
    barColor: "#5856D6",
    defaultIncluded: true,
    description: "Carnes, queijos, bacon, batatas e hortifruti",
  },
  {
    key: "embalagem",
    label: "Embalagem",
    icon: Package,
    color: "text-[#0071A4]",
    badgeBg: "bg-[#32ADE6]/15 text-[#0071A4]",
    borderActive: "border-[#32ADE6]/40 ring-1 ring-[#32ADE6]/20",
    barColor: "#32ADE6",
    defaultIncluded: true,
    description: "Caixas, sacolas, copos, potes e descartáveis",
  },
  {
    key: "bebida",
    label: "Bebida",
    icon: Wine,
    color: "text-[#7325A6]",
    badgeBg: "bg-[#AF52DE]/15 text-[#7325A6]",
    borderActive: "border-[#AF52DE]/40 ring-1 ring-[#AF52DE]/20",
    barColor: "#AF52DE",
    defaultIncluded: true,
    description: "Refrigerantes, cervejas, águas e destilados",
  },
  {
    key: "suco",
    label: "Suco",
    icon: CupSoda,
    color: "text-[#B25000]",
    badgeBg: "bg-[#FF9500]/15 text-[#B25000]",
    borderActive: "border-[#FF9500]/40 ring-1 ring-[#FF9500]/20",
    barColor: "#FF9500",
    defaultIncluded: false,
    description: "Polpas, concentrados e sucos (opcional)",
  },
  {
    key: "outros",
    label: "Outras Despesas",
    icon: Receipt,
    color: "text-[#B80F33]",
    badgeBg: "bg-[#FF2D55]/15 text-[#B80F33]",
    borderActive: "border-[#FF2D55]/40 ring-1 ring-[#FF2D55]/20",
    barColor: "#FF2D55",
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

  // Badge de saúde do CMV (Regra Apple: Bom é menos de 35%)
  const getCmvStatus = (pct: number) => {
    if (pct === 0)
      return {
        label: "Sem dados",
        color: "text-[#8E8E93] bg-[#767680]/10 border-black/5",
      };
    if (pct < 35)
      return {
        label: "Bom (< 35%)",
        color: "text-[#248A3D] bg-[#34C759]/15 border-[#34C759]/25",
      };
    if (pct <= 40)
      return {
        label: "Atenção (35% - 40%)",
        color: "text-[#D70015] bg-[#FF3B30]/15 border-[#FF3B30]/25",
      };
    return {
      label: "Crítico (> 40%)",
      color: "text-[#D70015] bg-[#FF3B30]/15 border-[#FF3B30]/25",
    };
  };

  // Tema suave do Card de CMV (Verde suave se < 35%, vermelho suave se >= 35%)
  const getCmvCardTheme = (pct: number) => {
    if (pct === 0) {
      return {
        bg: "#FFFFFF",
        border: "border-black/[0.04]",
        numberColor: "text-[#1C1C1E]",
        labelColor: "text-[#8E8E93]",
        subColor: "text-[#8E8E93]",
        badgeBg: "bg-[#767680]/10 text-[#8E8E93] border-black/5",
        iconCircle: "bg-[#767680]/10 text-[#8E8E93]",
        boxShadow:
          "0 0 0 1px rgba(0,0,0,0.03), 0 2px 5px rgba(0,0,0,0.02), 0 12px 28px -4px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,1)",
      };
    }
    // BOM: Verde suave Apple Health (< 35%)
    if (pct < 35) {
      return {
        bg: "linear-gradient(180deg, #F0FAF5 0%, #FFFFFF 100%)",
        border: "border-[#34C759]/30",
        numberColor: "text-[#248A3D]",
        labelColor: "text-[#248A3D]",
        subColor: "text-[#248A3D]/80",
        badgeBg: "bg-[#34C759]/15 text-[#248A3D] border-[#34C759]/30",
        iconCircle: "bg-[#34C759]/15 text-[#248A3D]",
        boxShadow:
          "0 0 0 1px rgba(52, 199, 89, 0.2), 0 3px 8px rgba(0,0,0,0.02), 0 14px 28px -4px rgba(52, 199, 89, 0.08), inset 0 1px 0 rgba(255,255,255,1)",
      };
    }
    // RUIM: Vermelho suave Apple Health (>= 35%)
    return {
      bg: "linear-gradient(180deg, #FFF5F5 0%, #FFFFFF 100%)",
      border: "border-[#FF3B30]/30",
      numberColor: "text-[#D70015]",
      labelColor: "text-[#D70015]",
      subColor: "text-[#D70015]/80",
      badgeBg: "bg-[#FF3B30]/15 text-[#D70015] border-[#FF3B30]/30",
      iconCircle: "bg-[#FF3B30]/15 text-[#D70015]",
      boxShadow:
        "0 0 0 1px rgba(255, 59, 48, 0.2), 0 3px 8px rgba(0,0,0,0.02), 0 14px 28px -4px rgba(255, 59, 48, 0.08), inset 0 1px 0 rgba(255,255,255,1)",
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-black/[0.06]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-[11px] bg-[#1C1C1E] text-white flex items-center justify-center font-bold text-sm shadow-[0_2px_6px_rgba(0,0,0,0.12)]">
              %
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#1C1C1E]">
                CMV · Custo de Mercadoria Vendida
              </h1>
              <p className="text-xs text-[#8E8E93]">
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
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold bg-white hover:bg-[#F2F2F7] text-[#1C1C1E] border border-black/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Recalcular
          </button>

          <button
            onClick={handleCopyWhatsApp}
            disabled={!data || loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold bg-[#1C1C1E] hover:bg-[#2C2C2E] text-white shadow-[0_2px_8px_rgba(0,0,0,0.12)] active:scale-95 transition-all disabled:opacity-50"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-[#34C759]" />
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

      {/* Apple iOS Control Bar: Seletor de Loja + Seletor de Período + Regime de Data */}
      <div className="ios-widget p-4 sm:p-5 flex flex-col gap-4">
        {/* Linha 1: Segmented Control de Unidades */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8E8E93] flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-[#8E8E93]" />
              Unidade
            </span>
          </div>

          {/* Segmented Control Oficial Apple */}
          <div className="inline-flex p-1 bg-[#767680]/12 rounded-full overflow-x-auto max-w-full gap-1">
            {STORE_TABS.map((tab) => {
              const isSelected = selectedUnit === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedUnit(tab.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs transition-all duration-200 whitespace-nowrap ${
                    isSelected
                      ? "bg-white text-[#1C1C1E] font-bold shadow-[0_2px_6px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.06)]"
                      : "text-[#636366] hover:text-[#1C1C1E] font-medium"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Linha 2: Presets Rápidos + Datas Exatas + Regime */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-3 border-t border-black/[0.04] items-center">
          {/* Presets Rápidos Segmented Control */}
          <div className="md:col-span-5 flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#8E8E93] flex items-center gap-1">
              <Calendar className="h-3 w-3 text-[#8E8E93]" />
              Período Rápido
            </label>
            <div className="inline-flex p-1 bg-[#767680]/12 rounded-full gap-1">
              {[
                { id: "estaSemana", label: "Esta sem." },
                { id: "semanaPassada", label: "Sem. ant." },
                { id: "esteMes", label: "Mês atual" },
                { id: "mesPassado", label: "Mês ant." },
              ].map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePreset(preset.id as any)}
                  className="flex-1 py-1 px-2 rounded-full text-[11px] font-medium text-[#636366] hover:text-[#1C1C1E] hover:bg-white/60 transition-all text-center"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Datas Início e Fim */}
          <div className="md:col-span-4 flex items-center gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[#8E8E93] mb-1 block">
                Início
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-8 px-3 text-xs rounded-full bg-[#767680]/8 focus:bg-white border border-transparent focus:border-[#007AFF] text-[#1C1C1E] font-medium transition-all"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[#8E8E93] mb-1 block">
                Fim
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-8 px-3 text-xs rounded-full bg-[#767680]/8 focus:bg-white border border-transparent focus:border-[#007AFF] text-[#1C1C1E] font-medium transition-all"
              />
            </div>
          </div>

          {/* Regime Segmented Control */}
          <div className="md:col-span-3 flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#8E8E93]">
              Regime de Data
            </label>
            <div className="inline-flex p-1 bg-[#767680]/12 rounded-full gap-1">
              <button
                type="button"
                onClick={() => setDateType("due_date")}
                className={`flex-1 py-1 px-2.5 rounded-full text-[11px] transition-all ${
                  dateType === "due_date"
                    ? "bg-white text-[#1C1C1E] font-bold shadow-[0_2px_6px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-[#636366] hover:text-[#1C1C1E] font-medium"
                }`}
              >
                Vencimento
              </button>
              <button
                type="button"
                onClick={() => setDateType("competence_date")}
                className={`flex-1 py-1 px-2.5 rounded-full text-[11px] transition-all ${
                  dateType === "competence_date"
                    ? "bg-white text-[#1C1C1E] font-bold shadow-[0_2px_6px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-[#636366] hover:text-[#1C1C1E] font-medium"
                }`}
              >
                Competência
              </button>
            </div>
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
          {/* CARDS PRINCIPAIS DE KPI (TOPO) */}
          {(() => {
            const cmvTheme = getCmvCardTheme(effectiveCmvPercent);
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">
                {/* Card 1: CMV Realizado (Verde suave se bom, vermelho suave se ruim) */}
                <div
                  className={`p-6 rounded-[26px] border ${cmvTheme.border} transition-transform duration-200 hover:-translate-y-1 relative overflow-hidden flex flex-col justify-between`}
                  style={{ background: cmvTheme.bg, boxShadow: cmvTheme.boxShadow }}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-8 w-8 rounded-[10px] ${cmvTheme.iconCircle} flex items-center justify-center shadow-xs`}>
                          <TrendingDown className="h-4 w-4" />
                        </div>
                        <div>
                          <span className={`text-[11px] font-semibold uppercase tracking-wider ${cmvTheme.labelColor} block`}>
                            CMV Realizado
                          </span>
                          <span className={`text-[9px] ${cmvTheme.subColor} font-medium`}>Indicador Principal</span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${cmvTheme.badgeBg}`}>
                        {getCmvStatus(effectiveCmvPercent).label}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2 my-2">
                      <span className={`text-4xl lg:text-5xl font-extrabold ${cmvTheme.numberColor} tracking-tight tabular-nums`}>
                        {formatPercent(effectiveCmvPercent)}
                      </span>
                    </div>
                  </div>

                  <p className={`text-[11px] ${cmvTheme.subColor} mt-3 leading-relaxed`}>
                    Calculado sobre os {activeCenterLabels.length} centros e subcategorias selecionados.
                  </p>
                </div>

                {/* Card 2: Total de Custos Selecionados */}
                <div className="ios-widget p-6 rounded-[26px] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-[10px] bg-[#007AFF]/12 text-[#007AFF] flex items-center justify-center">
                          <DollarSign className="h-4 w-4" />
                        </div>
                        <div>
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8E8E93] block">
                            Total de Custos
                          </span>
                          <span className="text-[9px] text-[#8E8E93] font-medium">Soma Ativa</span>
                        </div>
                      </div>
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#767680]/8 text-[#636366] font-semibold border border-black/5">
                        {activeCenterLabels.length} itens ativos
                      </span>
                    </div>

                    <div className="text-3xl lg:text-4xl font-extrabold text-[#1C1C1E] tracking-tight tabular-nums my-2">
                      {formatBRL(selectedCostSum)}
                    </div>
                  </div>

                  <p className="text-[11px] text-[#8E8E93] mt-3 truncate" title={activeCenterLabels.join(" + ")}>
                    {activeCenterLabels.join(" + ") || "Nenhum centro selecionado"}
                  </p>
                </div>

                {/* Card 3: Faturamento da Loja */}
                <div className="ios-widget p-6 rounded-[26px] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-[10px] bg-[#34C759]/12 text-[#248A3D] flex items-center justify-center">
                          <TrendingUp className="h-4 w-4" />
                        </div>
                        <div>
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8E8E93] block">
                            Faturamento da Loja
                          </span>
                          <span className="text-[9px] text-[#8E8E93] font-medium">Receita</span>
                        </div>
                      </div>
                      {!isEditingFat ? (
                        <button
                          onClick={() => {
                            setManualFaturamento(String(data.summary.faturamento));
                            setIsEditingFat(true);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] text-[#007AFF] hover:underline font-semibold"
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
                          className="inline-flex items-center gap-1 text-[11px] text-[#8E8E93] hover:text-[#1C1C1E] font-semibold"
                          title="Restaurar valor oficial automático"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Restaurar</span>
                        </button>
                      )}
                    </div>

                    {!isEditingFat ? (
                      <div className="text-3xl lg:text-4xl font-extrabold text-[#1C1C1E] tracking-tight tabular-nums my-2">
                        {formatBRL(effectiveFaturamento)}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 my-2">
                        <span className="text-xl font-bold text-[#8E8E93]">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={manualFaturamento}
                          onChange={(e) => setManualFaturamento(e.target.value)}
                          className="w-full text-2xl font-bold px-3 py-1 rounded-full bg-[#767680]/8 border border-transparent focus:border-[#007AFF] focus:bg-white text-[#1C1C1E] focus:outline-none"
                          placeholder="Valor exato..."
                          autoFocus
                        />
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-[#8E8E93] mt-3">
                    {manualFaturamento
                      ? "⚠️ Ajustado manualmente (recalculando CMV em tempo real)."
                      : "Receita oficial registrada na Takeat."}
                  </p>
                </div>
              </div>
            );
          })()}

          {/* COMPOSIÇÃO UNIFICADA DOS CENTROS DE CUSTO (SEM DUPLICAÇÃO DE DADOS) */}
          <div className="ios-widget p-6 rounded-[28px] space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-[#1C1C1E]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#1C1C1E]">
                  Centros de Custo & Composição do CMV
                </h3>
                <span className="text-[11px] text-[#8E8E93] font-medium">
                  ({activeCenterLabels.length} na soma)
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={resetToStandardCmv}
                  className="px-3 py-1 rounded-full text-[11px] font-semibold text-[#007AFF] bg-[#007AFF]/10 hover:bg-[#007AFF]/20 transition-all"
                >
                  Padrão (4 Centros)
                </button>
                <span className="text-black/10">|</span>
                <button
                  onClick={selectAllCenters}
                  className="px-3 py-1 rounded-full text-[11px] font-medium text-[#636366] hover:text-[#1C1C1E] hover:bg-[#767680]/8 transition-all"
                >
                  Selecionar Todos
                </button>
              </div>
            </div>

            {/* Grid dos 6 Centros de Custo Unificados */}
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
                    onClick={() => {
                      if (!isOutros) toggleCenter(cfg.key);
                    }}
                    className={`ios-card p-5 rounded-[22px] border transition-all duration-200 ${
                      !isOutros ? "cursor-pointer" : ""
                    } ${
                      isActive
                        ? "bg-white border-black/[0.05]"
                        : "bg-[#FAFAFC] border-black/[0.03] opacity-60 hover:opacity-100 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-9 w-9 rounded-[11px] flex items-center justify-center ${cfg.badgeBg}`}>
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-[#1C1C1E] block">
                            {cfg.label}
                          </span>
                          <span className="text-[10px] text-[#8E8E93] font-medium">
                            {countItems} lançamento{countItems === 1 ? "" : "s"}
                            {isOutros && ` (${outrosSubcategories.length} subcategorias)`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
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
                          className="h-7 w-7 rounded-full bg-[#767680]/8 hover:bg-[#767680]/15 text-[#8E8E93] hover:text-[#1C1C1E] transition-all flex items-center justify-center"
                          title={`Ver saídas de ${cfg.label} até o valor total`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>

                        {/* Botão de Inclusão no CMV */}
                        {isOutros ? (
                          <button
                            type="button"
                            onClick={() => setShowOutrosBreakdown((prev) => !prev)}
                            className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-[#FF2D55]/20 bg-[#FF2D55]/10 text-[#D70015] hover:bg-[#FF2D55]/15 transition-all flex items-center gap-1"
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
                                ? "bg-[#34C759]/12 border-[#34C759]/25 text-[#248A3D] font-bold"
                                : "bg-[#767680]/8 border-black/5 text-[#8E8E93] hover:text-[#1C1C1E] font-medium"
                            }`}
                          >
                            {isActive ? "✓ Na soma" : "+ Incluir"}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-baseline justify-between mt-3">
                      <div>
                        <span className="text-lg font-bold text-[#1C1C1E] tabular-nums">
                          {formatBRL(displayedVal)}
                        </span>
                        {isOutros && countSelectedOutros > 0 && (
                          <span className="text-[10px] text-[#8E8E93] block">
                            de {formatBRL(totalVal)} totais
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-[#8E8E93] tabular-nums">
                        {formatPercent(pct)}
                      </span>
                    </div>

                    <div className="w-full bg-[#E5E5EA] h-1.5 rounded-full mt-3 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          backgroundColor: cfg.barColor,
                          width: `${Math.min(pct, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Painel de Desdobramento de Outras Despesas (Retrátil) */}
            {outrosSubcategories.length > 0 && showOutrosBreakdown && (
              <div className="mt-4 p-4 rounded-[20px] bg-[#F2F2F7]/70 border border-black/[0.04]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-6 w-6 rounded-[7px] bg-[#FF2D55]/15 text-[#D70015] flex items-center justify-center">
                      <Receipt className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[11px] font-bold text-[#1C1C1E]">
                      Desdobramento de Outras Despesas: Escolha quais entram na soma
                    </span>
                    <span className="text-[10px] text-[#8E8E93] font-medium">
                      ({countSelectedOutros} de {outrosSubcategories.length} ativas · {formatBRL(selectedOutrosSum)})
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={selectAllOutros}
                      className="px-2.5 py-0.5 rounded-full bg-[#007AFF]/10 text-[#007AFF] hover:bg-[#007AFF]/20 font-semibold transition-colors"
                    >
                      Marcar Todas
                    </button>
                    <span className="text-black/10">|</span>
                    <button
                      type="button"
                      onClick={deselectAllOutros}
                      className="px-2.5 py-0.5 rounded-full text-[#636366] hover:text-[#1C1C1E] transition-colors font-medium"
                    >
                      Desmarcar Todas
                    </button>
                  </div>
                </div>

                {/* Grid das subcategorias reais */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {outrosSubcategories.map((sub) => {
                    const isChecked = !!selectedOutrosSubcategories[sub.rawCategory];

                    return (
                      <div
                        key={sub.rawCategory}
                        className={`flex items-center justify-between p-2.5 rounded-[14px] border text-xs transition-all duration-200 ${
                          isChecked
                            ? "bg-white border-black/[0.06] text-[#1C1C1E] shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
                            : "bg-transparent border-transparent text-[#8E8E93] opacity-70 hover:opacity-100"
                        }`}
                      >
                        <label className="flex items-center gap-2 cursor-pointer flex-1 truncate mr-1.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleOutrosSubcategory(sub.rawCategory)}
                            className="rounded text-[#007AFF] focus:ring-[#007AFF] accent-[#007AFF] h-3.5 w-3.5 cursor-pointer"
                          />
                          <span className="font-semibold truncate text-[11px]" title={sub.rawCategory}>
                            {sub.label}
                          </span>
                        </label>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-bold text-[11px] text-[#1C1C1E] tabular-nums">
                            {formatBRL(sub.total)}
                          </span>

                          {/* Olhinho da subcategoria específica */}
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedDetailTarget({
                                type: "subcategory",
                                key: sub.rawCategory,
                                label: sub.label,
                              })
                            }
                            className="h-6 w-6 rounded-full hover:bg-[#767680]/10 text-[#8E8E93] hover:text-[#1C1C1E] transition-colors flex items-center justify-center"
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

          {/* TABELA COMPARATIVA POR LOJA (Consolidado - Apple Squircle 28px) */}
          {data.isConsolidated && data.stores.length > 1 && (
            <div className="ios-widget p-6 rounded-[28px]">
              <div className="flex items-center justify-between mb-3.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#1C1C1E] flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-[#1C1C1E]" />
                  Comparativo por Unidade da Rede (Recalculado Dinamicamente)
                </h3>
                <span className="text-[11px] text-[#8E8E93] font-mono">
                  Base: {activeCenterLabels.join(", ")}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E5E5EA] text-[10px] font-bold uppercase tracking-wider text-[#8E8E93]">
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
                  <tbody className="divide-y divide-[#E5E5EA]/60">
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
                        <tr key={st.storeId} className="hover:bg-[#F2F2F7]/70 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-[#1C1C1E]">
                            {st.storeName}
                          </td>
                          <td className="py-2.5 px-3 text-[#248A3D] font-semibold tabular-nums">
                            {formatBRL(st.faturamento)}
                          </td>
                          <td className="py-2.5 px-3 text-[#636366] tabular-nums">
                            {formatBRL(st.costCenters.cProducao?.total || 0)}
                          </td>
                          <td className="py-2.5 px-3 text-[#636366] tabular-nums">
                            {formatBRL(st.costCenters.mPrima?.total || 0)}
                          </td>
                          <td className="py-2.5 px-3 text-[#636366] tabular-nums">
                            {formatBRL(st.costCenters.embalagem?.total || 0)}
                          </td>
                          <td className="py-2.5 px-3 text-[#636366] tabular-nums">
                            {formatBRL(st.costCenters.bebida?.total || 0)}
                          </td>
                          {activeCenters.suco && (
                            <td className="py-2.5 px-3 text-[#636366] tabular-nums">
                              {formatBRL(st.costCenters.suco?.total || 0)}
                            </td>
                          )}
                          {countSelectedOutros > 0 && (
                            <td className="py-2.5 px-3 text-[#D70015] font-semibold tabular-nums">
                              {formatBRL(storeOutrosSel)}
                            </td>
                          )}
                          <td className="py-2.5 px-3 font-bold text-[#1C1C1E] tabular-nums">
                            {formatBRL(storeSum)}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <span
                              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                                getCmvStatus(storePct).color
                              }`}
                            >
                              {formatPercent(storePct)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TABELA DE AUDITORIA COMPLETA DE LANÇAMENTOS (APPLE SQUIRCLE 28px) */}
          <div className="ios-widget p-6 rounded-[28px]">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-[#007AFF]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#1C1C1E]">
                    Auditoria de Lançamentos Takeat
                  </h3>
                  <span className="text-[11px] px-3 py-0.5 rounded-full bg-[#767680]/8 text-[#636366] font-semibold border border-black/5">
                    {allFilteredItems.length} lançamentos · {formatBRL(tableFilteredTotal)}
                  </span>
                </div>
                <p className="text-[11px] text-[#8E8E93] mt-1">
                  Exibição detalhada de cada gasto, nota ou compra registrada no sistema.
                </p>
              </div>

              {/* Controles de Filtro e Busca com Formato Pílula Apple */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Busca rápida */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8E8E93]" />
                  <input
                    type="text"
                    placeholder="Buscar por descrição, fornecedor..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8 pl-8.5 pr-4 rounded-full text-xs bg-[#767680]/8 focus:bg-white border border-transparent focus:border-[#007AFF] text-[#1C1C1E] font-medium w-48 sm:w-64 transition-all focus:outline-none"
                  />
                </div>

                {/* Seletor de Categoria/Centro */}
                <select
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                  className="h-8 px-3 rounded-full text-xs bg-[#767680]/8 focus:bg-white border border-transparent focus:border-[#007AFF] text-[#1C1C1E] font-medium transition-all cursor-pointer focus:outline-none"
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
                  className="h-8 px-3 rounded-full text-xs bg-[#767680]/8 focus:bg-white border border-transparent focus:border-[#007AFF] text-[#1C1C1E] font-medium transition-all cursor-pointer focus:outline-none"
                >
                  <option value="all">Status: Todos</option>
                  <option value="paid">Pagos</option>
                  <option value="pending">A Pagar</option>
                </select>
              </div>
            </div>

            {allFilteredItems.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-black/10 rounded-[20px] text-[#8E8E93] text-xs">
                Nenhum lançamento encontrado para os filtros selecionados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E5E5EA] text-[10px] font-bold uppercase tracking-wider text-[#8E8E93]">
                      <th className="py-2.5 px-3">Data</th>
                      {data.isConsolidated && <th className="py-2.5 px-3">Loja</th>}
                      <th className="py-2.5 px-3">Descrição</th>
                      <th className="py-2.5 px-3">Centro de Custo</th>
                      <th className="py-2.5 px-3">Fornecedor</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5EA]/50">
                    {allFilteredItems.map((item, idx) => {
                      const cfg = COST_CENTERS_CONFIG.find(
                        (c) => c.key === item.costCenterKey
                      );

                      return (
                        <tr
                          key={`${item.id}-${idx}`}
                          className="hover:bg-[#F2F2F7]/70 transition-colors"
                        >
                          <td className="py-2.5 px-3 text-[#8E8E93] whitespace-nowrap">
                            {formatDateDisplay(
                              dateType === "competence_date"
                                ? item.competenceDate
                                : item.dueDate
                            )}
                          </td>
                          {data.isConsolidated && (
                            <td className="py-2.5 px-3 font-medium text-[#636366] whitespace-nowrap">
                              {item.storeName}
                            </td>
                          )}
                          <td className="py-2.5 px-3 font-medium text-[#1C1C1E] max-w-[280px] truncate" title={item.description}>
                            {item.description}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                cfg?.badgeBg || "bg-[#767680]/10 text-[#636366] border-black/5"
                              }`}
                            >
                              {item.costCenterKey === "outros"
                                ? item.category.split(":").pop()?.trim() || item.category
                                : cfg?.label || item.category}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[#8E8E93] max-w-[180px] truncate" title={item.provider}>
                            {item.provider || "-"}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                                item.paid
                                  ? "bg-[#34C759]/12 text-[#248A3D]"
                                  : "bg-[#FF9500]/12 text-[#C93400]"
                              }`}
                            >
                              {item.paid ? "Pago" : "A Pagar"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-[#1C1C1E] tabular-nums whitespace-nowrap">
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

      {/* MODAL MINIMALISTA DE COMPOSIÇÃO DE SAÍDAS DO ALVO (APPLE HIG SHEET & SQUIRCLE 32px) */}
      {selectedDetailTarget && (
        <div className="fixed inset-0 bg-black/35 backdrop-blur-[12px] z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white border border-black/[0.06] rounded-[30px] max-w-2xl w-full max-h-[85vh] flex flex-col shadow-[0_24px_64px_rgba(0,0,0,0.2)] overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-[#E5E5EA] flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div
                  className={`h-10 w-10 rounded-[11px] flex items-center justify-center shadow-xs ${
                    selectedDetailTarget.badgeBg || "bg-[#767680]/10 text-[#1C1C1E]"
                  }`}
                >
                  {selectedDetailTarget.icon ? (
                    React.createElement(selectedDetailTarget.icon, { className: "h-5 w-5" })
                  ) : (
                    <Receipt className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1C1C1E] flex items-center gap-2">
                    Composição de Saídas: {selectedDetailTarget.label}
                  </h3>
                  <p className="text-xs text-[#8E8E93]">
                    Soma passo a passo até o valor final de{" "}
                    <strong className="text-[#1C1C1E] font-bold">
                      {formatBRL(detailTotalVal)}
                    </strong>{" "}
                    ({detailItemsWithCumulative.length} saídas)
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedDetailTarget(null)}
                className="p-1.5 rounded-full text-[#8E8E93] hover:text-[#1C1C1E] hover:bg-[#767680]/10 transition-colors"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content Table */}
            <div className="p-4 overflow-y-auto flex-1">
              {detailItemsWithCumulative.length === 0 ? (
                <div className="text-center py-12 text-[#8E8E93] text-xs">
                  Nenhuma saída encontrada neste período para este item.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#E5E5EA] text-[10px] font-bold uppercase tracking-wider text-[#8E8E93]">
                        <th className="py-2 px-2 text-center w-8">#</th>
                        <th className="py-2 px-2.5">Data</th>
                        <th className="py-2 px-2.5">Descrição</th>
                        <th className="py-2 px-2.5">Fornecedor</th>
                        <th className="py-2 px-2.5 text-right">Saída (R$)</th>
                        <th className="py-2 px-2.5 text-right font-bold text-[#007AFF]">Acumulado (R$)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E5EA]/50">
                      {detailItemsWithCumulative.map((item, idx) => (
                        <tr key={`${item.id}-${idx}`} className="hover:bg-[#F2F2F7]/60">
                          <td className="py-2 px-2 text-center text-[#8E8E93] font-mono text-[10px]">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-2.5 text-[#8E8E93] whitespace-nowrap">
                            {formatDateDisplay(
                              dateType === "competence_date" ? item.competenceDate : item.dueDate
                            )}
                          </td>
                          <td
                            className="py-2 px-2.5 font-medium text-[#1C1C1E] max-w-[200px] truncate"
                            title={item.description}
                          >
                            {item.description}
                          </td>
                          <td
                            className="py-2 px-2.5 text-[#8E8E93] max-w-[130px] truncate"
                            title={item.provider}
                          >
                            {item.provider || "-"}
                          </td>
                          <td className="py-2 px-2.5 text-right font-semibold text-[#1C1C1E] tabular-nums whitespace-nowrap">
                            {formatBRL(item.value)}
                          </td>
                          <td className="py-2 px-2.5 text-right font-extrabold text-[#007AFF] tabular-nums whitespace-nowrap bg-[#007AFF]/5">
                            {formatBRL(item.cumulative)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[#E5E5EA] font-bold bg-[#F2F2F7]/50">
                        <td colSpan={4} className="py-2.5 px-3 text-[#1C1C1E]">
                          Total Final ({detailItemsWithCumulative.length} saídas)
                        </td>
                        <td colSpan={2} className="py-2.5 px-3 text-right text-sm font-extrabold text-[#007AFF] tabular-nums">
                          {formatBRL(detailTotalVal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 bg-[#F2F2F7]/50 border-t border-[#E5E5EA] flex items-center justify-between">
              <span className="text-[11px] text-[#8E8E93]">
                Cada saída acumula progressivamente até atingir o total do centro.
              </span>
              <button
                onClick={() => setSelectedDetailTarget(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded-full bg-[#1C1C1E] hover:bg-[#2C2C2E] text-white transition-colors"
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
