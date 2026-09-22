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
  X,
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
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-emerald-700 text-xs font-semibold shadow-sm">
          <CheckCircle2 size={16} />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* ── KPI Cards Header (Modo Claro - 3 Cards Principais) ────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-4">
        {/* Card 1: Saldo Total dos Bancos */}
        <div className="p-5 rounded-2xl bg-white border border-zinc-200 shadow-sm flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Saldo Total dos Bancos</span>
            <div className="h-9 w-9 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 shadow-sm">
              <Wallet size={17} />
            </div>
          </div>
          <div className="mt-3">
            <strong className={`text-2xl font-bold tracking-tight ${totalBankBalance >= 0 ? "text-zinc-900" : "text-rose-600"}`}>
              {currency(totalBankBalance)}
            </strong>
            <span className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Atualizado em tempo real ({bankAccounts.length} contas)
            </span>
          </div>
        </div>

        {/* Card 2: Saídas Totais no Período */}
        <div className="p-5 rounded-2xl bg-white border border-zinc-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Saídas Totais (Baixas)</span>
            <div className="h-9 w-9 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-sm">
              <TrendingDown size={17} />
            </div>
          </div>
          <div className="mt-3">
            <strong className="text-2xl font-bold tracking-tight text-rose-600">
              -{currency(totalOutflowsAmount)}
            </strong>
            <span className="block text-[11px] text-zinc-500 mt-1 font-medium">
              {outflowsCount === 1 ? "1 pagamento registrado" : `${outflowsCount} pagamentos registrados`}
            </span>
          </div>
        </div>

        {/* Card 3: Posição Financeira Líquida */}
        <div className="p-5 rounded-2xl bg-white border border-zinc-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Posição Financeira Líquida</span>
            <div className="h-9 w-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-sm">
              <Landmark size={17} />
            </div>
          </div>
          <div className="mt-3">
            <strong className="text-2xl font-bold tracking-tight text-zinc-900">
              {currency(totalBankBalance)}
            </strong>
            <span className="block text-[11px] text-zinc-500 mt-1 font-medium">
              Disponível consolidado em bancos
            </span>
          </div>
        </div>
      </div>

      {/* ── Filtros e Barra de Ações (Modo Claro & Alturas Corrigidas) ── */}
      <div className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Período */}
          <div className="flex items-center bg-zinc-100 rounded-xl p-1 border border-zinc-200">
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
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  periodFilter === tab.id
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Filtro por Banco (com altura h-10 e sem corte de texto!) */}
          <select
            value={bankFilter}
            onChange={(e) => setBankFilter(e.target.value)}
            className="h-10 px-3.5 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 text-xs font-semibold focus:bg-white focus:outline-none focus:border-purple-600 transition"
          >
            <option value="all">Todos os bancos</option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {str(b, "name")}
              </option>
            ))}
          </select>

          {/* Filtro por Loja / Unidade (com altura h-10 e sem corte de texto!) */}
          {data.units.length > 1 && (
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="h-10 px-3.5 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 text-xs font-semibold focus:bg-white focus:outline-none focus:border-purple-600 transition"
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

        {/* Busca por texto sem sobreposição de ícone */}
        <div className="flex items-center gap-2 w-full sm:w-64 h-10 px-3.5 bg-zinc-50 border border-zinc-200 rounded-xl focus-within:bg-white focus-within:border-purple-600 transition">
          <Search size={15} className="text-zinc-400 shrink-0 select-none" />
          <input
            type="text"
            placeholder="Buscar por conta ou fornecedor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: 0, border: "none", outline: "none", background: "transparent" }}
            className="w-full text-xs font-medium text-zinc-800 placeholder-zinc-400 focus:outline-none"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="text-zinc-400 hover:text-zinc-600 shrink-0"
              title="Limpar busca"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Lista de Saídas Totais do Fluxo de Caixa (Modo Claro) ─────── */}
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600">
              <Receipt size={15} />
            </div>
            <h2 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
              Movimentações de Saída do Período
            </h2>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-bold">
              {filteredOutflows.length} saídas
            </span>
          </div>
          <div className="text-right">
            <span className="text-xs text-zinc-500 font-medium mr-2">Total baixado:</span>
            <strong className="text-sm font-bold text-rose-600">-{currency(totalOutflowsAmount)}</strong>
          </div>
        </div>

        {filteredOutflows.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <TrendingDown size={36} className="mx-auto text-zinc-300 mb-2" />
            <p className="text-xs font-bold text-zinc-700">Nenhuma saída registrada neste período.</p>
            <p className="text-[11px] text-zinc-500 mt-1 max-w-sm mx-auto">
              Quando você registrar pagamentos no Contas a Pagar, todas as saídas serão refletidas aqui em tempo real.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-700">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] font-bold text-zinc-500 uppercase tracking-wider select-none">
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
              <tbody className="divide-y divide-zinc-100">
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
                      className="hover:bg-purple-50/40 transition group"
                    >
                      {/* Data */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-bold text-zinc-900">
                          {str(row, "date").split("-").reverse().join("/")}
                        </span>
                        {unit && (
                          <span className="block text-[10px] text-zinc-400 font-medium">
                            {str(unit, "name")}
                          </span>
                        )}
                      </td>

                      {/* Descrição */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-zinc-900 block">
                          {str(row, "description").replace(/^Baixa:\s*/i, "")}
                        </span>
                        {payable?.installmentText && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] bg-purple-50 border border-purple-200 text-purple-700 font-semibold">
                            Parcela {payable.installmentText}
                          </span>
                        )}
                      </td>

                      {/* Fornecedor */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="text-zinc-700 font-medium">{supplierName}</span>
                      </td>

                      {/* Banco */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {bank ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 border border-zinc-200 text-zinc-800 font-semibold text-[11px]">
                            <Landmark size={12} className="text-purple-600" />
                            {str(bank, "name")}
                          </span>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>

                      {/* Forma / Tipo */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-zinc-100 border border-zinc-200 text-zinc-600">
                          {paymentMethod}
                        </span>
                      </td>

                      {/* Valor */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <strong className="text-rose-600 font-bold text-sm tracking-tight">
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
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 font-bold text-[11px] transition shadow-xs"
                            title="Visualizar comprovante"
                          >
                            <Eye size={12} /> Ver
                          </button>
                        ) : (
                          <span className="text-[11px] text-zinc-400 italic">Sem anexo</span>
                        )}
                      </td>

                      {/* Ações (Estorno) */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {(userProfile?.role === "admin" || userProfile?.role === "accountant" || !userProfile?.role) && (
                          <button
                            type="button"
                            disabled={reversingTxId === row.id}
                            onClick={() => handleReversePayment(row)}
                            className="text-zinc-400 hover:text-amber-600 p-1.5 rounded-lg hover:bg-amber-50 transition"
                            title="Estornar pagamento (retorna para Contas a Pagar)"
                          >
                            <RotateCcw size={14} className={reversingTxId === row.id ? "animate-spin" : ""} />
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
