"use client";

import React, { useState, useMemo } from "react";
import {
  Wallet,
  TrendingDown,
  Calendar,
  Building2,
  Landmark,
  Search,
  FileText,
  Eye,
  Download,
  RotateCcw,
  ArrowUpRight,
  Filter,
  CheckCircle2,
  AlertCircle,
  Receipt,
  Layers,
} from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  currency,
  dateToday,
  addDays,
  RecordData,
  str,
} from "@/domain/management/model";
import { Filters } from "@/domain/management/engine";
import { AttachmentLightbox, CashAttachment } from "@/components/cash/CashWorkspace";
import { commitRecords } from "@/services/managementService";
import { downloadFileFromDrive } from "@/services/driveService";

export function CashFlowWorkspace({
  filters,
}: {
  filters: Filters;
}) {
  const { data, tenantId } = useManagement();
  const { user, userProfile } = useAuth();
  const today = dateToday();

  // Filters
  const [periodFilter, setPeriodFilter] = useState<"today" | "yesterday" | "7days" | "month" | "all">("month");
  const [bankFilter, setBankFilter] = useState<string>("all");
  const [unitFilter, setUnitFilter] = useState<string>(() => filters.unitId || "all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAttachment, setSelectedAttachment] = useState<CashAttachment | null>(null);
  const [reversingTxId, setReversingTxId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  // 1. Saldo Total dos Bancos em Tempo Real
  const bankAccounts = useMemo(
    () => data.bankAccounts.filter((b) => !b.archived),
    [data.bankAccounts]
  );

  const bankBalances = useMemo(() => {
    const transfers = data.bankTransfers || [];
    return bankAccounts.map((account) => {
      if (typeof account.balance !== "number") return { account, balance: 0 };
      const since = str(account, "balanceDate");
      const balanceUpdatedAt = str(account, "balanceUpdatedAt") || str(account, "updatedAt");
      let value = Number(account.balance);

      data.transactions
        .filter((row) => {
          if (row.archived || row.bankAccountId !== account.id) return false;
          const txDate = str(row, "date");
          if (!since || txDate > since) return true;
          if (txDate === since) {
            const txCreated = str(row, "createdAt");
            if (txCreated && balanceUpdatedAt) return txCreated >= balanceUpdatedAt;
            return Boolean(row.obligationId);
          }
          return false;
        })
        .forEach((row) => {
          value += Number(row.amount || 0) * (row.direction === "Entrada" ? 1 : -1);
        });

      transfers
        .filter((row) => {
          if (row.archived) return false;
          const txDate = str(row, "date");
          if (!since || txDate > since) return true;
          if (txDate === since) {
            const txCreated = str(row, "createdAt");
            if (txCreated && balanceUpdatedAt) return txCreated >= balanceUpdatedAt;
            return true;
          }
          return false;
        })
        .forEach((row) => {
          if (row.fromBankId === account.id) value -= Number(row.amount || 0);
          if (row.toBankId === account.id) value += Number(row.amount || 0);
        });

      return { account, balance: value };
    });
  }, [bankAccounts, data.transactions, data.bankTransfers]);

  // Total balance across all or filtered banks
  const totalBankBalance = useMemo(() => {
    return bankBalances
      .filter((item) => {
        if (unitFilter !== "all" && item.account.unitId && item.account.unitId !== unitFilter) {
          return false;
        }
        if (bankFilter !== "all" && item.account.id !== bankFilter) {
          return false;
        }
        return true;
      })
      .reduce((sum, item) => sum + item.balance, 0);
  }, [bankBalances, unitFilter, bankFilter]);

  // 2. Transações de Saída (Outflows)
  const allOutflows = useMemo(() => {
    return (data.transactions || [])
      .filter((row) => !row.archived && row.direction === "Saída" && !row.reversalOf)
      .sort((a, b) => {
        const dateCmp = str(b, "date").localeCompare(str(a, "date"));
        if (dateCmp !== 0) return dateCmp;
        return str(b, "createdAt").localeCompare(str(a, "createdAt"));
      });
  }, [data.transactions]);

  // Filtered Outflows according to user controls
  const filteredOutflows = useMemo(() => {
    const yesterday = addDays(today, -1);
    const sevenDaysAgo = addDays(today, -7);
    const currentMonth = today.slice(0, 7);

    return allOutflows.filter((row) => {
      const txDate = str(row, "date");

      // Period Filter
      if (periodFilter === "today" && txDate !== today) return false;
      if (periodFilter === "yesterday" && txDate !== yesterday) return false;
      if (periodFilter === "7days" && (txDate < sevenDaysAgo || txDate > today)) return false;
      if (periodFilter === "month" && txDate.slice(0, 7) !== currentMonth) return false;

      // Bank Filter
      if (bankFilter !== "all" && row.bankAccountId !== bankFilter) return false;

      // Unit Filter
      if (unitFilter !== "all" && row.unitId && row.unitId !== unitFilter) return false;

      // Search Term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const desc = str(row, "description").toLowerCase();
        const cat = str(row, "category").toLowerCase();
        const supp = str(row, "supplierName").toLowerCase();
        const payable = data.payables.find((p) => p.id === row.obligationId);
        const payableDesc = payable ? str(payable, "description").toLowerCase() : "";
        const supplierObj = data.suppliers.find(
          (s) => s.id === payable?.supplierId || s.id === row.supplierId
        );
        const supplierName = supplierObj ? str(supplierObj, "name").toLowerCase() : "";

        if (
          !desc.includes(term) &&
          !cat.includes(term) &&
          !supp.includes(term) &&
          !payableDesc.includes(term) &&
          !supplierName.includes(term)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [allOutflows, periodFilter, bankFilter, unitFilter, searchTerm, today, data.payables, data.suppliers]);

  // Total Outflows for selected filter
  const totalOutflowsAmount = useMemo(() => {
    return filteredOutflows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }, [filteredOutflows]);

  // Count of outflows
  const outflowsCount = filteredOutflows.length;

  // Handle Reversal (Estorno de Baixa)
  const handleReversePayment = async (tx: RecordData) => {
    if (!user) return;
    const isConfirmed = window.confirm(
      `Deseja realmente estornar a baixa de ${currency(Number(tx.amount || 0))} referente a "${str(
        tx,
        "description"
      )}"?\n\nA conta voltará a ficar em aberto no Contas a Pagar e o saldo bancário será restaurado.`
    );
    if (!isConfirmed) return;

    try {
      setReversingTxId(tx.id);
      const now = new Date().toISOString();

      // Create Reversal Transaction
      const reversalTx: RecordData = {
        id: `rev-${tx.id}`,
        kind: "transactions",
        tenantId,
        unitId: tx.unitId,
        version: 0,
        createdAt: now,
        updatedAt: now,
        createdBy: user.uid,
        updatedBy: user.uid,
        description: `Estorno: ${str(tx, "description")}`,
        date: today,
        competence: today.slice(0, 7),
        amount: tx.amount,
        direction: "Entrada",
        bankAccountId: tx.bankAccountId,
        nature: tx.nature || "Operacional",
        obligationId: tx.obligationId,
        obligationKind: tx.obligationKind,
        reversalOf: tx.id,
      };

      const toCommit: RecordData[] = [reversalTx];

      // Update original transaction
      toCommit.push({
        ...tx,
        reversedBy: reversalTx.id,
        reversedAt: now,
        updatedAt: now,
        updatedBy: user.uid,
      });

      // Update payable if applicable
      if (tx.obligationId) {
        const payable = data.payables.find((p) => p.id === tx.obligationId);
        if (payable) {
          toCommit.push({
            ...payable,
            status: "Pendente",
            updatedAt: now,
            updatedBy: user.uid,
          });
        }
      }

      await commitRecords(toCommit, data, reversalTx);
      setStatusMessage("Estorno realizado com sucesso! A conta retornou para o Contas a Pagar.");
      setTimeout(() => setStatusMessage(""), 5000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao estornar pagamento.");
    } finally {
      setReversingTxId(null);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {statusMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2.5 text-emerald-400 text-xs font-semibold">
          <CheckCircle2 size={16} />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* ── KPI Cards Header ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Saldo Total dos Bancos */}
        <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-xl flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400">Saldo Total dos Bancos</span>
            <div className="h-8 w-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Wallet size={16} />
            </div>
          </div>
          <div className="mt-3">
            <strong className={`text-xl sm:text-2xl font-bold tracking-tight ${totalBankBalance >= 0 ? "text-white" : "text-rose-400"}`}>
              {currency(totalBankBalance)}
            </strong>
            <span className="block text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Atualizado em tempo real ({bankAccounts.length} contas)
            </span>
          </div>
        </div>

        {/* Card 2: Saídas Totais no Período */}
        <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400">Saídas Totais (Baixas)</span>
            <div className="h-8 w-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <TrendingDown size={16} />
            </div>
          </div>
          <div className="mt-3">
            <strong className="text-xl sm:text-2xl font-bold tracking-tight text-rose-400">
              -{currency(totalOutflowsAmount)}
            </strong>
            <span className="block text-[11px] text-zinc-500 mt-0.5">
              {outflowsCount === 1 ? "1 pagamento registrado" : `${outflowsCount} pagamentos registrados`}
            </span>
          </div>
        </div>

        {/* Card 3: Saldo Disponível Consolidado */}
        <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400">Posição Financeira Líquida</span>
            <div className="h-8 w-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Landmark size={16} />
            </div>
          </div>
          <div className="mt-3">
            <strong className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
              {currency(totalBankBalance)}
            </strong>
            <span className="block text-[11px] text-zinc-500 mt-0.5">
              Disponível em caixa e bancos
            </span>
          </div>
        </div>

        {/* Card 4: Status do Período */}
        <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400">Filtro de Visualização</span>
            <div className="h-8 w-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
              <Filter size={15} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-sm font-bold text-purple-400">
              {periodFilter === "today"
                ? "Pagamentos de Hoje"
                : periodFilter === "yesterday"
                ? "Pagamentos de Ontem"
                : periodFilter === "7days"
                ? "Últimos 7 dias"
                : periodFilter === "month"
                ? "Mês Vigente"
                : "Todo o Histórico"}
            </span>
            <span className="block text-[11px] text-zinc-500 mt-0.5">
              Exibindo apenas saídas confirmadas
            </span>
          </div>
        </div>
      </div>

      {/* ── Filtros e Barra de Ações ─────────────────────────────────── */}
      <div className="p-3.5 bg-zinc-900/80 border border-zinc-800 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Período */}
          <div className="flex items-center bg-zinc-800/90 rounded-xl p-1 border border-zinc-700">
            {[
              { id: "today", label: "Hoje" },
              { id: "yesterday", label: "Ontem" },
              { id: "7days", label: "7 dias" },
              { id: "month", label: "Este mês" },
              { id: "all", label: "Todos" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPeriodFilter(tab.id as any)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  periodFilter === tab.id
                    ? "bg-purple-600 text-white shadow"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Filtro por Banco */}
          <select
            value={bankFilter}
            onChange={(e) => setBankFilter(e.target.value)}
            className="h-8 px-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-300 text-xs focus:outline-none focus:border-purple-500"
          >
            <option value="all">Todos os bancos</option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {str(b, "name")}
              </option>
            ))}
          </select>

          {/* Filtro por Loja / Unidade */}
          {data.units.length > 1 && (
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="h-8 px-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-300 text-xs focus:outline-none focus:border-purple-500"
            >
              <option value="all">Todas as unidades</option>
              {data.units
                .filter((u) => !u.archived)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {str(u, "name")}
                  </option>
                ))}
            </select>
          )}
        </div>

        {/* Busca por texto */}
        <div className="relative w-full sm:w-64">
          <Search size={13} className="absolute left-3 top-2.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por conta ou fornecedor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-8 pl-8 pr-3 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-200 placeholder-zinc-500 text-xs focus:outline-none focus:border-purple-500 transition"
          />
        </div>
      </div>

      {/* ── Lista de Saídas Totais do Fluxo de Caixa ──────────────────── */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/95">
          <div className="flex items-center gap-2">
            <Receipt size={16} className="text-purple-400" />
            <h2 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
              Movimentações de Saída do Período
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-semibold">
              {filteredOutflows.length} saídas
            </span>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-zinc-400 font-medium mr-2">Total baixado:</span>
            <strong className="text-sm font-bold text-rose-400">-{currency(totalOutflowsAmount)}</strong>
          </div>
        </div>

        {filteredOutflows.length === 0 ? (
          <div className="py-14 px-4 text-center">
            <TrendingDown size={32} className="mx-auto text-zinc-600 mb-2 opacity-60" />
            <p className="text-xs font-semibold text-zinc-300">Nenhuma saída registrada neste período.</p>
            <p className="text-[11px] text-zinc-500 mt-1 max-w-sm mx-auto">
              Quando você baixar contas no Contas a Pagar, todas as saídas serão refletidas aqui em tempo real.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/80 overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-800/50 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider select-none">
                <tr>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Descrição da Conta</th>
                  <th className="py-3 px-4">Fornecedor</th>
                  <th className="py-3 px-4">Banco de Saída</th>
                  <th className="py-3 px-4">Forma</th>
                  <th className="py-3 px-4 text-right">Valor da Saída</th>
                  <th className="py-3 px-4 text-center">Comprovante</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredOutflows.map((row) => {
                  const bank = data.bankAccounts.find((b) => b.id === row.bankAccountId);
                  const payable = data.payables.find((p) => p.id === row.obligationId);
                  const supplier = data.suppliers.find(
                    (s) => s.id === payable?.supplierId || s.id === row.supplierId
                  );
                  const supplierName =
                    supplier ? str(supplier, "name") : (payable ? str(payable, "scannedSupplierName") : "") || "—";
                  const unit = data.units.find((u) => u.id === row.unitId);
                  const paymentMethod = str(row, "paymentMethod") || (payable ? str(payable, "obligationType") : "") || "Baixa";
                  const hasProof = Boolean(row.paymentProofFileId);

                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-zinc-800/40 transition group"
                    >
                      {/* Data */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-semibold text-zinc-200">
                          {str(row, "date").split("-").reverse().join("/")}
                        </span>
                        {unit && (
                          <span className="block text-[10px] text-zinc-500">
                            {str(unit, "name")}
                          </span>
                        )}
                      </td>

                      {/* Descrição */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-zinc-100 block">
                          {str(row, "description").replace(/^Baixa:\s*/i, "")}
                        </span>
                        {payable?.installmentText && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] bg-zinc-800 border border-zinc-700 text-purple-300 font-medium">
                            Parcela {payable.installmentText}
                          </span>
                        )}
                      </td>

                      {/* Fornecedor */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="text-zinc-300 font-medium">{supplierName}</span>
                      </td>

                      {/* Banco */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {bank ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 font-medium text-[11px]">
                            <Landmark size={12} className="text-purple-400" />
                            {str(bank, "name")}
                          </span>
                        ) : (
                          <span className="text-zinc-500">—</span>
                        )}
                      </td>

                      {/* Forma / Tipo */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-zinc-800/80 border border-zinc-700/80 text-zinc-400">
                          {paymentMethod}
                        </span>
                      </td>

                      {/* Valor */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <strong className="text-rose-400 font-bold text-sm tracking-tight">
                          -{currency(Number(row.amount || 0))}
                        </strong>
                      </td>

                      {/* Comprovante */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {hasProof ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAttachment({
                                fileId: str(row, "paymentProofFileId"),
                                fileName: str(row, "paymentProofFileName") || "comprovante.jpg",
                                mimeType: str(row, "paymentProofMimeType") || "image/jpeg",
                                size: Number(row.paymentProofSize || 0),
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/30 font-semibold text-[11px] transition"
                            title="Visualizar comprovante"
                          >
                            <Eye size={12} /> Ver
                          </button>
                        ) : (
                          <span className="text-[11px] text-zinc-500 italic">Sem anexo</span>
                        )}
                      </td>

                      {/* Ações (Estorno) */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {(userProfile?.role === "admin" || userProfile?.role === "accountant" || !userProfile?.role) && (
                          <button
                            type="button"
                            disabled={reversingTxId === row.id}
                            onClick={() => handleReversePayment(row)}
                            className="text-zinc-400 hover:text-amber-400 p-1.5 rounded-lg hover:bg-amber-500/10 transition"
                            title="Estornar pagamento (retorna para Contas a Pagar)"
                          >
                            <RotateCcw size={13} className={reversingTxId === row.id ? "animate-spin" : ""} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Lightbox para Comprovante */}
      {selectedAttachment && (
        <AttachmentLightbox
          attachment={selectedAttachment}
          onClose={() => setSelectedAttachment(null)}
        />
      )}
    </div>
  );
}
