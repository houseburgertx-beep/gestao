"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useUnit } from "@/contexts/UnitContext";
import { store } from "@/services/store";
import { ReceivedNfe, ReceivedNfeItem } from "@/types/takeat";
import { UnitId } from "@/types";
import {
  FileText,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  Plus,
  Receipt,
  Building2,
  Calendar,
  DollarSign,
  Package,
  Eye,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export default function NfeRecebidaPage() {
  const { currentUnit } = useUnit();

  const [selectedUnit, setSelectedUnit] = useState<UnitId>(currentUnit || "all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "imported">("all");
  const [docTypeFilter, setDocTypeFilter] = useState<"all" | "entrada" | "manifesto">("all");
  const [manifestFilter, setManifestFilter] = useState<"all" | "ciencia" | "confirmacao" | "desconhecimento" | "nao_realizada">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [nfes, setNfes] = useState<ReceivedNfe[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Modais
  const [selectedNfeDetails, setSelectedNfeDetails] = useState<ReceivedNfe | null>(null);
  const [importingNfe, setImportingNfe] = useState<ReceivedNfe | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  // Form de Importacao para Contas a Pagar
  const [importDueDate, setImportDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().substring(0, 10);
  });
  const [importCategory, setImportCategory] = useState("Insumos e Alimentos");
  const [importCostCenter, setImportCostCenter] = useState("Cozinha / Producao");
  const [importPaymentMethod, setImportPaymentMethod] = useState<"boleto" | "pix" | "transferencia">("boleto");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form de Nova NF-e Manual / Simulacao
  const [manualForm, setManualForm] = useState({
    unitId: "teixeira" as Exclude<UnitId, "all">,
    numero: "",
    serie: "1",
    chave: "",
    fornecedorNome: "",
    fornecedorCnpj: "",
    destinatarioCnpj: "",
    dataEmissao: new Date().toISOString().substring(0, 10),
    valorTotal: "",
    tipoDocumento: "manifesto" as "entrada" | "manifesto",
    manifestationType: "ciencia" as "ciencia" | "confirmacao" | "desconhecimento" | "nao_realizada",
  });

  const loadNfes = () => {
    const stored = store.getReceivedNfes();
    setNfes(stored);
  };

  useEffect(() => {
    loadNfes();
    const handleSyncEvent = () => handleSyncAll();
    window.addEventListener("sync-takeat-nfe", handleSyncEvent);
    return () => window.removeEventListener("sync-takeat-nfe", handleSyncEvent);
  }, []);

  useEffect(() => {
    if (currentUnit) {
      setSelectedUnit(currentUnit);
    }
  }, [currentUnit]);

  // Filtro de Período (Padrão: Esse mês)
  const [datePreset, setDatePreset] = useState<
    "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "this_year" | "custom"
  >("this_month");
  
  // Datas calculadas
  const getPresetRange = (preset: string) => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === "today") {
      const todayStr = toYmd(now);
      return { start: todayStr, end: todayStr, label: "Hoje" };
    }
    if (preset === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = toYmd(y);
      return { start: yStr, end: yStr, label: "Ontem" };
    }
    if (preset === "this_week") {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day; // Domingo
      const sunday = new Date(d.setDate(diff));
      return { start: toYmd(sunday), end: toYmd(now), label: "Essa semana" };
    }
    if (preset === "last_week") {
      const d = new Date(now);
      const day = d.getDay();
      const lastSunday = new Date(d.setDate(d.getDate() - day - 7));
      const lastSaturday = new Date(new Date(lastSunday).setDate(lastSunday.getDate() + 6));
      return { start: toYmd(lastSunday), end: toYmd(lastSaturday), label: "Semana anterior" };
    }
    if (preset === "last_month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: toYmd(firstDay), end: toYmd(lastDay), label: "Mês anterior" };
    }
    if (preset === "this_year") {
      const firstDay = new Date(now.getFullYear(), 0, 1);
      return { start: toYmd(firstDay), end: toYmd(now), label: "Esse ano" };
    }
    // Padrão: this_month
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: toYmd(firstDay), end: toYmd(now), label: "Esse mês" };
  };

  const [dateRange, setDateRange] = useState(() => getPresetRange("this_month"));
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Filtros aplicados
  const filteredNfes = useMemo(() => {
    return nfes.filter((n) => {
      if (selectedUnit !== "all" && n.unitId !== selectedUnit) return false;
      if (statusFilter === "pending" && n.importedToPayable) return false;
      if (statusFilter === "imported" && !n.importedToPayable) return false;
      if (docTypeFilter !== "all") {
        const isManifest = n.tipoDocumento === "manifesto" || n.manifestationType === "ciencia" || n.manifestationType === "nao_realizada" || n.manifestationType === "desconhecimento";
        if (docTypeFilter === "manifesto" && !isManifest) return false;
        if (docTypeFilter === "entrada" && isManifest) return false;
      }
      if (manifestFilter !== "all" && n.manifestationType !== manifestFilter) return false;
      
      // Filtro de Data de Emissão
      if (dateRange.start && n.dataEmissao < dateRange.start) return false;
      if (dateRange.end && n.dataEmissao > dateRange.end) return false;

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchFornecedor = n.fornecedorNome?.toLowerCase().includes(q);
        const matchCnpj = n.fornecedorCnpj?.includes(q);
        const matchDestCnpj = n.destinatarioCnpj?.includes(q);
        const matchNum = n.numero?.includes(q);
        const matchChave = n.chave?.includes(q);
        if (!matchFornecedor && !matchCnpj && !matchDestCnpj && !matchNum && !matchChave) return false;
      }
      return true;
    });
  }, [nfes, selectedUnit, statusFilter, docTypeFilter, manifestFilter, dateRange, searchTerm]);

  // Totais
  const stats = useMemo(() => {
    const totalCount = filteredNfes.length;
    const totalValue = filteredNfes.reduce((acc, curr) => acc + (curr.valorTotal || 0), 0);
    const manifestoCount = filteredNfes.filter((n) => n.tipoDocumento === "manifesto" || n.manifestationType === "ciencia" || n.manifestationType === "nao_realizada").length;
    const entradaCount = filteredNfes.filter((n) => n.tipoDocumento === "entrada" || n.manifestationType === "confirmacao").length;
    const pendingCount = filteredNfes.filter((n) => !n.importedToPayable).length;
    const importedCount = filteredNfes.filter((n) => n.importedToPayable).length;

    return { totalCount, totalValue, manifestoCount, entradaCount, pendingCount, importedCount };
  }, [filteredNfes]);

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSyncAll = async () => {
    setSyncing(true);
    setSyncMessage(null);

    const unitsToSync: Exclude<UnitId, "all">[] =
      selectedUnit === "all" ? ["teixeira", "eunapolis", "foodpark"] : [selectedUnit as Exclude<UnitId, "all">];

    let totalSynced = 0;
    const errors: string[] = [];

    for (const u of unitsToSync) {
      const res = await store.syncTakeatNfes(u, undefined, dateRange.start, dateRange.end);
      if (res.success) {
        totalSynced += res.count;
      } else if (res.error) {
        errors.push(`${u}: ${res.error}`);
      }
    }

    loadNfes();
    setSyncing(false);

    if (errors.length === unitsToSync.length) {
      setSyncMessage({
        text: `Takeat: ${errors[0] || "Credenciais não cadastradas"}. Informe usuário e senha de acesso.`,
        type: "error",
      });
    } else if (totalSynced > 0) {
      setSyncMessage({
        text: `${totalSynced} nota(s) fiscal(is) sincronizada(s) com sucesso!`,
        type: "success",
      });
    } else {
      setSyncMessage({
        text: "Sincronização concluída. Nenhuma nova nota fiscal de entrada foi encontrada no momento.",
        type: "success",
      });
    }

    setTimeout(() => setSyncMessage(null), 6000);
  };

  const handleConfirmImport = () => {
    if (!importingNfe) return;

    const parts = importingNfe.dataEmissao.split("-");
    const competence = parts.length === 3 ? `${parts[1]}/${parts[0]}` : "09/2026";

    const created = store.addAccount({
      unitId: importingNfe.unitId,
      companyCnpj: "",
      supplierId: `sup-${Date.now()}`,
      supplierName: importingNfe.fornecedorNome,
      supplierCnpjCpf: importingNfe.fornecedorCnpj,
      description: `NF-e ${importingNfe.numero} - ${importingNfe.fornecedorNome}`,
      category: importCategory,
      costCenter: importCostCenter,
      competence,
      issueDate: importingNfe.dataEmissao,
      dueDate: importDueDate,
      amount: importingNfe.valorTotal,
      interest: 0,
      penalty: 0,
      discount: 0,
      paymentMethod: importPaymentMethod,
      status: "pending_approval",
      responsibleUser: "Gestor (NF-e Takeat)",
      invoiceNumber: importingNfe.numero,
      nfeKey: importingNfe.chave,
      nfeId: importingNfe.id,
      notes: `Importado da NF-e nº ${importingNfe.numero}, chave ${importingNfe.chave}`,
    });

    const payableId = created[0]?.id || `acc-${Date.now()}`;
    store.markNfeAsImported(importingNfe.id, payableId);

    setImportingNfe(null);
    loadNfes();
    setSyncMessage({
      text: `NF-e nº ${importingNfe.numero} lançada com sucesso no Contas a Pagar!`,
      type: "success",
    });
    setTimeout(() => setSyncMessage(null), 5000);
  };

  const handleSaveManualNfe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.fornecedorNome || !manualForm.numero || !manualForm.valorTotal) {
      alert("Por favor, preencha Fornecedor, Número da NF e Valor Total.");
      return;
    }

    const val = parseFloat(manualForm.valorTotal.replace(/\./g, "").replace(",", ".")) || 0;
    const newNfe: ReceivedNfe = {
      id: `manual-${Date.now()}`,
      unitId: manualForm.unitId,
      numero: manualForm.numero,
      serie: manualForm.serie || "1",
      chave: manualForm.chave || `3526${Date.now()}550010000000011`,
      fornecedorNome: manualForm.fornecedorNome,
      fornecedorCnpj: manualForm.fornecedorCnpj,
      destinatarioCnpj: manualForm.destinatarioCnpj,
      dataEmissao: manualForm.dataEmissao,
      valorTotal: val,
      status: "autorizada",
      tipoDocumento: manualForm.tipoDocumento,
      manifestationType: manualForm.manifestationType,
      source: "manual",
      syncedAt: new Date().toISOString(),
    };

    store.saveReceivedNfe(newNfe);
    setIsManualModalOpen(false);
    loadNfes();
    setSyncMessage({
      text: `NF-e nº ${newNfe.numero} adicionada com sucesso!`,
      type: "success",
    });
    setTimeout(() => setSyncMessage(null), 5000);
  };

  const unitLabels: Record<string, string> = {
    all: "Todas as Lojas",
    teixeira: "Teixeira de Freitas",
    eunapolis: "Eunápolis",
    foodpark: "House Foodpark",
    central: "Central de Produção",
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6">
      {/* Header com titulo e acoes */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 text-sm font-semibold mb-1">
            <Receipt size={18} />
            <span>Fiscal & Compras (Takeat API V1.0)</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Notas Fiscais Recebidas (NF-e)
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Monitoramento de notas de compras e insumos emitidas contra os CNPJs das suas 3 unidades.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsManualModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            <span>Cadastrar / Simular NF-e</span>
          </button>

          <button
            onClick={handleSyncAll}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm"
          >
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            <span>{syncing ? "Sincronizando Takeat..." : "Sincronizar Notas Takeat"}</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {syncMessage && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 border ${
            syncMessage.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800"
              : "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800"
          }`}
        >
          {syncMessage.type === "success" ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="text-sm font-medium">{syncMessage.text}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <span className="text-xs font-semibold uppercase text-zinc-400 tracking-wider">Total de Notas</span>
          <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2">
            {stats.totalCount} <span className="text-xs font-normal text-zinc-500">notas</span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Todas as notas localizadas</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <span className="text-xs font-semibold uppercase text-indigo-500 tracking-wider">Do Manifesto (CNPJ)</span>
          <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-2">
            {stats.manifestoCount} <span className="text-xs font-normal text-zinc-500">notas</span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Emitidas contra seu CNPJ (SEFAZ)</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <span className="text-xs font-semibold uppercase text-blue-500 tracking-wider">Confirmadas / Entrada</span>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">
            {stats.entradaCount} <span className="text-xs font-normal text-zinc-500">notas</span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Com manifestação confirmada</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <span className="text-xs font-semibold uppercase text-zinc-400 tracking-wider">Valor Total</span>
          <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-2 text-rose-600 dark:text-rose-400">
            R$ {stats.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Soma do valor bruto das notas</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <span className="text-xs font-semibold uppercase text-emerald-500 tracking-wider">Lançadas / Financeiro</span>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
            {stats.importedCount} <span className="text-xs font-normal text-zinc-500">notas</span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Integradas no Contas a Pagar</p>
        </div>
      </div>

      {/* Filtros e Seletor de Período */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Loja */}
          <div className="flex items-center gap-2">
            <Building2 size={15} className="text-zinc-400" />
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value as UnitId)}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="all">Todas as Lojas</option>
              <option value="teixeira">Teixeira de Freitas</option>
              <option value="eunapolis">Eunápolis</option>
              <option value="foodpark">House Foodpark</option>
            </select>
          </div>

          {/* Seletor Minimalista de Período (Estilo Dropdown Popover) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700/60 text-xs font-medium text-zinc-800 dark:text-zinc-200 transition-colors"
            >
              <Calendar size={14} className="text-rose-500" />
              <span>{dateRange.label}:</span>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                {dateRange.start ? `${dateRange.start.split("-").reverse().join("/")} a ${dateRange.end.split("-").reverse().join("/")}` : "Todo o período"}
              </span>
              <span className="text-[10px] text-zinc-400">▼</span>
            </button>

            {isDatePickerOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setIsDatePickerOpen(false)}
                />
                <div className="absolute left-0 top-full mt-1.5 z-40 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-3 w-80 text-xs animate-in fade-in zoom-in-95 duration-100">
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100 pb-2 mb-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                    <span>Selecionar Período</span>
                    <span className="text-[11px] font-normal text-zinc-400">Takeat / SEFAZ</span>
                  </div>

                  {/* Atalhos Rápidos no estilo solicitado */}
                  <div className="grid grid-cols-2 gap-1 mb-3">
                    {[
                      { id: "today", label: "Hoje" },
                      { id: "yesterday", label: "Ontem" },
                      { id: "this_week", label: "Essa semana" },
                      { id: "last_week", label: "Semana anterior" },
                      { id: "this_month", label: "Esse mês" },
                      { id: "last_month", label: "Mês anterior" },
                      { id: "this_year", label: "Esse ano" },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setDatePreset(preset.id as any);
                          setDateRange(getPresetRange(preset.id));
                          setIsDatePickerOpen(false);
                        }}
                        className={`text-left px-2.5 py-1.5 rounded-lg transition-colors font-medium text-xs ${
                          datePreset === preset.id
                            ? "bg-rose-500 text-white font-semibold"
                            : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Intervalo Personalizado */}
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                    <span className="text-[11px] font-medium text-zinc-400 block">Personalizado</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-0.5">Início</label>
                        <input
                          type="date"
                          value={dateRange.start}
                          onChange={(e) => {
                            setDatePreset("custom");
                            setDateRange((prev) => ({ ...prev, start: e.target.value, label: "Personalizado" }));
                          }}
                          className="w-full px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-[11px] text-zinc-800 dark:text-zinc-200"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-0.5">Fim</label>
                        <input
                          type="date"
                          value={dateRange.end}
                          onChange={(e) => {
                            setDatePreset("custom");
                            setDateRange((prev) => ({ ...prev, end: e.target.value, label: "Personalizado" }));
                          }}
                          className="w-full px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-[11px] text-zinc-800 dark:text-zinc-200"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDatePickerOpen(false)}
                      className="w-full mt-2 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold text-xs transition-colors"
                    >
                      Aplicar Período
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Filtro de Tipo: Entrada vs Manifesto */}
          <div className="flex items-center gap-1.5">
            <Filter size={15} className="text-zinc-400" />
            <select
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value as any)}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="all">Todos os Tipos</option>
              <option value="manifesto">📑 Do Manifesto (CNPJ)</option>
              <option value="entrada">📥 Entrada Confirmada</option>
            </select>
          </div>

          {/* Filtro de Status de Lançamento */}
          <div className="flex items-center gap-1.5">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="all">Status Financeiro (Todos)</option>
              <option value="pending">Pendentes</option>
              <option value="imported">Lançadas</option>
            </select>
          </div>
        </div>

        {/* Campo de Busca */}
        <div className="relative w-full xl:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar fornecedor, CNPJ, NF-e..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>
      </div>

      {/* Tabela de Notas Fiscais - Compacta e Responsiva sem Estouro Lateral */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        {filteredNfes.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-500 flex items-center justify-center mx-auto mb-4">
              <FileText size={32} />
            </div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Nenhuma nota fiscal encontrada no período selecionado
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto mt-1">
              Altere o filtro de datas ou clique em sincronizar para buscar notas fiscais emitidas contra o CNPJ da sua loja.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                onClick={handleSyncAll}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium transition-colors"
              >
                Sincronizar com a Takeat
              </button>
              <button
                onClick={() => setIsManualModalOpen(true)}
                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Cadastrar Nota Manualmente
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-3">Loja</th>
                  <th className="py-3 px-3">Emissão</th>
                  <th className="py-3 px-3">NF-e</th>
                  <th className="py-3 px-3">Fornecedor (Emitente)</th>
                  <th className="py-3 px-3">Valor</th>
                  <th className="py-3 px-3">Tipo / Manifesto</th>
                  <th className="py-3 px-3">Financeiro</th>
                  <th className="py-3 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredNfes.map((nfe) => (
                  <tr
                    key={nfe.id}
                    className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    {/* Coluna Loja */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                        {unitLabels[nfe.unitId]?.replace(" de Freitas", "").replace("House ", "") || nfe.unitId}
                      </span>
                    </td>

                    {/* Coluna Emissão */}
                    <td className="py-2.5 px-3 whitespace-nowrap text-zinc-600 dark:text-zinc-300 font-mono text-[11px]">
                      {nfe.dataEmissao}
                    </td>

                    {/* Coluna NF-e */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        Nº {nfe.numero}
                      </div>
                      <div className="text-[10px] text-zinc-400">Série {nfe.serie || "1"}</div>
                    </td>

                    {/* Coluna Fornecedor */}
                    <td className="py-2.5 px-3 max-w-[200px]">
                      <div
                        className="font-medium text-zinc-900 dark:text-zinc-100 truncate"
                        title={nfe.fornecedorNome}
                      >
                        {nfe.fornecedorNome}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono truncate">
                        {nfe.fornecedorCnpj || "Sem CNPJ"}
                      </div>
                    </td>

                    {/* Coluna Valor */}
                    <td className="py-2.5 px-3 whitespace-nowrap font-bold text-zinc-900 dark:text-zinc-100">
                      R$ {nfe.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>

                    {/* Coluna Tipo / Manifesto */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {nfe.manifestationType === "confirmacao" || nfe.tipoDocumento === "entrada" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          📥 Entrada
                        </span>
                      ) : nfe.manifestationType === "ciencia" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          📑 Manifesto (Ciência)
                        </span>
                      ) : nfe.manifestationType === "desconhecimento" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          ⚠️ Desconhecida
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          📑 Manifesto
                        </span>
                      )}
                    </td>

                    {/* Coluna No Financeiro */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {nfe.importedToPayable ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200">
                          <CheckCircle2 size={11} />
                          Lançada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
                          <Clock size={11} />
                          Pendente
                        </span>
                      )}
                    </td>

                    {/* Coluna Ações */}
                    <td className="py-2.5 px-3 whitespace-nowrap text-right space-x-1.5">
                      <button
                        onClick={() => setSelectedNfeDetails(nfe)}
                        title="Ver detalhes da NF-e"
                        className="p-1 rounded-md text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <Eye size={15} />
                      </button>

                      {!nfe.importedToPayable ? (
                        <button
                          onClick={() => {
                            setImportingNfe(nfe);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-medium transition-colors shadow-sm"
                        >
                          <span>Lançar</span>
                          <ArrowRight size={11} />
                        </button>
                      ) : (
                        <span className="text-[10px] text-zinc-400 italic">Conciliada</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Detalhes da Nota Fiscal */}
      {selectedNfeDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
                  <FileText size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    NF-e nº {selectedNfeDetails.numero} (Série {selectedNfeDetails.serie || "1"})
                  </h3>
                  <p className="text-xs text-zinc-500">Emitida em {selectedNfeDetails.dataEmissao}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedNfeDetails(null)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-xl">
                <div>
                  <span className="text-xs text-zinc-400 block">Fornecedor / Emitente</span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {selectedNfeDetails.fornecedorNome}
                  </span>
                  <span className="text-xs text-zinc-500 block font-mono mt-0.5">
                    CNPJ: {selectedNfeDetails.fornecedorCnpj || "Não informado"}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-zinc-400 block">Destinatário (Sua Empresa)</span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {unitLabels[selectedNfeDetails.unitId]}
                  </span>
                  <span className="text-xs text-zinc-500 block font-mono mt-0.5">
                    CNPJ: {selectedNfeDetails.destinatarioCnpj || "Vinculado à unidade"}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-zinc-400 block">Situação no Manifesto</span>
                  <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 block">
                    {selectedNfeDetails.manifestationType === "confirmacao"
                      ? "Confirmação da Operação"
                      : selectedNfeDetails.manifestationType === "ciencia"
                      ? "Ciência da Emissão"
                      : selectedNfeDetails.manifestationType === "desconhecimento"
                      ? "Desconhecimento da Operação"
                      : "Pendente de Manifestação"}
                  </span>
                  <span className="text-xs text-zinc-500 block mt-0.5">
                    Origem: {selectedNfeDetails.source}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-xs text-zinc-400 block mb-1">Chave de Acesso (44 dígitos)</span>
                <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 p-2.5 rounded-xl text-xs font-mono text-zinc-700 dark:text-zinc-300 break-all">
                  <span className="flex-1">{selectedNfeDetails.chave || "Chave não disponível"}</span>
                  {selectedNfeDetails.chave && (
                    <button
                      onClick={() => handleCopyKey(selectedNfeDetails.chave)}
                      className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-zinc-700 text-zinc-500"
                      title="Copiar Chave"
                    >
                      {copiedKey === selectedNfeDetails.chave ? (
                        <Check size={14} className="text-emerald-500" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3 flex items-center justify-between">
                <div>
                  <span className="text-xs text-zinc-400 block">Valor Total da Nota</span>
                  <span className="text-xl font-extrabold text-rose-600 dark:text-rose-400">
                    R$ {selectedNfeDetails.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {!selectedNfeDetails.importedToPayable && (
                  <button
                    onClick={() => {
                      const target = selectedNfeDetails;
                      setSelectedNfeDetails(null);
                      setImportingNfe(target);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium transition-colors shadow-sm"
                  >
                    Importar para Contas a Pagar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Importacao para Contas a Pagar */}
      {importingNfe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Lançar NF-e no Contas a Pagar
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Cria automaticamente uma despesa no financeiro vinculada à nota fiscal nº {importingNfe.numero}.
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-rose-50 dark:bg-rose-950/30 p-3.5 rounded-xl border border-rose-100 dark:border-rose-900/50">
                <div className="text-xs text-rose-700 dark:text-rose-300 font-semibold uppercase">Dados da Nota</div>
                <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                  {importingNfe.fornecedorNome}
                </div>
                <div className="text-lg font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">
                  R$ {importingNfe.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Data de Vencimento
                </label>
                <input
                  type="date"
                  value={importDueDate}
                  onChange={(e) => setImportDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Categoria Contábil
                </label>
                <select
                  value={importCategory}
                  onChange={(e) => setImportCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                >
                  <option value="Insumos e Alimentos">Insumos e Alimentos (Carnes, Queijos, Pães)</option>
                  <option value="Embalagens">Embalagens & Delivery</option>
                  <option value="Bebidas">Bebidas</option>
                  <option value="Material de Limpeza">Material de Limpeza / Higiene</option>
                  <option value="Manutenção e Reformas">Manutenção e Reformas</option>
                  <option value="Outros Fornecedores">Outros Fornecedores</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Centro de Custo
                </label>
                <select
                  value={importCostCenter}
                  onChange={(e) => setImportCostCenter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                >
                  <option value="Cozinha / Produção">Cozinha / Produção</option>
                  <option value="Salão / Atendimento">Salão / Atendimento</option>
                  <option value="Delivery">Delivery</option>
                  <option value="Administrativo">Administrativo</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Forma de Pagamento Prevista
                </label>
                <select
                  value={importPaymentMethod}
                  onChange={(e) => setImportPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                >
                  <option value="boleto">Boleto Bancário</option>
                  <option value="pix">PIX</option>
                  <option value="transferencia">Transferência / TED</option>
                </select>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-end gap-3">
              <button
                onClick={() => setImportingNfe(null)}
                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmImport}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium shadow-sm"
              >
                Confirmar Lançamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Cadastrar NF-e Manual / Simulacao */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Cadastrar NF-e Recebida
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Insira uma nota fiscal de compra manualmente para testes ou conferência.
              </p>
            </div>

            <form onSubmit={handleSaveManualNfe}>
              <div className="p-6 space-y-3.5">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    Loja Destino
                  </label>
                  <select
                    value={manualForm.unitId}
                    onChange={(e) => setManualForm({ ...manualForm, unitId: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                  >
                    <option value="teixeira">Teixeira de Freitas</option>
                    <option value="eunapolis">Eunápolis</option>
                    <option value="foodpark">House Foodpark</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                      Número da NF *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 12450"
                      value={manualForm.numero}
                      onChange={(e) => setManualForm({ ...manualForm, numero: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                      Série
                    </label>
                    <input
                      type="text"
                      placeholder="1"
                      value={manualForm.serie}
                      onChange={(e) => setManualForm({ ...manualForm, serie: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    Fornecedor (Razão Social) *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Frigorífico Central Ltda"
                    value={manualForm.fornecedorNome}
                    onChange={(e) => setManualForm({ ...manualForm, fornecedorNome: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                      CNPJ Fornecedor
                    </label>
                    <input
                      type="text"
                      placeholder="00.000.000/0000-00"
                      value={manualForm.fornecedorCnpj}
                      onChange={(e) => setManualForm({ ...manualForm, fornecedorCnpj: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                      CNPJ Destinatário (Sua Loja)
                    </label>
                    <input
                      type="text"
                      placeholder="00.000.000/0000-00"
                      value={manualForm.destinatarioCnpj}
                      onChange={(e) => setManualForm({ ...manualForm, destinatarioCnpj: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                      Origem / Tipo de Documento
                    </label>
                    <select
                      value={manualForm.tipoDocumento}
                      onChange={(e) => setManualForm({ ...manualForm, tipoDocumento: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                    >
                      <option value="manifesto">📑 Do Manifesto (Emitida no CNPJ)</option>
                      <option value="entrada">📥 Entrada Confirmada</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                      Data de Emissão
                    </label>
                    <input
                      type="date"
                      value={manualForm.dataEmissao}
                      onChange={(e) => setManualForm({ ...manualForm, dataEmissao: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                      Valor Total (R$) *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 1.450,00"
                      value={manualForm.valorTotal}
                      onChange={(e) => setManualForm({ ...manualForm, valorTotal: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-semibold"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                      Status no Manifesto
                    </label>
                    <select
                      value={manualForm.manifestationType}
                      onChange={(e) => setManualForm({ ...manualForm, manifestationType: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                    >
                      <option value="ciencia">Ciência da Emissão</option>
                      <option value="confirmacao">Confirmação da Operação</option>
                      <option value="nao_realizada">Pendente de Manifestação</option>
                      <option value="desconhecimento">Desconhecimento</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                    Chave de Acesso (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="44 dígitos numéricos"
                    value={manualForm.chave}
                    onChange={(e) => setManualForm({ ...manualForm, chave: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium shadow-sm"
                >
                  Salvar Nota Fiscal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
