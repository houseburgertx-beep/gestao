"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  DollarSign,
  Filter,
  Search,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Building,
  Calendar,
  AlertCircle,
  Layers,
  ShieldCheck,
  Download,
} from "lucide-react";
import { useUnit } from "@/contexts/UnitContext";
import { store } from "@/services/store";
import { AccountPayable, AccountStatus } from "@/types";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { QuickCreateModal } from "@/components/layout/QuickCreateModal";
import { downloadFileFromDrive, uploadFileToDrive } from "@/services/driveService";

function FinanceiroContent() {
  const { filterByUnit } = useUnit();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"contas" | "pagamentos" | "parcelamentos" | "aprovacoes">("contas");
  const [, setTick] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Selection & Drawers
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
  const [approvalComment, setApprovalComment] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);

  useEffect(() => {
    const handleUpdate = () => setTick((t) => t + 1);
    window.addEventListener("house190_data_updated", handleUpdate);
    return () => window.removeEventListener("house190_data_updated", handleUpdate);
  }, []);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "aprovacoes") setActiveTab("aprovacoes");
    const id = searchParams.get("id");
    if (id) setSelectedAccountId(id);
  }, [searchParams]);

  const allAccounts = filterByUnit(store.getAccounts());

  // Metrics
  const payToday = allAccounts.filter((a) => a.dueDate === "2026-09-07" && a.status !== "paid");
  const payTodayTotal = payToday.reduce((acc, cur) => acc + cur.finalAmount, 0);

  const next7Days = allAccounts.filter(
    (a) => a.dueDate >= "2026-09-07" && a.dueDate <= "2026-09-14" && a.status !== "paid"
  );
  const next7DaysTotal = next7Days.reduce((acc, cur) => acc + cur.finalAmount, 0);

  const overdue = allAccounts.filter((a) => a.status === "overdue");
  const overdueTotal = overdue.reduce((acc, cur) => acc + cur.finalAmount, 0);

  const totalMonth = allAccounts
    .filter((a) => a.status !== "canceled")
    .reduce((acc, cur) => acc + cur.finalAmount, 0);

  // Filtered List for Table
  const filteredAccounts = allAccounts.filter((acc) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchDesc = acc.description.toLowerCase().includes(q);
      const matchSup = acc.supplierName.toLowerCase().includes(q);
      if (!matchDesc && !matchSup) return false;
    }
    if (statusFilter !== "all" && acc.status !== statusFilter) return false;
    if (categoryFilter !== "all" && acc.category !== categoryFilter) return false;
    return true;
  });

  const selectedAccount = allAccounts.find((a) => a.id === selectedAccountId);

  // Actions
  const handleApprove = (id: string) => {
    store.approveAccount(id, "Diretoria", approvalComment);
    setApprovalComment("");
    if (selectedAccountId === id) setSelectedAccountId(null);
  };

  const handleReject = (id: string) => {
    if (!rejectReason) return;
    store.rejectAccount(id, "Diretoria", rejectReason);
    setRejectReason("");
    if (selectedAccountId === id) setSelectedAccountId(null);
  };

  const handlePay = async (id: string) => {
    setSavingPayment(true);
    try {
      const storedProof = paymentProofFile
        ? await uploadFileToDrive(paymentProofFile, "payment_proofs")
        : null;
      store.payAccount(
        id,
        "Banco do Brasil (Conta Principal)",
        storedProof?.fileName,
        storedProof?.fileId
      );
      setPaymentProofFile(null);
      if (selectedAccountId === id) setSelectedAccountId(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível salvar o comprovante.");
    } finally {
      setSavingPayment(false);
    }
  };

  const handleBatchPay = () => {
    if (batchSelectedIds.length === 0) return;
    store.batchPay(batchSelectedIds, "Banco do Brasil (Conta Principal)");
    setBatchSelectedIds([]);
  };

  const toggleSelectBatch = (id: string) => {
    setBatchSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/60 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Contas a Pagar & Financeiro
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Gestão de despesas, conciliação, parcelamentos e fluxo de aprovação
          </p>
        </div>
        <Button size="sm" onClick={() => setIsQuickCreateOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          <span>Novo Lançamento</span>
        </Button>
      </div>

      {/* Top Executive Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-lg border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            A Pagar Hoje
          </div>
          <div className="mt-1 text-xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
            {formatCurrency(payTodayTotal)}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {payToday.length} contas programadas
          </div>
        </div>

        <div className="p-4 rounded-lg border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Próximos 7 Dias
          </div>
          <div className="mt-1 text-xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
            {formatCurrency(next7DaysTotal)}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {next7Days.length} contas a vencer
          </div>
        </div>

        <div className="p-4 rounded-lg border border-rose-200/60 bg-rose-50/30 dark:bg-rose-950/20 dark:border-rose-900/40">
          <div className="text-[11px] font-semibold text-rose-600 uppercase tracking-wider">
            Vencidas
          </div>
          <div className="mt-1 text-xl font-semibold text-rose-700 tabular-nums dark:text-rose-400">
            {formatCurrency(overdueTotal)}
          </div>
          <div className="mt-0.5 text-[11px] text-rose-600/80">
            {overdue.length} contas em atraso
          </div>
        </div>

        <div className="p-4 rounded-lg border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Total no Mês (Setembro)
          </div>
          <div className="mt-1 text-xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
            {formatCurrency(totalMonth)}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {allAccounts.length} lançamentos totais
          </div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 gap-6">
        {[
          { key: "contas", label: "Todas as Contas", count: allAccounts.length },
          {
            key: "aprovacoes",
            label: "Aprovações",
            count: allAccounts.filter((a) => a.status === "pending_approval").length,
          },
          {
            key: "pagamentos",
            label: "Central de Pagamentos",
            count: allAccounts.filter((a) => a.status !== "paid" && a.status !== "canceled").length,
          },
          {
            key: "parcelamentos",
            label: "Parcelamentos",
            count: allAccounts.filter((a) => a.installmentGroupId).length,
          },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            className={`flex items-center gap-2 pb-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            <span>{t.label}</span>
            {t.count > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  t.key === "aprovacoes" && t.count > 0
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: Todas as Contas */}
      {activeTab === "contas" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Filtrar por descrição ou fornecedor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8.5 pl-8.5 pr-3 text-xs rounded-md border border-zinc-200 bg-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8.5 px-2.5 text-xs rounded-md border border-zinc-200 bg-white text-zinc-700 focus:outline-none dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300"
              >
                <option value="all">Todos os Status</option>
                <option value="pending_approval">Aguardando Aprovação</option>
                <option value="approved">Aprovado</option>
                <option value="scheduled">Agendado</option>
                <option value="paid">Pago</option>
                <option value="overdue">Vencido</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-8.5 px-2.5 text-xs rounded-md border border-zinc-200 bg-white text-zinc-700 focus:outline-none dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300"
              >
                <option value="all">Todas as Categorias</option>
                <option value="Matéria-prima">Matéria-prima</option>
                <option value="Embalagens">Embalagens</option>
                <option value="Utilidades">Utilidades</option>
                <option value="Marketing">Marketing</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-lg border border-zinc-200/80 bg-white overflow-hidden shadow-2xs dark:bg-zinc-900 dark:border-zinc-800">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-400 font-semibold uppercase tracking-wider text-[10px] dark:bg-zinc-800/60 dark:border-zinc-800">
                  <tr>
                    <th className="py-3 px-4">Descrição</th>
                    <th className="py-3 px-4">Fornecedor</th>
                    <th className="py-3 px-4">Unidade</th>
                    <th className="py-3 px-4">Vencimento</th>
                    <th className="py-3 px-4">Categoria</th>
                    <th className="py-3 px-4 text-right">Valor Final</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4">Responsável</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                  {filteredAccounts.map((acc) => (
                    <tr
                      key={acc.id}
                      onClick={() => setSelectedAccountId(acc.id)}
                      className="hover:bg-zinc-50/80 cursor-pointer transition-colors dark:hover:bg-zinc-800/50"
                    >
                      <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                        <div className="flex items-center gap-1.5">
                          <span>{acc.description}</span>
                          {acc.installmentNumber && (
                            <span className="text-[10px] px-1 py-0.2 rounded bg-zinc-100 text-zinc-500 font-mono dark:bg-zinc-800">
                              {acc.installmentNumber}/{acc.totalInstallments}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                        {acc.supplierName}
                      </td>
                      <td className="py-3 px-4 uppercase text-[10px] font-mono text-zinc-500">
                        {acc.unitId}
                      </td>
                      <td className="py-3 px-4 tabular-nums font-medium">
                        {formatDate(acc.dueDate)}
                      </td>
                      <td className="py-3 px-4 text-zinc-500">
                        {acc.category}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(acc.finalAmount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <StatusBadge status={acc.status} />
                      </td>
                      <td className="py-3 px-4 text-zinc-500">
                        {acc.responsibleUser}
                      </td>
                    </tr>
                  ))}

                  {filteredAccounts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-zinc-400">
                        Nenhuma conta encontrada com os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Aprovações */}
      {activeTab === "aprovacoes" && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-600 dark:bg-zinc-800/40 dark:border-zinc-700 dark:text-zinc-300 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-zinc-700 dark:text-zinc-300 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                Alçadas de Aprovação House 190
              </div>
              <p className="mt-0.5">
                Até R$ 1.000 (aprovação automática/responsável financeiro) • R$ 1.000 a R$ 10.000 (gestor da unidade) • Acima de R$ 10.000 (aprovação diretiva).
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200/80 bg-white overflow-hidden shadow-2xs dark:bg-zinc-900 dark:border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-400 font-semibold uppercase tracking-wider text-[10px] dark:bg-zinc-800/60 dark:border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Fornecedor</th>
                  <th className="py-3 px-4">Descrição / Motivo</th>
                  <th className="py-3 px-4">Unidade</th>
                  <th className="py-3 px-4">Vencimento</th>
                  <th className="py-3 px-4">Solicitante</th>
                  <th className="py-3 px-4">Alçada Requerida</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {allAccounts
                  .filter((a) => a.status === "pending_approval")
                  .map((acc) => (
                    <tr key={acc.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50">
                      <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-zinc-100">
                        {acc.supplierName}
                      </td>
                      <td className="py-3 px-4 text-zinc-700 dark:text-zinc-300">
                        {acc.description}
                      </td>
                      <td className="py-3 px-4 uppercase text-[10px] font-mono text-zinc-500">
                        {acc.unitId}
                      </td>
                      <td className="py-3 px-4 tabular-nums">
                        {formatDate(acc.dueDate)}
                      </td>
                      <td className="py-3 px-4 text-zinc-500">
                        {acc.responsibleUser}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={acc.approvalTier === "director" ? "warning" : "secondary"}>
                          {acc.approvalTier === "director" ? "Diretoria (> R$ 10k)" : "Gestor"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(acc.finalAmount)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleApprove(acc.id)}
                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                          >
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedAccountId(acc.id)}
                            className="h-7 text-xs"
                          >
                            Detalhar / Recusar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}

                {allAccounts.filter((a) => a.status === "pending_approval").length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-zinc-400">
                      Nenhum pagamento aguardando aprovação no momento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Central de Pagamentos */}
      {activeTab === "pagamentos" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-zinc-500">
              Selecione múltiplos pagamentos para baixar em lote manualmente com comprovante.
            </div>
            {batchSelectedIds.length > 0 && (
              <Button size="sm" onClick={handleBatchPay} className="gap-2">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Liquidar Selecionados ({batchSelectedIds.length})</span>
              </Button>
            )}
          </div>

          <div className="rounded-lg border border-zinc-200/80 bg-white overflow-hidden shadow-2xs dark:bg-zinc-900 dark:border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-400 font-semibold uppercase tracking-wider text-[10px] dark:bg-zinc-800/60 dark:border-zinc-800">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBatchSelectedIds(
                            allAccounts
                              .filter((a) => a.status !== "paid" && a.status !== "canceled")
                              .map((a) => a.id)
                          );
                        } else {
                          setBatchSelectedIds([]);
                        }
                      }}
                      checked={
                        batchSelectedIds.length > 0 &&
                        batchSelectedIds.length ===
                          allAccounts.filter((a) => a.status !== "paid" && a.status !== "canceled").length
                      }
                    />
                  </th>
                  <th className="py-3 px-4">Vencimento</th>
                  <th className="py-3 px-4">Fornecedor</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Método</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {allAccounts
                  .filter((a) => a.status !== "paid" && a.status !== "canceled")
                  .map((acc) => (
                    <tr key={acc.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50">
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={batchSelectedIds.includes(acc.id)}
                          onChange={() => toggleSelectBatch(acc.id)}
                        />
                      </td>
                      <td className="py-3 px-4 tabular-nums font-semibold">
                        {formatDate(acc.dueDate)}
                      </td>
                      <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                        {acc.supplierName}
                      </td>
                      <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                        {acc.description}
                      </td>
                      <td className="py-3 px-4 uppercase text-[10px] font-mono text-zinc-500">
                        {acc.paymentMethod}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(acc.finalAmount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <StatusBadge status={acc.status} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePay(acc.id)}
                          className="h-7 text-xs"
                        >
                          Baixar Pagamento
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Parcelamentos */}
      {activeTab === "parcelamentos" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allAccounts
              .filter((a) => a.installmentGroupId && a.installmentNumber === 1)
              .map((mainInstallment) => {
                const groupItems = allAccounts.filter(
                  (a) => a.installmentGroupId === mainInstallment.installmentGroupId
                );
                const totalGroupAmount = groupItems.reduce((acc, cur) => acc + cur.finalAmount, 0);
                const paidCount = groupItems.filter((a) => a.status === "paid").length;

                return (
                  <div
                    key={mainInstallment.installmentGroupId}
                    className="p-5 rounded-lg border border-zinc-200/80 bg-white space-y-3 dark:bg-zinc-900 dark:border-zinc-800"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {mainInstallment.description}
                        </span>
                        <div className="text-[11px] text-zinc-500">
                          {mainInstallment.supplierName} • {groupItems.length} parcelas
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {formatCurrency(totalGroupAmount)}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] text-zinc-500">
                        <span>Progresso de Quitação</span>
                        <span>
                          {paidCount} de {groupItems.length} pagas
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden dark:bg-zinc-800">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{
                            width: `${(paidCount / groupItems.length) * 100}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-1">
                      {groupItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between text-xs py-1"
                        >
                          <span className="font-mono text-[11px] text-zinc-500">
                            Parcela {item.installmentNumber}/{item.totalInstallments}
                          </span>
                          <span className="text-zinc-600 dark:text-zinc-400">
                            Venc: {formatDate(item.dueDate)}
                          </span>
                          <span className="font-mono font-medium">
                            {formatCurrency(item.finalAmount)}
                          </span>
                          <StatusBadge status={item.status} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Account Details Side Drawer */}
      <Drawer
        isOpen={!!selectedAccount}
        onClose={() => setSelectedAccountId(null)}
        title={selectedAccount?.description || "Detalhes do Lançamento"}
        subtitle={`ID: ${selectedAccount?.id} • Unidade: ${selectedAccount?.unitId.toUpperCase()}`}
        width="lg"
        footer={
          selectedAccount && (
            <div className="flex items-center justify-between w-full">
              <div>
                {selectedAccount.status === "pending_approval" && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleReject(selectedAccount.id)}
                  >
                    Recusar
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {selectedAccount.status === "pending_approval" && (
                  <Button
                    size="sm"
                    onClick={() => handleApprove(selectedAccount.id)}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    Aprovar Pagamento
                  </Button>
                )}
                {selectedAccount.status !== "paid" && (
                  <Button size="sm" onClick={() => handlePay(selectedAccount.id)} disabled={savingPayment}>
                    {savingPayment ? "Salvando..." : "Registrar Baixa"}
                  </Button>
                )}
              </div>
            </div>
          )
        }
      >
        {selectedAccount && (
          <div className="space-y-6">
            {/* Main Details Grid */}
            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800">
              <div>
                <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                  Fornecedor
                </span>
                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedAccount.supplierName}
                </p>
                {selectedAccount.supplierCnpjCpf && (
                  <p className="text-[11px] text-zinc-500 font-mono">
                    {selectedAccount.supplierCnpjCpf}
                  </p>
                )}
              </div>

              <div>
                <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                  Valor Final
                </span>
                <p className="text-base font-mono font-bold text-zinc-900 dark:text-zinc-100">
                  {formatCurrency(selectedAccount.finalAmount)}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                  Vencimento
                </span>
                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatDate(selectedAccount.dueDate)}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                  Status
                </span>
                <div>
                  <StatusBadge status={selectedAccount.status} />
                </div>
              </div>

              <div>
                <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                  Categoria / Centro de Custo
                </span>
                <p className="text-xs text-zinc-700 dark:text-zinc-300">
                  {selectedAccount.category} • {selectedAccount.costCenter}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                  Forma de Pagamento
                </span>
                <p className="text-xs uppercase font-mono text-zinc-700 dark:text-zinc-300">
                  {selectedAccount.paymentMethod}
                </p>
              </div>
            </div>

            {/* Notes */}
            {selectedAccount.notes && (
              <div>
                <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                  Observações e Justificativas
                </h4>
                <div className="p-3 bg-zinc-50 rounded-md border border-zinc-100 text-xs text-zinc-600 dark:bg-zinc-800/40 dark:border-zinc-800 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {selectedAccount.notes}
                </div>
              </div>
            )}

            {selectedAccount.status !== "paid" && (
              <div>
                <label className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                  Comprovante de pagamento
                </label>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(event) => setPaymentProofFile(event.target.files?.[0] || null)}
                  className="w-full text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 file:mr-3 file:border-0 file:bg-zinc-100 file:px-3 file:py-2 dark:file:bg-zinc-800"
                />
                <p className="mt-1 text-[10px] text-zinc-400">PDF ou foto, salvo no Google Drive, até 8 MB.</p>
              </div>
            )}

            {selectedAccount.paymentProofDriveFileId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadFileFromDrive(
                  selectedAccount.paymentProofDriveFileId!,
                  selectedAccount.paymentProofName || "comprovante"
                ).catch(() => alert("Não foi possível baixar o comprovante."))}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Baixar comprovante
              </Button>
            )}

            {/* Approvals and Rejections Box */}
            {selectedAccount.status === "pending_approval" && (
              <div className="p-4 rounded-lg border border-amber-200/80 bg-amber-50/30 space-y-3 dark:bg-amber-950/20 dark:border-amber-900/40">
                <div className="text-xs font-semibold text-amber-900 dark:text-amber-400">
                  Ação de Aprovação Requerida
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Comentário ou Justificativa (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Lote conferido e aprovado para pagamento na data."
                    value={approvalComment}
                    onChange={(e) => setApprovalComment(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs rounded border border-zinc-200 bg-white focus:outline-none dark:bg-zinc-900 dark:border-zinc-800"
                  />
                </div>
              </div>
            )}

            {/* Timeline / Audit trail */}
            <div>
              <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                Histórico & Auditoria
              </h4>
              <div className="border-l-2 border-zinc-200 pl-4 space-y-3 dark:border-zinc-800">
                <div className="relative text-xs">
                  <div className="font-medium text-zinc-800 dark:text-zinc-200">
                    Lançamento criado por {selectedAccount.responsibleUser}
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    {formatDateTime(selectedAccount.createdAt)}
                  </div>
                </div>

                {selectedAccount.approvedBy && (
                  <div className="relative text-xs">
                    <div className="font-medium text-emerald-700 dark:text-emerald-400">
                      Aprovado por {selectedAccount.approvedBy}
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      {formatDateTime(selectedAccount.approvedAt || "")}
                    </div>
                  </div>
                )}

                {selectedAccount.paidAt && (
                  <div className="relative text-xs">
                    <div className="font-medium text-emerald-700 dark:text-emerald-400">
                      Pagamento liquidado via {selectedAccount.bankAccount || "Banco"}
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      {formatDateTime(selectedAccount.paidAt)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Drawer>

      <QuickCreateModal
        isOpen={isQuickCreateOpen}
        onClose={() => setIsQuickCreateOpen(false)}
        defaultTab="payable"
      />
    </div>
  );
}

export default function FinanceiroPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-xs text-zinc-400">Carregando Financeiro...</div>}>
      <FinanceiroContent />
    </React.Suspense>
  );
}
