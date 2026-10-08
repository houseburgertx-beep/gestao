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
  gradientBg: string;
  cardBorder: string;
  iconGradient: string;
  barGradient: string;
  barColor: string;
  accentColor: string;
  badgeBg: string;
  defaultIncluded: boolean;
  description: string;
}

const COST_CENTERS_CONFIG: CostCenterConfig[] = [
  {
    key: "cProducao",
    label: "Central de Produção",
    icon: Factory,
    gradientBg: "linear-gradient(180deg, #EFFBF7 0%, #FFFFFF 70%)",
    cardBorder: "border-[#00C7BE]/30",
    iconGradient: "bg-gradient-to-br from-[#00C7BE] to-[#00A39C] text-white shadow-xs border border-white/30",
    barGradient: "linear-gradient(90deg, #00C7BE, #30B0C7)",
    barColor: "#00C7BE",
    accentColor: "#00857D",
    badgeBg: "bg-[#00C7BE]/15 text-[#007A74]",
    defaultIncluded: true,
    description: "Transferências, carnes e pré-preparo da Central",
  },
  {
    key: "mPrima",
    label: "Matéria Prima",
    icon: Beef,
    gradientBg: "linear-gradient(180deg, #F3F2FD 0%, #FFFFFF 70%)",
    cardBorder: "border-[#5856D6]/30",
    iconGradient: "bg-gradient-to-br from-[#5856D6] to-[#4745C7] text-white shadow-xs border border-white/30",
    barGradient: "linear-gradient(90deg, #5856D6, #7A79E4)",
    barColor: "#5856D6",
    accentColor: "#3E3CB0",
    badgeBg: "bg-[#5856D6]/15 text-[#3634A3]",
    defaultIncluded: true,
    description: "Carnes, queijos, bacon, batatas e hortifruti",
  },
  {
    key: "embalagem",
    label: "Embalagem",
    icon: Package,
    gradientBg: "linear-gradient(180deg, #F0F9FE 0%, #FFFFFF 70%)",
    cardBorder: "border-[#32ADE6]/30",
    iconGradient: "bg-gradient-to-br from-[#32ADE6] to-[#1592CB] text-white shadow-xs border border-white/30",
    barGradient: "linear-gradient(90deg, #32ADE6, #5AC8FA)",
    barColor: "#32ADE6",
    accentColor: "#007BA8",
    badgeBg: "bg-[#32ADE6]/15 text-[#0071A4]",
    defaultIncluded: true,
    description: "Caixas, sacolas, copos, potes e descartáveis",
  },
  {
    key: "bebida",
    label: "Bebida",
    icon: Wine,
    gradientBg: "linear-gradient(180deg, #F8F2FC 0%, #FFFFFF 70%)",
    cardBorder: "border-[#AF52DE]/30",
    iconGradient: "bg-gradient-to-br from-[#AF52DE] to-[#993EC8] text-white shadow-xs border border-white/30",
    barGradient: "linear-gradient(90deg, #AF52DE, #BF5AF2)",
    barColor: "#AF52DE",
    accentColor: "#7D1EA8",
    badgeBg: "bg-[#AF52DE]/15 text-[#7325A6]",
    defaultIncluded: true,
    description: "Refrigerantes, cervejas, águas e destilados",
  },
  {
    key: "suco",
    label: "Suco",
    icon: CupSoda,
    gradientBg: "linear-gradient(180deg, #FFF7ED 0%, #FFFFFF 70%)",
    cardBorder: "border-[#FF9500]/30",
    iconGradient: "bg-gradient-to-br from-[#FF9500] to-[#E68200] text-white shadow-xs border border-white/30",
    barGradient: "linear-gradient(90deg, #FF9500, #FFB340)",
    barColor: "#FF9500",
    accentColor: "#B86200",
    badgeBg: "bg-[#FF9500]/15 text-[#B25000]",
    defaultIncluded: false,
    description: "Polpas, concentrados e sucos (opcional)",
  },
  {
    key: "outros",
    label: "Outras Despesas",
    icon: Receipt,
    gradientBg: "linear-gradient(180deg, #FFF1F3 0%, #FFFFFF 70%)",
    cardBorder: "border-[#FF2D55]/30",
    iconGradient: "bg-gradient-to-br from-[#FF2D55] to-[#E61942] text-white shadow-xs border border-white/30",
    barGradient: "linear-gradient(90deg, #FF2D55, #FF6482)",
    barColor: "#FF2D55",
    accentColor: "#C20D32",
    badgeBg: "bg-[#FF2D55]/15 text-[#B80F33]",
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

  // Margem de segurança ou excesso em relação à meta de 35%
  const cmvSafetyMargin = useMemo(() => {
    return Math.round((35 - effectiveCmvPercent) * 100) / 100;
  }, [effectiveCmvPercent]);

  // Distribuição proporcional de cada centro ativo sobre o custo selecionado (Barra de Armazenamento Apple)
  const costDistribution = useMemo(() => {
    if (!data || selectedCostSum <= 0) return [];
    const items: { key: string; label: string; value: number; percent: number; color: string }[] = [];

    COST_CENTERS_CONFIG.forEach((cfg) => {
      let val = 0;
      if (cfg.key === "outros") {
        if (countSelectedOutros > 0) val = selectedOutrosSum;
      } else if (activeCenters[cfg.key]) {
        val = data.summary.costCenters[cfg.key]?.total || 0;
      }

      if (val > 0) {
        items.push({
          key: cfg.key,
          label: cfg.label,
          value: val,
          percent: (val / selectedCostSum) * 100,
          color: cfg.barColor,
        });
      }
    });

    return items;
  }, [data, selectedCostSum, activeCenters, countSelectedOutros, selectedOutrosSum]);

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
        color: "text-[#6B7280] bg-white/80 border-black/10",
      };
    if (pct < 35)
      return {
        label: "Meta Batida (< 35%)",
        color: "text-[#0A563C] bg-white/95 border-[#34C759]/40 shadow-xs",
      };
    if (pct <= 40)
      return {
        label: "Atenção (35% - 40%)",
        color: "text-[#881414] bg-white/95 border-[#FF3B30]/40 shadow-xs",
      };
    return {
      label: "Crítico (> 40%)",
      color: "text-[#881414] bg-white/95 border-[#FF3B30]/40 shadow-xs",
    };
  };

  // Tema do Card de CMV (Verde suave Apple Health se < 35%, vermelho suave se >= 35%)
  const getCmvCardTheme = (pct: number) => {
    if (pct === 0) {
      return {
        bg: "linear-gradient(145deg, #F9FAFB 0%, #FFFFFF 100%)",
        border: "border-black/[0.08]",
        numberColor: "text-[#111827]",
        labelColor: "text-[#6B7280]",
        subColor: "text-[#9CA3AF]",
        badgeBg: "bg-white text-[#6B7280] border-black/10 shadow-xs",
        iconGradient: "bg-gradient-to-br from-[#9CA3AF] to-[#6B7280] text-white shadow-xs border border-white/40",
        boxShadow:
          "0 1px 2px rgba(0,0,0,0.03), 0 8px 24px -4px rgba(15, 23, 42, 0.07), inset 0 1px 0 rgba(255, 255, 255, 1)",
      };
    }
    // BOM: Verde suave Apple Health (< 35%)
    if (pct < 35) {
      return {
        bg: "linear-gradient(145deg, #EBF8F2 0%, #DFFAED 60%, #EEFAF4 100%)",
        border: "border-[#34C759]/35",
        numberColor: "text-[#0A563C]",
        labelColor: "text-[#0E6245]",
        subColor: "text-[#127050]",
        badgeBg: "bg-white/95 text-[#0A563C] border-[#34C759]/35 shadow-xs",
        iconGradient: "bg-[#34C759] text-white shadow-xs border border-white/40",
        boxShadow:
          "0 1px 2px rgba(0,0,0,0.03), 0 8px 24px -4px rgba(15, 23, 42, 0.07), inset 0 1px 0 rgba(255, 255, 255, 0.95)",
      };
    }
    // RUIM: Vermelho suave Apple Health (>= 35%)
    return {
      bg: "linear-gradient(145deg, #FDEEEC 0%, #FCE4E2 60%, #FDF0EE 100%)",
      border: "border-[#FF3B30]/35",
      numberColor: "text-[#881414]",
      labelColor: "text-[#9B1C1C]",
      subColor: "text-[#B91C1C]",
      badgeBg: "bg-white/95 text-[#881414] border-[#FF3B30]/35 shadow-xs",
      iconGradient: "bg-[#FF3B30] text-white shadow-xs border border-white/40",
      boxShadow:
        "0 1px 2px rgba(0,0,0,0.03), 0 8px 24px -4px rgba(15, 23, 42, 0.07), inset 0 1px 0 rgba(255, 255, 255, 0.95)",
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
    <div className="max-w-7xl mx-auto space-y-8 select-none animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-black/[0.08]">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-[12px] bg-gradient-to-br from-[#1C1C1E] to-[#2C2C2E] text-white flex items-center justify-center font-black text-base shadow-sm border border-black/10">
              %
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-[#111827]">
                CMV · Custo de Mercadoria Vendida
              </h1>
              <p className="text-xs text-[#6B7280] font-medium mt-0.5">
                Auditoria executiva 100% precisa com controle granular de centros e desdobramento de saídas.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-white hover:bg-[#F9FAFB] text-[#374151] border border-black/[0.08] shadow-xs transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[#4B5563] ${loading ? "animate-spin" : ""}`} />
            Recalcular
          </button>

          <button
            onClick={handleCopyWhatsApp}
            disabled={!data || loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-[#E8F8F0] hover:bg-[#DCF5E7] text-[#0E7A4A] border border-[#34C759]/30 shadow-xs active:scale-95 transition-all disabled:opacity-50"
            title="Copiar relatório formatado para o WhatsApp"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-[#34C759]" />
                <span>Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 text-[#0E7A4A]" />
                <span>Copiar WhatsApp</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Apple iOS Control Bar: Seletor de Loja + Seletor de Período + Regime de Data (Compacto e Unificado) */}
      <div className="ios-widget p-4 sm:p-5 rounded-[24px] space-y-3.5">
        {/* Linha 1: Segmented Control de Unidades */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-[#007AFF]" />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#4B5563]">
              Unidade da Rede
            </span>
          </div>

          {/* Segmented Control Oficial Apple com visual tátil */}
          <div className="bg-[#E2E4EB] p-1 rounded-xl flex flex-wrap gap-1 border border-black/[0.04]">
            {STORE_TABS.map((tab) => {
              const isSelected = selectedUnit === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedUnit(tab.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs transition-all duration-200 whitespace-nowrap ${
                    isSelected
                      ? "bg-white text-[#111827] font-bold shadow-[0_2px_6px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.04)] -translate-y-0.5"
                      : "text-[#4B5563] hover:text-[#111827] hover:bg-white/60 font-semibold"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Linha 2: Presets Rápidos + Datas Exatas + Regime em Grid Compacto */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-3 border-t border-black/[0.06] items-center">
          {/* Presets Rápidos Segmented Control */}
          <div className="md:col-span-5 flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] flex items-center gap-1">
              <Calendar className="h-3 w-3 text-[#007AFF]" />
              Período Rápido
            </label>
            <div className="bg-[#E2E4EB] p-1 rounded-xl flex gap-1 border border-black/[0.04]">
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
                  className="flex-1 py-1 px-2 rounded-lg text-xs font-semibold text-[#4B5563] hover:text-[#111827] hover:bg-white/70 transition-all text-center"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Datas Início e Fim com input cápsula estilizado */}
          <div className="md:col-span-4 grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-1 block">
                Início
              </label>
              <div className="flex items-center gap-1.5 h-8.5 px-2.5 rounded-lg bg-white border border-[#D1D5DB] shadow-xs focus-within:ring-2 focus-within:ring-[#007AFF] focus-within:border-[#007AFF] transition-all">
                <Calendar className="h-3 w-3 text-[#007AFF] shrink-0" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full text-xs font-bold text-[#111827] bg-transparent outline-none cursor-pointer"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280] mb-1 block">
                Fim
              </label>
              <div className="flex items-center gap-1.5 h-8.5 px-2.5 rounded-lg bg-white border border-[#D1D5DB] shadow-xs focus-within:ring-2 focus-within:ring-[#007AFF] focus-within:border-[#007AFF] transition-all">
                <Calendar className="h-3 w-3 text-[#007AFF] shrink-0" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full text-xs font-bold text-[#111827] bg-transparent outline-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Regime Segmented Control */}
          <div className="md:col-span-3 flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
              Regime de Data
            </label>
            <div className="bg-[#E2E4EB] p-1 rounded-xl flex gap-1 border border-black/[0.04]">
              <button
                type="button"
                onClick={() => setDateType("due_date")}
                className={`flex-1 py-1 px-2.5 rounded-lg text-xs font-bold transition-all ${
                  dateType === "due_date"
                    ? "bg-white text-[#111827] shadow-[0_2px_4px_rgba(0,0,0,0.1)]"
                    : "text-[#4B5563] hover:text-[#111827]"
                }`}
              >
                Vencimento
              </button>
              <button
                type="button"
                onClick={() => setDateType("competence_date")}
                className={`flex-1 py-1 px-2.5 rounded-lg text-xs font-bold transition-all ${
                  dateType === "competence_date"
                    ? "bg-white text-[#111827] shadow-[0_2px_4px_rgba(0,0,0,0.1)]"
                    : "text-[#4B5563] hover:text-[#111827]"
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
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-center gap-3 text-red-700 text-xs shadow-xs">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
          <span className="font-semibold">{error}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="h-44 rounded-[26px] bg-white animate-pulse shadow-sm" />
          <div className="h-44 rounded-[26px] bg-white animate-pulse shadow-sm" />
          <div className="h-44 rounded-[26px] bg-white animate-pulse shadow-sm" />
        </div>
      )}

      {/* Conteúdo Principal */}
      {data && (
        <>
          {/* CARDS PRINCIPAIS DE KPI (TOPO) */}
          {(() => {
            const cmvTheme = getCmvCardTheme(effectiveCmvPercent);
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Card 1: CMV Realizado (Verde suave Apple se bom <35%, vermelho suave se >=35%) */}
                <div
                  className={`p-6 sm:p-7 rounded-[26px] border ${cmvTheme.border} transition-all duration-300 hover:-translate-y-1 relative overflow-hidden flex flex-col justify-between min-h-[195px]`}
                  style={{ background: cmvTheme.bg, boxShadow: cmvTheme.boxShadow }}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`h-11 w-11 rounded-[14px] ${cmvTheme.iconGradient} flex items-center justify-center shrink-0`}>
                          <TrendingDown className="h-5 w-5" />
                        </div>
                        <div>
                          <span className={`text-xs font-extrabold uppercase tracking-wider ${cmvTheme.labelColor} block`}>
                            CMV Realizado
                          </span>
                          <span className={`text-[11px] ${cmvTheme.subColor} font-semibold`}>
                            Meta Máxima: 35%
                          </span>
                        </div>
                      </div>
                      <span className={`text-xs font-black px-3 py-1 rounded-full border ${cmvTheme.badgeBg}`}>
                        {getCmvStatus(effectiveCmvPercent).label}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2 my-2">
                      <span className={`text-5xl lg:text-6xl font-black ${cmvTheme.numberColor} tracking-tight tabular-nums`}>
                        {formatPercent(effectiveCmvPercent)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-black/[0.05] flex items-center justify-between gap-2">
                    <p className={`text-xs ${cmvTheme.subColor} font-semibold truncate`}>
                      {effectiveCmvPercent === 0 ? (
                        <span>Aguardando dados da Takeat</span>
                      ) : effectiveCmvPercent < 35 ? (
                        <span>● Folga de <strong className="underline">{cmvSafetyMargin.toFixed(2).replace(".", ",")}%</strong> até o teto de 35%</span>
                      ) : (
                        <span>⚠️ Excesso de <strong className="underline">+{Math.abs(cmvSafetyMargin).toFixed(2).replace(".", ",")}%</strong> acima da meta</span>
                      )}
                    </p>
                    <span className={`text-[11px] ${cmvTheme.subColor} font-medium shrink-0`}>
                      {activeCenterLabels.length} centros
                    </span>
                  </div>
                </div>

                {/* Card 2: Total de Custos Selecionados + Barra de Distribuição Apple Storage */}
                <div
                  className="p-6 sm:p-7 rounded-[26px] border border-[#007AFF]/20 transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between min-h-[195px]"
                  style={{
                    background: "linear-gradient(145deg, #F5F8FD 0%, #EEF4FB 50%, #F7FAFE 100%)",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03), 0 8px 24px -4px rgba(15, 23, 42, 0.07), inset 0 1px 0 rgba(255, 255, 255, 0.95)",
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-[14px] bg-[#007AFF] text-white flex items-center justify-center shrink-0 shadow-xs border border-white/30">
                          <DollarSign className="h-5 w-5" />
                        </div>
                        <div>
                          <span className="text-xs font-extrabold uppercase tracking-wider text-[#4B6B94] block">
                            Total de Custos
                          </span>
                          <span className="text-[11px] text-[#6B8BAE] font-semibold">
                            Soma Ativa
                          </span>
                        </div>
                      </div>
                      <span className="text-xs px-3 py-1 rounded-full bg-white/95 text-[#0056B3] font-bold border border-[#007AFF]/25 shadow-xs">
                        {activeCenterLabels.length} centros ativos
                      </span>
                    </div>

                    <div className="text-4xl lg:text-5xl font-black text-[#0F2942] tracking-tight tabular-nums my-2">
                      {formatBRL(selectedCostSum)}
                    </div>
                  </div>

                  {/* Barra de Distribuição iOS (estilo Armazenamento do iPhone) */}
                  <div className="space-y-1.5 pt-2 border-t border-black/[0.05]">
                    <div className="h-2 w-full bg-black/[0.06] rounded-full overflow-hidden flex gap-0.5 p-0.5">
                      {costDistribution.length > 0 ? (
                        costDistribution.map((item, idx) => (
                          <div
                            key={idx}
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${item.percent}%`, backgroundColor: item.color }}
                            title={`${item.label}: ${item.percent.toFixed(1)}% (${formatBRL(item.value)})`}
                          />
                        ))
                      ) : (
                        <div className="h-full w-full bg-gray-200 rounded-full" />
                      )}
                    </div>

                    {/* Micro-legenda da Barra de Distribuição */}
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-[#4B6B94] font-medium">
                      {costDistribution.slice(0, 3).map((item, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="font-semibold text-[#1E3A5F]">{item.label}</span>
                          <span>{item.percent.toFixed(0)}%</span>
                        </span>
                      ))}
                      {costDistribution.length > 3 && (
                        <span className="text-[#6B8BAE]">+{costDistribution.length - 3}</span>
                      )}
                      {costDistribution.length === 0 && (
                        <span className="text-[#6B8BAE]">Nenhum lançamento ativo</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card 3: Faturamento da Loja */}
                <div
                  className="p-6 sm:p-7 rounded-[26px] border border-[#10B981]/20 transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between min-h-[195px]"
                  style={{
                    background: "linear-gradient(145deg, #F3FAF6 0%, #E9F7F0 50%, #F5FBF8 100%)",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03), 0 8px 24px -4px rgba(15, 23, 42, 0.07), inset 0 1px 0 rgba(255, 255, 255, 0.95)",
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-[14px] bg-[#10B981] text-white flex items-center justify-center shrink-0 shadow-xs border border-white/30">
                          <TrendingUp className="h-5 w-5" />
                        </div>
                        <div>
                          <span className="text-xs font-extrabold uppercase tracking-wider text-[#3D7A65] block">
                            Faturamento da Loja
                          </span>
                          <span className="text-[11px] text-[#55927D] font-semibold">
                            Receita Base
                          </span>
                        </div>
                      </div>
                      {!isEditingFat ? (
                        <button
                          onClick={() => {
                            setManualFaturamento(String(data.summary.faturamento));
                            setIsEditingFat(true);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs text-[#065F46] hover:bg-emerald-50 bg-white/95 border border-[#10B981]/25 px-3 py-1 rounded-full font-bold shadow-xs transition-all active:scale-95"
                          title="Ajustar faturamento manualmente"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>Ajustar</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setManualFaturamento("");
                            setIsEditingFat(false);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs text-[#6B7280] hover:text-[#111827] bg-white px-3 py-1 rounded-full font-bold shadow-xs transition-all"
                          title="Restaurar valor oficial automático"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Restaurar</span>
                        </button>
                      )}
                    </div>

                    {!isEditingFat ? (
                      <div className="text-4xl lg:text-5xl font-black text-[#064E3B] tracking-tight tabular-nums my-2">
                        {formatBRL(effectiveFaturamento)}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 my-2">
                        <span className="text-2xl font-black text-[#3D7A65]">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={manualFaturamento}
                          onChange={(e) => setManualFaturamento(e.target.value)}
                          className="w-full text-2xl font-black px-4 py-1.5 rounded-xl bg-white border border-[#10B981]/40 text-[#064E3B] shadow-inner focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                          placeholder="Valor exato..."
                          autoFocus
                        />
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-[#3D7A65] font-medium pt-2 border-t border-black/[0.05]">
                    {manualFaturamento
                      ? "⚠️ Ajustado manualmente (recalculando CMV em tempo real)."
                      : "Receita oficial registrada na Takeat no período."}
                  </p>
                </div>
              </div>
            );
          })()}

          {/* COMPOSIÇÃO UNIFICADA DOS CENTROS DE CUSTO (SEM DUPLICAÇÃO DE DADOS) */}
          <div className="ios-widget p-6 sm:p-7 rounded-[28px] space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <SlidersHorizontal className="h-5 w-5 text-[#007AFF]" />
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#111827]">
                    Centros de Custo & Composição do CMV
                  </h3>
                  <p className="text-xs text-[#6B7280]">
                    Clique em qualquer card para incluir/remover da soma ou use o olhinho para auditar saídas.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={resetToStandardCmv}
                  className="px-3.5 py-1.5 rounded-full text-xs font-bold text-[#007AFF] bg-[#007AFF]/10 hover:bg-[#007AFF]/20 transition-all shadow-xs"
                >
                  Padrão (4 Centros)
                </button>
                <span className="text-black/15 font-bold">|</span>
                <button
                  onClick={selectAllCenters}
                  className="px-3.5 py-1.5 rounded-full text-xs font-bold text-[#4B5563] hover:text-[#111827] hover:bg-black/5 transition-all shadow-xs"
                >
                  Selecionar Todos
                </button>
              </div>
            </div>

            {/* Grid dos 6 Centros de Custo com design Apple tátil e elegante */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4.5">
              {COST_CENTERS_CONFIG.map((cfg) => {
                const isOutros = cfg.key === "outros";
                const isActive = isOutros ? countSelectedOutros > 0 : activeCenters[cfg.key];
                const center = data.summary.costCenters[cfg.key];
                const totalVal = center?.total || 0;
                const countItems = center?.items?.length || 0;
                const displayedVal = isOutros && countSelectedOutros > 0 ? selectedOutrosSum : totalVal;
                const pct = effectiveFaturamento > 0 ? (displayedVal / effectiveFaturamento) * 100 : 0;
                const costPct = selectedCostSum > 0 ? (displayedVal / selectedCostSum) * 100 : 0;
                const Icon = cfg.icon;

                return (
                  <div
                    key={cfg.key}
                    onClick={() => {
                      if (!isOutros) toggleCenter(cfg.key);
                    }}
                    className={`p-5 rounded-[22px] border transition-all duration-300 ${
                      !isOutros ? "cursor-pointer" : ""
                    } ${
                      isActive
                        ? `${cfg.cardBorder} hover:-translate-y-1`
                        : "bg-[#F9FAFB] border-black/[0.06] opacity-65 hover:opacity-100 hover:bg-white"
                    }`}
                    style={
                      isActive
                        ? {
                            background: cfg.gradientBg,
                            boxShadow:
                              "0 1px 2px rgba(0,0,0,0.02), 0 8px 20px -3px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,1)",
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-11 w-11 rounded-[13px] flex items-center justify-center shrink-0 ${cfg.iconGradient}`}>
                          <Icon className="h-5.5 w-5.5" />
                        </div>
                        <div>
                          <span className="text-sm font-extrabold text-[#111827] block leading-snug">
                            {cfg.label}
                          </span>
                          <span className="text-[11px] text-[#6B7280] font-medium">
                            {countItems} lançamento{countItems === 1 ? "" : "s"}
                            {isOutros && ` (${outrosSubcategories.length} subcats)`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {/* Olhinho minimalista circular */}
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
                          className="h-8 w-8 rounded-full bg-white/95 hover:bg-white text-[#6B7280] hover:text-[#111827] shadow-xs border border-black/[0.06] flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                          title={`Auditar saídas de ${cfg.label}`}
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        {/* Botão de Inclusão no CMV */}
                        {isOutros ? (
                          <button
                            type="button"
                            onClick={() => setShowOutrosBreakdown((prev) => !prev)}
                            className="text-xs font-bold px-3 py-1.5 rounded-full bg-gradient-to-r from-[#FF2D55] to-[#E11D48] text-white shadow-xs transition-all flex items-center gap-1 active:scale-95"
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            <span>{countSelectedOutros > 0 ? `${countSelectedOutros} ativas` : "Escolher"}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleCenter(cfg.key)}
                            className={`text-xs font-bold px-3 py-1.5 rounded-full transition-all flex items-center gap-1 active:scale-95 ${
                              isActive
                                ? "bg-[#34C759] text-white shadow-xs"
                                : "bg-white hover:bg-black/5 text-[#6B7280] hover:text-[#111827] border border-black/10 shadow-xs"
                            }`}
                          >
                            {isActive ? "✓ Na soma" : "+ Incluir"}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-baseline justify-between mt-3 mb-2">
                      <div>
                        <span className="text-2xl font-black text-[#111827] tabular-nums tracking-tight">
                          {formatBRL(displayedVal)}
                        </span>
                        {isOutros && countSelectedOutros > 0 && (
                          <span className="text-[11px] text-[#6B7280] block font-medium">
                            de {formatBRL(totalVal)} totais
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold bg-white/90 border border-black/[0.06] shadow-xs text-[#1F2937] px-2 py-0.5 rounded-full tabular-nums" title="% do Faturamento total">
                          {formatPercent(pct)}
                        </span>
                        {isActive && costPct > 0 && (
                          <span className="text-[10px] font-semibold text-[#6B7280] bg-black/[0.04] px-1.5 py-0.5 rounded-full tabular-nums" title="% do custo selecionado">
                            {costPct.toFixed(0)}% custo
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="w-full bg-black/[0.06] h-1.5 rounded-full overflow-hidden p-0.5">
                      <div
                        className="h-full rounded-full transition-all duration-700 shadow-xs"
                        style={{
                          background: cfg.barGradient,
                          width: `${Math.min(pct, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Painel de Desdobramento de Outras Despesas (Retrátil com alto padrão) */}
            {outrosSubcategories.length > 0 && showOutrosBreakdown && (
              <div className="mt-6 p-6 rounded-[24px] bg-white border border-[#FF2D55]/20 shadow-[0_4px_20px_rgba(255,45,85,0.06)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="h-8 w-8 rounded-[10px] bg-gradient-to-br from-[#FF2D55] to-[#D9153C] text-white flex items-center justify-center shadow-xs">
                      <Receipt className="h-4 w-4" />
                    </span>
                    <div>
                      <span className="text-xs font-extrabold text-[#111827] block">
                        Desdobramento de Outras Despesas: Escolha quais entram na soma
                      </span>
                      <span className="text-[11px] text-[#6B7280] font-medium">
                        {countSelectedOutros} de {outrosSubcategories.length} selecionadas · Total ativo: <strong className="text-[#FF2D55]">{formatBRL(selectedOutrosSum)}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={selectAllOutros}
                      className="px-3.5 py-1.5 rounded-full bg-[#FF2D55]/10 text-[#FF2D55] hover:bg-[#FF2D55]/20 font-bold transition-colors"
                    >
                      Marcar Todas
                    </button>
                    <span className="text-black/15 font-bold">|</span>
                    <button
                      type="button"
                      onClick={deselectAllOutros}
                      className="px-3.5 py-1.5 rounded-full text-[#6B7280] hover:text-[#111827] hover:bg-black/5 transition-colors font-semibold"
                    >
                      Desmarcar Todas
                    </button>
                  </div>
                </div>

                {/* Grid das subcategorias reais */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {outrosSubcategories.map((sub) => {
                    const isChecked = !!selectedOutrosSubcategories[sub.rawCategory];

                    return (
                      <div
                        key={sub.rawCategory}
                        className={`flex items-center justify-between p-3 rounded-[16px] border text-xs transition-all duration-200 ${
                          isChecked
                            ? "bg-[#FFF5F7] border-[#FF2D55]/30 shadow-xs text-[#111827]"
                            : "bg-white/60 border-black/5 text-[#6B7280] opacity-75 hover:opacity-100"
                        }`}
                      >
                        <label className="flex items-center gap-2.5 cursor-pointer flex-1 truncate mr-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleOutrosSubcategory(sub.rawCategory)}
                            className="rounded text-[#FF2D55] focus:ring-[#FF2D55] accent-[#FF2D55] h-4 w-4 cursor-pointer"
                          />
                          <span className="font-bold truncate text-xs" title={sub.rawCategory}>
                            {sub.label}
                          </span>
                        </label>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-black text-xs text-[#111827] tabular-nums">
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
                            className="h-7 w-7 rounded-full bg-white hover:bg-white text-[#6B7280] hover:text-[#111827] shadow-xs border border-black/[0.04] flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                            title={`Ver saídas de ${sub.label} até ${formatBRL(sub.total)}`}
                          >
                            <Eye className="h-3.5 w-3.5" />
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
            <div className="ios-widget p-7 rounded-[28px] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Building2 className="h-5 w-5 text-[#007AFF]" />
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#111827]">
                    Comparativo por Unidade da Rede (Recalculado Dinamicamente)
                  </h3>
                </div>
                <span className="text-xs px-3.5 py-1 rounded-full bg-[#E2E4EB] text-[#374151] font-bold self-start sm:self-auto">
                  Base: {activeCenterLabels.join(", ")}
                </span>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-black/[0.06]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#D1D5DB] text-xs font-bold uppercase tracking-wider text-[#4B5563] bg-black/[0.02]">
                      <th className="py-3 px-3.5">Loja</th>
                      <th className="py-3 px-3.5">Faturamento</th>
                      <th className="py-3 px-3.5">C. Produção</th>
                      <th className="py-3 px-3.5">M. Prima</th>
                      <th className="py-3 px-3.5">Embalagem</th>
                      <th className="py-3 px-3.5">Bebida</th>
                      {activeCenters.suco && <th className="py-3 px-3.5">Suco</th>}
                      {countSelectedOutros > 0 && <th className="py-3 px-3.5">Outras Sel.</th>}
                      <th className="py-3 px-3.5">Total Selecionado</th>
                      <th className="py-3 px-3.5 text-right">CMV (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.05]">
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
                        <tr key={st.storeId} className="hover:bg-black/[0.02] transition-colors">
                          <td className="py-3 px-3.5 font-bold text-[#111827]">
                            {st.storeName}
                          </td>
                          <td className="py-3 px-3.5 text-[#059669] font-black tabular-nums">
                            {formatBRL(st.faturamento)}
                          </td>
                          <td className="py-3 px-3.5 text-[#4B5563] font-semibold tabular-nums">
                            {formatBRL(st.costCenters.cProducao?.total || 0)}
                          </td>
                          <td className="py-3 px-3.5 text-[#4B5563] font-semibold tabular-nums">
                            {formatBRL(st.costCenters.mPrima?.total || 0)}
                          </td>
                          <td className="py-3 px-3.5 text-[#4B5563] font-semibold tabular-nums">
                            {formatBRL(st.costCenters.embalagem?.total || 0)}
                          </td>
                          <td className="py-3 px-3.5 text-[#4B5563] font-semibold tabular-nums">
                            {formatBRL(st.costCenters.bebida?.total || 0)}
                          </td>
                          {activeCenters.suco && (
                            <td className="py-3 px-3.5 text-[#4B5563] font-semibold tabular-nums">
                              {formatBRL(st.costCenters.suco?.total || 0)}
                            </td>
                          )}
                          {countSelectedOutros > 0 && (
                            <td className="py-3 px-3.5 text-[#FF2D55] font-black tabular-nums">
                              {formatBRL(storeOutrosSel)}
                            </td>
                          )}
                          <td className="py-3 px-3.5 font-black text-[#111827] tabular-nums">
                            {formatBRL(storeSum)}
                          </td>
                          <td className="py-3 px-3.5 text-right whitespace-nowrap">
                            <span
                              className={`text-xs font-black px-3 py-1 rounded-full border shadow-xs ${
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
          <div className="ios-widget p-7 rounded-[28px] space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <Eye className="h-5 w-5 text-[#007AFF]" />
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#111827]">
                    Auditoria de Lançamentos Takeat
                  </h3>
                  <span className="text-xs px-3.5 py-1 rounded-full bg-[#E2E4EB] text-[#374151] font-bold">
                    {allFilteredItems.length} lançamentos · {formatBRL(tableFilteredTotal)}
                  </span>
                </div>
                <p className="text-xs text-[#6B7280] font-medium mt-1">
                  Exibição detalhada de cada gasto, nota ou compra registrada no sistema.
                </p>
              </div>

              {/* Controles de Filtro e Busca com Formato Pílula Apple */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Busca rápida */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
                  <input
                    type="text"
                    placeholder="Buscar por descrição, fornecedor..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-10 pl-9.5 pr-4 rounded-xl text-xs bg-white border border-[#D1D5DB] text-[#111827] font-semibold focus:ring-2 focus:ring-[#007AFF] shadow-xs w-52 sm:w-68 transition-all focus:outline-none"
                  />
                </div>

                {/* Seletor de Categoria/Centro */}
                <select
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                  className="h-10 px-3.5 rounded-xl text-xs bg-white border border-[#D1D5DB] text-[#111827] font-semibold focus:ring-2 focus:ring-[#007AFF] shadow-xs transition-all cursor-pointer focus:outline-none"
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
                  className="h-10 px-3.5 rounded-xl text-xs bg-white border border-[#D1D5DB] text-[#111827] font-semibold focus:ring-2 focus:ring-[#007AFF] shadow-xs transition-all cursor-pointer focus:outline-none"
                >
                  <option value="all">Status: Todos</option>
                  <option value="paid">Pagos</option>
                  <option value="pending">A Pagar</option>
                </select>
              </div>
            </div>

            {allFilteredItems.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-black/15 rounded-[22px] text-[#6B7280] text-xs font-medium">
                Nenhum lançamento encontrado para os filtros selecionados.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-black/[0.06]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#D1D5DB] text-xs font-bold uppercase tracking-wider text-[#4B5563] bg-black/[0.02]">
                      <th className="py-3 px-3.5">Data</th>
                      {data.isConsolidated && <th className="py-3 px-3.5">Loja</th>}
                      <th className="py-3 px-3.5">Descrição</th>
                      <th className="py-3 px-3.5">Centro de Custo</th>
                      <th className="py-3 px-3.5">Fornecedor</th>
                      <th className="py-3 px-3.5">Status</th>
                      <th className="py-3 px-3.5 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.05]">
                    {allFilteredItems.map((item, idx) => {
                      const cfg = COST_CENTERS_CONFIG.find(
                        (c) => c.key === item.costCenterKey
                      );

                      return (
                        <tr
                          key={`${item.id}-${idx}`}
                          className="hover:bg-black/[0.02] transition-colors"
                        >
                          <td className="py-3 px-3.5 text-[#6B7280] font-semibold whitespace-nowrap">
                            {formatDateDisplay(
                              dateType === "competence_date"
                                ? item.competenceDate
                                : item.dueDate
                            )}
                          </td>
                          {data.isConsolidated && (
                            <td className="py-3 px-3.5 font-bold text-[#4B5563] whitespace-nowrap">
                              {item.storeName}
                            </td>
                          )}
                          <td className="py-3 px-3.5 font-bold text-[#111827] max-w-[280px] truncate" title={item.description}>
                            {item.description}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <span
                              className={`text-xs font-bold px-3 py-1 rounded-full border shadow-xs ${
                                cfg?.badgeBg || "bg-[#E2E4EB] text-[#4B5563] border-black/5"
                              }`}
                            >
                              {item.costCenterKey === "outros"
                                ? item.category.split(":").pop()?.trim() || item.category
                                : cfg?.label || item.category}
                            </span>
                          </td>
                          <td className="py-3 px-3.5 text-[#6B7280] font-medium max-w-[180px] truncate" title={item.provider}>
                            {item.provider || "-"}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <span
                              className={`text-xs font-black px-3 py-1 rounded-full shadow-xs ${
                                item.paid
                                  ? "bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC]"
                                  : "bg-[#FFEDD5] text-[#C2410C] border border-[#FDBA74]"
                              }`}
                            >
                              {item.paid ? "Pago" : "A Pagar"}
                            </span>
                          </td>
                          <td className="py-3 px-3.5 text-right font-black text-[#111827] tabular-nums whitespace-nowrap text-sm">
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
