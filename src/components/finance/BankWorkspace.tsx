"use client";

import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  CalendarDays,
  Check,
  CreditCard,
  Eye,
  Landmark,
  LayoutGrid,
  List,
  MessageCircle,
  Paperclip,
  Pencil,
  Plus,
  PlusCircle,
  Search,
  ShoppingBag,
  Store,
  Trash2,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import { currency, dateToday, RecordData, str } from "@/domain/management/model";
import { saveManagement } from "@/services/managementService";
import "@/components/management/management.css";
import { BankStatementModal } from "./BankStatementModal";

const safeUUID = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 11) + Date.now().toString(36);

function currentBalance(
  account: RecordData,
  transactions: RecordData[],
  transfers: RecordData[],
) {
  if (typeof account.balance !== "number") return null;
  const since = str(account, "balanceDate");
  const balanceUpdatedAt = str(account, "balanceUpdatedAt") || str(account, "updatedAt");
  let value = Number(account.balance);
  transactions
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
  return value;
}

type BankCategory = "all" | "card_machine" | "delivery" | "traditional" | "cash";

function getBankInstitutionMeta(bankName: string, accountName: string, isSangria?: boolean) {
  const combined = `${bankName} ${accountName}`.toLowerCase();
  if (isSangria || /sangria|caixa\s*f[ií]sico|gaveta|cofre|dinheiro/i.test(combined)) {
    return {
      category: "cash" as const,
      label: "Caixa / Sangria",
      bg: "#fffbeb",
      border: "#fde68a",
      color: "#b45309",
    };
  }
  if (/ifood|delivery/i.test(combined)) {
    return {
      category: "delivery" as const,
      label: "iFood",
      bg: "#fef2f2",
      border: "#fecaca",
      color: "#dc2626",
    };
  }
  if (/stone/i.test(combined)) {
    return {
      category: "card_machine" as const,
      label: "Stone",
      bg: "#ecfdf5",
      border: "#a7f3d0",
      color: "#047857",
    };
  }
  if (/veloz/i.test(combined)) {
    return {
      category: "card_machine" as const,
      label: "Veloz",
      bg: "#eff6ff",
      border: "#bfdbfe",
      color: "#1d4ed8",
    };
  }
  if (/capta/i.test(combined)) {
    return {
      category: "card_machine" as const,
      label: "Capta",
      bg: "#f5f3ff",
      border: "#ddd6fe",
      color: "#6d28d9",
    };
  }
  if (/sicoob/i.test(combined)) {
    return {
      category: "traditional" as const,
      label: "Sicoob",
      bg: "#f0fdfa",
      border: "#99f6e4",
      color: "#0f766e",
    };
  }
  if (/bradesco|itau|itaú|santander|inter|nubank|banco\s*do\s*brasil|bb|cef|caixa\s*econ[oô]mica/i.test(combined)) {
    return {
      category: "traditional" as const,
      label: bankName || "Banco",
      bg: "#f1f5f9",
      border: "#cbd5e1",
      color: "#334155",
    };
  }
  return {
    category: "traditional" as const,
    label: bankName || "Conta",
    bg: "#f8fafc",
    border: "#e2e8f0",
    color: "#475569",
  };
}

function getUnitShortName(unitName: string) {
  if (/teixeira/i.test(unitName)) return "Teixeira";
  if (/eun[aá]polis/i.test(unitName)) return "Eunápolis";
  if (/food\s*park/i.test(unitName)) return "Food Park";
  return unitName.replace(/^House\s*(190\s*)?/i, "").trim() || unitName;
}

export function BankWorkspace() {
  const { data, tenantId } = useManagement();
  const [editingBank, setEditingBank] = useState<RecordData | false | null>(null);
  const [viewingStatementAccount, setViewingStatementAccount] = useState<RecordData | null>(null);
  const [quickModal, setQuickModal] = useState<{
    account?: RecordData;
    mode: "add" | "set";
  } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [instantOpen, setInstantOpen] = useState(false);
  const [message, setMessage] = useState("");

  // Filters and View Mode
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<BankCategory>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "has_balance" | "pending">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const today = dateToday();
  const accounts = useMemo(
    () => data.bankAccounts.filter((row) => !row.archived),
    [data.bankAccounts],
  );

  const balances = useMemo(
    () =>
      accounts.map((account) => ({
        account,
        balance: currentBalance(account, data.transactions, data.bankTransfers || []),
      })),
    [accounts, data.transactions, data.bankTransfers],
  );

  const total = useMemo(() => {
    return balances.reduce(
      (sum, item) => sum + (item.balance !== null ? Number(item.balance) : 0),
      0,
    );
  }, [balances]);

  const missingCount = balances.filter((item) => item.balance === null).length;

  const paidToday = useMemo(
    () =>
      data.transactions.filter(
        (row) =>
          !row.archived &&
          row.direction === "Saída" &&
          str(row, "date") === today &&
          !row.reversalOf,
      ),
    [data.transactions, today],
  );

  const paidTotal = useMemo(
    () => paidToday.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [paidToday],
  );

  const activeUnits = useMemo(() => {
    return data.units.filter((u) => !u.archived);
  }, [data.units]);

  // Totals per unit
  const unitSummaries = useMemo(() => {
    return activeUnits.map((u) => {
      const uBalances = balances.filter((b) => b.account.unitId === u.id);
      const uTotal = uBalances.reduce(
        (sum, b) => sum + (b.balance !== null ? Number(b.balance) : 0),
        0,
      );
      const informedCount = uBalances.filter((b) => b.balance !== null).length;
      return {
        unit: u,
        shortName: getUnitShortName(str(u, "name")),
        total: uTotal,
        count: uBalances.length,
        informedCount,
      };
    });
  }, [activeUnits, balances]);

  // Filtered accounts
  const filteredBalances = useMemo(() => {
    return balances.filter((item) => {
      if (unitFilter !== "all" && item.account.unitId !== unitFilter) {
        return false;
      }
      const meta = getBankInstitutionMeta(
        str(item.account, "bank"),
        str(item.account, "name"),
        Boolean(item.account.isSangriaAccount),
      );
      if (categoryFilter !== "all" && meta.category !== categoryFilter) {
        return false;
      }
      if (statusFilter === "has_balance" && item.balance === null) {
        return false;
      }
      if (statusFilter === "pending" && item.balance !== null) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const accName = str(item.account, "name").toLowerCase();
        const bankName = str(item.account, "bank").toLowerCase();
        const u = data.units.find((unit) => unit.id === item.account.unitId);
        const unitName = (u ? str(u, "name") : "").toLowerCase();
        if (!accName.includes(q) && !bankName.includes(q) && !unitName.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [balances, unitFilter, categoryFilter, statusFilter, searchTerm, data.units]);

  const filteredTotal = useMemo(() => {
    return filteredBalances.reduce(
      (sum, item) => sum + (item.balance !== null ? Number(item.balance) : 0),
      0,
    );
  }, [filteredBalances]);

  const share = (type: "banks" | "paid") => {
    if (type === "banks") {
      const lines: string[] = [
        `*📊 POSIÇÃO FINANCEIRA — SALDOS BANCÁRIOS*`,
        `📅 *Data:* ${today.split("-").reverse().join("/")}`,
        ``,
      ];

      // Group accounts by Unit
      const unitGroups = new Map<
        string,
        { name: string; items: typeof balances; subtotal: number }
      >();

      balances.forEach((item) => {
        const u = data.units.find((unit) => unit.id === item.account.unitId);
        const uId = u?.id || "matriz";
        const uName = u ? str(u, "name") : "Matriz / Central";
        if (!unitGroups.has(uId)) {
          unitGroups.set(uId, { name: uName, items: [], subtotal: 0 });
        }
        const grp = unitGroups.get(uId)!;
        grp.items.push(item);
        if (item.balance !== null) {
          grp.subtotal += Number(item.balance);
        }
      });

      unitGroups.forEach((group) => {
        lines.push(`📍 *${group.name.toUpperCase()}*`);
        group.items.forEach(({ account, balance }) => {
          const bankName = str(account, "bank") || "Conta";
          const accName = str(account, "name");
          const val = balance !== null ? currency(balance) : "Pendente";
          lines.push(`• ${accName} (${bankName}): *${val}*`);
        });
        lines.push(`↳ *Subtotal: ${currency(group.subtotal)}*`);
        lines.push(``);
      });

      lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`💰 *TOTAL GERAL CONSOLIDADO: ${currency(total)}*`);
      lines.push(
        `📌 *Contas informadas:* ${accounts.length - missingCount} de ${accounts.length}`,
      );
      if (missingCount > 0) {
        lines.push(
          `⚠️ *Atenção:* ${missingCount} conta(s) pendente(s) de atualização de saldo.`,
        );
      }

      const text = lines.join("\n");
      window.open(
        `https://wa.me/?text=${encodeURIComponent(text)}`,
        "_blank",
        "noopener,noreferrer",
      );
    } else {
      const text = [
        `*📋 RELATÓRIO DE PAGAMENTOS DO DIA — ${today.split("-").reverse().join("/")}*`,
        ``,
        ...paidToday.map(
          (row) =>
            `• ${str(row, "description").replace(/^Baixa:\s*/, "")} — *${currency(Number(row.amount || 0))}*`,
        ),
        ``,
        `━━━━━━━━━━━━━━━━━━━━━`,
        `💰 *TOTAL PAGO HOJE: ${currency(paidTotal)}* (${paidToday.length} pagamento(s))`,
      ].join("\n");

      window.open(
        `https://wa.me/?text=${encodeURIComponent(text)}`,
        "_blank",
        "noopener,noreferrer",
      );
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Executive Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200">
        <div>
          <span className="text-[11px] font-bold tracking-wider uppercase text-purple-600 block mb-0.5">
            TESOURARIA & FINANÇAS
          </span>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Bancos & Caixas
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Saldos em tempo real, conciliação por loja e movimentações financeiras.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => share("banks")}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 font-bold text-xs transition shadow-2xs"
            title="Compartilhar resumo executivo no WhatsApp"
          >
            <MessageCircle size={14} /> WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setQuickModal({ mode: "add" })}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 font-bold text-xs transition shadow-2xs"
            title="Incluir mais valor ou entrada em qualquer banco"
          >
            <PlusCircle size={14} /> Incluir Valor
          </button>
          <button
            type="button"
            onClick={() => setInstantOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 font-bold text-xs transition shadow-2xs"
            title="Registrar pagamento instantâneo de conta"
          >
            <Zap size={14} className="fill-amber-500" /> Pagamento
          </button>
          <button
            type="button"
            onClick={() => setTransferOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 font-bold text-xs transition shadow-2xs"
            title="Transferência entre contas"
          >
            <ArrowRightLeft size={14} /> Transferir
          </button>
          <button
            type="button"
            onClick={() => setEditingBank(false)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm transition"
          >
            <Plus size={14} /> Nova Conta
          </button>
        </div>
      </header>

      {/* KPI Cards Grid (Clickable store filter) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Consolidated Total Card */}
        <div
          onClick={() => setUnitFilter("all")}
          className={`p-5 rounded-2xl bg-white border cursor-pointer transition shadow-sm flex flex-col justify-between group ${
            unitFilter === "all" ? "border-purple-500 ring-2 ring-purple-100" : "border-zinc-200 hover:border-zinc-300"
          }`}
          title="Clique para filtrar todas as contas"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">TOTAL CONSOLIDADO</span>
            <div className="h-9 w-9 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 shadow-sm">
              <WalletCards size={17} />
            </div>
          </div>
          <div className="mt-3">
            <strong className="text-2xl font-bold tracking-tight text-zinc-900">
              {accounts.length ? currency(total) : "R$ 0,00"}
            </strong>
            <span className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {accounts.length - missingCount} de {accounts.length} contas com saldo
              {missingCount > 0 && <span className="text-amber-600 font-semibold">· {missingCount} pendente(s)</span>}
            </span>
          </div>
        </div>

        {/* Store Breakdown Cards */}
        {unitSummaries.map((summary) => {
          const isActive = unitFilter === summary.unit.id;
          return (
            <div
              key={summary.unit.id}
              onClick={() => setUnitFilter(isActive ? "all" : summary.unit.id)}
              className={`p-5 rounded-2xl bg-white border cursor-pointer transition shadow-sm flex flex-col justify-between ${
                isActive ? "border-purple-500 ring-2 ring-purple-100" : "border-zinc-200 hover:border-zinc-300"
              }`}
              title={`Clique para filtrar ${summary.shortName}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-500 uppercase">{summary.shortName}</span>
                <div className="h-9 w-9 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-center text-zinc-600 shadow-sm">
                  <Store size={16} />
                </div>
              </div>
              <div className="mt-3">
                <strong className="text-2xl font-bold tracking-tight text-zinc-900">
                  {currency(summary.total)}
                </strong>
                <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-1 font-medium">
                  <span>{summary.informedCount} de {summary.count} conta(s)</span>
                  {isActive && <span className="text-purple-600 font-bold">· Filtrado</span>}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* Modern Controls Bar */}
      <section className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Store Tabs */}
          <div className="flex items-center bg-zinc-100 rounded-xl p-1 border border-zinc-200">
            <button
              type="button"
              onClick={() => setUnitFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                unitFilter === "all" ? "bg-white text-purple-700 shadow-xs" : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Todas ({balances.length})
            </button>
            {unitSummaries.map((s) => (
              <button
                key={s.unit.id}
                type="button"
                onClick={() => setUnitFilter(s.unit.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  unitFilter === s.unit.id ? "bg-white text-purple-700 shadow-xs" : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                {s.shortName} ({s.count})
              </button>
            ))}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center bg-zinc-100 rounded-xl p-1 border border-zinc-200">
            {[
              { id: "all", label: "Todos Tipos" },
              { id: "card_machine", label: "Maquininhas" },
              { id: "delivery", label: "Delivery / iFood" },
              { id: "traditional", label: "Bancos" },
              { id: "cash", label: "Caixa / Sangria" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setCategoryFilter(t.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  categoryFilter === t.id ? "bg-white text-purple-700 shadow-xs" : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center bg-zinc-100 rounded-xl p-1 border border-zinc-200">
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === "has_balance" ? "all" : "has_balance")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === "has_balance" ? "bg-white text-purple-700 shadow-xs" : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Com Saldo
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === "pending" ? "all" : "pending")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === "pending" ? "bg-white text-amber-700 shadow-xs" : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Pendentes ({missingCount})
            </button>
          </div>
        </div>

        {/* Search & View Switch */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-60 h-10 px-3.5 bg-zinc-50 border border-zinc-200 rounded-xl focus-within:bg-white focus-within:border-purple-600 transition">
            <Search size={15} className="text-zinc-400 shrink-0 select-none" />
            <input
              type="text"
              placeholder="Buscar conta ou banco..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ padding: 0, border: "none", outline: "none", background: "transparent" }}
              className="w-full text-xs font-medium text-zinc-800 placeholder-zinc-400 focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="text-zinc-400 hover:text-zinc-700 shrink-0"
                title="Limpar busca"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex items-center bg-zinc-100 rounded-xl p-1 border border-zinc-200 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`p-2 rounded-lg transition ${
                viewMode === "cards" ? "bg-white text-purple-700 shadow-xs" : "text-zinc-500 hover:text-zinc-900"
              }`}
              title="Visualização em Cards"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`p-2 rounded-lg transition ${
                viewMode === "table" ? "bg-white text-purple-700 shadow-xs" : "text-zinc-500 hover:text-zinc-900"
              }`}
              title="Visualização em Tabela"
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </section>

      {/* Messages */}
      {message && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-emerald-700 text-xs font-semibold shadow-sm">
          <Check size={16} />
          <span>{message}</span>
        </div>
      )}

      {/* Content: Cards View vs Table View */}
      {viewMode === "cards" ? (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {filteredBalances.map(({ account, balance }) => {
            const meta = getBankInstitutionMeta(
              str(account, "bank"),
              str(account, "name"),
              Boolean(account.isSangriaAccount),
            );
            const unit = data.units.find((u) => u.id === account.unitId);
            const unitShort = unit ? getUnitShortName(str(unit, "name")) : "Matriz";
            const isPending = balance === null;
            const isNegative = balance !== null && balance < 0;

            return (
              <article
                className="p-4 bg-white border border-zinc-200 hover:border-purple-300 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                key={account.id}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span
                      className="px-2 py-0.5 rounded-md text-[11px] font-bold border"
                      style={{
                        backgroundColor: meta.bg,
                        borderColor: meta.border,
                        color: meta.color,
                      }}
                    >
                      {meta.label}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-zinc-100 border border-zinc-200 text-zinc-600">
                      {unitShort}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-zinc-900 group-hover:text-purple-700 transition leading-snug">
                    {str(account, "name")}
                  </h3>
                  {account.isSangriaAccount && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-700">
                      Caixa de Sangria
                    </span>
                  )}

                  <div className="mt-3">
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className={`text-2xl font-black tracking-tight ${
                          isPending
                            ? "text-zinc-400"
                            : isNegative
                            ? "text-rose-600"
                            : "text-zinc-900"
                        }`}
                      >
                        {isPending ? "R$ —" : currency(balance)}
                      </span>
                      {isPending && (
                        <span className="text-[11px] text-amber-600 font-semibold">
                          Pendente
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between gap-1 text-xs">
                  <span
                    className="text-[11px] text-zinc-400 font-medium truncate"
                    title={
                      str(account, "balanceDate")
                        ? `Última atualização: ${str(account, "balanceDate").split("-").reverse().join("/")}`
                        : "Sem saldo registrado"
                    }
                  >
                    {str(account, "balanceDate")
                      ? str(account, "balanceDate").split("-").reverse().join("/")
                      : "Sem saldo"}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setQuickModal({ account, mode: "add" })}
                      className="px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200/70 text-purple-700 font-bold text-[11px] transition shadow-2xs flex items-center gap-1"
                      title="Incluir mais valor / somar a esta conta"
                    >
                      <Plus size={11} /> Incluir
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickModal({ account, mode: "set" })}
                      className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200/70 text-amber-700 font-bold text-[11px] transition shadow-2xs flex items-center gap-1"
                      title="Ajustar saldo total"
                    >
                      <Zap size={11} className="fill-amber-500" /> Saldo
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewingStatementAccount(account)}
                      className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 transition"
                      title="Ver saídas, entradas e extrato da conta"
                    >
                      <Eye size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingBank(account)}
                      className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 transition"
                      title="Configurações da conta"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {!filteredBalances.length && (
            <div className="col-span-full p-12 bg-white border border-dashed border-zinc-200 rounded-2xl text-center text-zinc-500 text-xs">
              Nenhuma conta bancária encontrada com os filtros selecionados.
            </div>
          )}
        </section>
      ) : (
        <section className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
          {filteredBalances.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-700">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-[11px] font-bold text-zinc-500 uppercase tracking-wider select-none">
                  <tr>
                    <th className="py-3 px-4" style={{ width: "160px" }}>Instituição</th>
                    <th className="py-3 px-4">Nome da Conta</th>
                    <th className="py-3 px-4" style={{ width: "160px" }}>Unidade</th>
                    <th className="py-3 px-4 text-right" style={{ width: "170px" }}>Saldo Atual</th>
                    <th className="py-3 px-4 text-center" style={{ width: "150px" }}>
                      Última Atualização
                    </th>
                    <th className="py-3 px-4 text-right" style={{ width: "210px" }}>Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredBalances.map(({ account, balance }) => {
                    const meta = getBankInstitutionMeta(
                      str(account, "bank"),
                      str(account, "name"),
                      Boolean(account.isSangriaAccount),
                    );
                    const unit = data.units.find((u) => u.id === account.unitId);
                    const isPending = balance === null;
                    const isNegative = balance !== null && balance < 0;

                    return (
                      <tr key={account.id} className="hover:bg-purple-50/40 transition group">
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className="px-2.5 py-1 rounded-lg text-xs font-bold border inline-block"
                            style={{
                              backgroundColor: meta.bg,
                              borderColor: meta.border,
                              color: meta.color,
                            }}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <strong className="text-zinc-900 font-bold block text-xs sm:text-sm group-hover:text-purple-700 transition">
                            {str(account, "name")}
                          </strong>
                          {account.isSangriaAccount && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] bg-amber-50 border border-amber-200 text-amber-700 font-semibold">
                              Caixa de Sangria
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-zinc-100 border border-zinc-200 text-zinc-700">
                            {unit ? getUnitShortName(str(unit, "name")) : "Matriz"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {isPending ? (
                            <span className="text-zinc-400 font-semibold text-xs">—</span>
                          ) : (
                            <strong
                              className={`font-black text-sm tracking-tight ${
                                isNegative ? "text-rose-600" : "text-zinc-900"
                              }`}
                            >
                              {currency(balance)}
                            </strong>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap text-zinc-500 font-medium">
                          {str(account, "balanceDate")
                            ? str(account, "balanceDate").split("-").reverse().join("/")
                            : <span className="text-zinc-400 italic">Sem saldo</span>}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setQuickModal({ account, mode: "add" })}
                              className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold text-xs transition"
                              title="Incluir mais valor nesta conta"
                            >
                              <Plus size={12} className="inline mr-0.5" /> Incluir
                            </button>
                            <button
                              type="button"
                              onClick={() => setQuickModal({ account, mode: "set" })}
                              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-bold text-xs transition"
                              title="Ajustar saldo total"
                            >
                              <Zap size={11} className="inline mr-0.5 fill-amber-500" /> Saldo
                            </button>
                            <button
                              type="button"
                              onClick={() => setViewingStatementAccount(account)}
                              className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 transition"
                              title="Extrato da conta"
                            >
                              <Eye size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingBank(account)}
                              className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 transition"
                              title="Editar configurações"
                            >
                              <Pencil size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-zinc-50/80 border-t border-zinc-200 font-bold text-xs">
                  <tr>
                    <td colSpan={3} className="py-3.5 px-4 text-zinc-600">
                      TOTAL ({filteredBalances.length} CONTAS FILTRADAS)
                    </td>
                    <td className="py-3.5 px-4 text-right text-sm font-black text-zinc-900">
                      {currency(filteredTotal)}
                    </td>
                    <td
                      colSpan={2}
                      className="py-3.5 px-4 text-center text-zinc-500 font-normal"
                    >
                      {filteredBalances.filter((b) => b.balance !== null).length} com saldo informado
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-zinc-500 text-xs">
              Nenhuma conta bancária encontrada com os filtros selecionados.
            </div>
          )}
        </section>
      )}

      {/* Daily Payments Summary Row */}
      <section className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 shadow-xs">
            <CalendarDays size={20} />
          </div>
          <div>
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
              PAGAMENTOS REGISTRADOS HOJE
            </span>
            <div className="flex items-baseline gap-2">
              <strong className="text-lg font-black text-zinc-900">{currency(paidTotal)}</strong>
              <span className="text-xs text-zinc-500 font-medium">· {paidToday.length} pagamento(s) liquidado(s)</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => share("paid")}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 font-bold text-xs transition shadow-xs self-start sm:self-auto"
          title="Compartilhar lista de pagamentos do dia no WhatsApp"
        >
          <MessageCircle size={15} /> Relatório de Pagamentos WhatsApp
        </button>
      </section>

      {/* Quick Balance Modal (Incluir Valor ou Substituir Saldo) */}
      {quickModal !== null && (
        <QuickBalanceModal
          initialAccount={quickModal.account}
          initialMode={quickModal.mode}
          accounts={accounts}
          onClose={() => setQuickModal(null)}
          onSaved={(msg) => {
            setQuickModal(null);
            setMessage(msg);
          }}
        />
      )}

      {/* Extrato e Movimentações Minimalistas da Conta (Entradas, Saídas, Quem Fez) */}
      {viewingStatementAccount !== null && (
        <BankStatementModal
          account={viewingStatementAccount}
          accounts={accounts}
          data={data}
          currentBalanceValue={currentBalance(
            viewingStatementAccount,
            data.transactions,
            data.bankTransfers || [],
          )}
          onClose={() => setViewingStatementAccount(null)}
        />
      )}

      {editingBank !== null && (
        <BankAccountModal
          account={editingBank || undefined}
          onClose={() => setEditingBank(null)}
          onSaved={() => {
            setEditingBank(null);
            setMessage("Conta bancária salva com sucesso.");
          }}
        />
      )}

      {transferOpen && (
        <TransferModal
          accounts={accounts}
          tenantId={tenantId}
          onClose={() => setTransferOpen(false)}
          onSaved={() => {
            setTransferOpen(false);
            setMessage("Transferência interna registrada com sucesso.");
          }}
        />
      )}

      {instantOpen && (
        <InstantPaymentModal
          accounts={accounts}
          tenantId={tenantId}
          onClose={() => setInstantOpen(false)}
          onSaved={() => {
            setInstantOpen(false);
            setMessage(
              "Pagamento instantâneo registrado e contabilizado no relatório do dia.",
            );
          }}
        />
      )}
    </div>
  );
}

/**
 * Fast modal to include more value (somar) OR replace total balance
 */
function QuickBalanceModal({
  initialAccount,
  initialMode = "add",
  accounts,
  onClose,
  onSaved,
}: {
  initialAccount?: RecordData;
  initialMode?: "add" | "set";
  accounts: RecordData[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { data, tenantId } = useManagement();
  const { user } = useAuth();
  const [mode, setMode] = useState<"add" | "set">(initialMode);
  const [selectedBankId, setSelectedBankId] = useState(
    initialAccount?.id || accounts[0]?.id || "",
  );
  const [valueInput, setValueInput] = useState("");
  const [date, setDate] = useState(() => dateToday());
  const [notes, setNotes] = useState("");
  const [recordTransaction, setRecordTransaction] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const targetAccount = useMemo(() => {
    return (
      accounts.find((a) => a.id === selectedBankId) ||
      initialAccount ||
      accounts[0]
    );
  }, [accounts, selectedBankId, initialAccount]);

  const targetBal = useMemo(() => {
    if (!targetAccount) return null;
    return currentBalance(targetAccount, data.transactions, data.bankTransfers || []);
  }, [targetAccount, data.transactions, data.bankTransfers]);

  const targetUnit = data.units.find((u) => u.id === targetAccount?.unitId);

  // Live calculation of new balance
  const parsedVal = Number(valueInput.replace(",", "."));
  const inputCents = !isNaN(parsedVal) && parsedVal > 0 ? Math.round(parsedVal * 100) : 0;
  const currentCents = targetBal !== null ? Number(targetBal) : 0;
  const resultingCents = mode === "add" ? currentCents + inputCents : inputCents;

  const handleAddIncrement = (inc: number) => {
    const current = !isNaN(parsedVal) && parsedVal > 0 ? parsedVal : 0;
    setValueInput((current + inc).toFixed(2));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !targetAccount) return;
    if (valueInput.trim() === "" || isNaN(parsedVal) || parsedVal <= 0) {
      setError("Por favor, digite um valor numérico válido maior que zero.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const now = new Date().toISOString();
      const updatedBalance = resultingCents;

      // 1. Update account balance and reference date with balanceUpdatedAt timestamp
      const updatedAccount: RecordData = {
        ...targetAccount,
        balance: updatedBalance,
        balanceDate: date || dateToday(),
        balanceUpdatedAt: now,
        reconciled: true,
        version: (targetAccount.version || 0) + 1,
        updatedAt: now,
        updatedBy: user.uid,
      };
      await saveManagement(updatedAccount, data);

      // 2. If in add mode and user requested recording movement, create entry transaction
      if (mode === "add" && recordTransaction) {
        const tx: RecordData = {
          id: safeUUID(),
          kind: "transactions",
          tenantId,
          unitId: targetAccount.unitId,
          version: 0,
          createdAt: new Date(Date.now() - 500).toISOString(),
          updatedAt: now,
          createdBy: user.uid,
          updatedBy: user.uid,
          description:
            notes.trim() ||
            `Entrada de valor em ${str(targetAccount, "name")}`,
          date: date || dateToday(),
          competence: (date || dateToday()).slice(0, 7),
          direction: "Entrada",
          amount: inputCents,
          bankAccountId: targetAccount.id,
          nature: "Operacional",
          paymentMethod: "Dinheiro",
          externalId: safeUUID(),
        };
        await saveManagement(tx, data);
      }

      const accName = str(targetAccount, "name");
      const msg =
        mode === "add"
          ? `+${currency(inputCents)} incluído com sucesso em ${accName}! Novo saldo: ${currency(updatedBalance)}.`
          : `Saldo de ${accName} atualizado para ${currency(updatedBalance)}.`;
      onSaved(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar movimentação.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="bank-quick-modal-shade"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="bank-quick-modal" role="dialog" aria-modal="true">
        <header className="bank-quick-modal-header">
          <div>
            <h3>{mode === "add" ? "Incluir Mais Valor no Banco" : "Ajustar Saldo Total"}</h3>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
              {targetAccount ? str(targetAccount, "name") : "Selecione a conta"} ·{" "}
              {targetUnit ? str(targetUnit, "name") : "Todas as Lojas"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              background: "transparent",
              border: "none",
              fontSize: "18px",
              cursor: "pointer",
              color: "#64748b",
            }}
          >
            ✕
          </button>
        </header>

        {/* Mode Selector Tabs */}
        <div style={{ padding: "12px 20px 0" }}>
          <div className="bank-modal-mode-tabs">
            <button
              type="button"
              className={`bank-modal-mode-btn ${mode === "add" ? "active add" : ""}`}
              onClick={() => {
                setMode("add");
                setError("");
              }}
            >
              <Plus size={13} /> Incluir Mais Valor
            </button>
            <button
              type="button"
              className={`bank-modal-mode-btn ${mode === "set" ? "active" : ""}`}
              onClick={() => {
                setMode("set");
                setError("");
              }}
            >
              <Zap size={13} /> Substituir Saldo
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bank-quick-modal-body">
            {/* Account Selector (if not pre-locked to single account) */}
            {accounts.length > 1 && (
              <div className="task-field-group">
                <label
                  htmlFor="bank-target-select"
                  style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}
                >
                  Conta / Caixa de Destino
                </label>
                <select
                  id="bank-target-select"
                  value={selectedBankId}
                  onChange={(e) => setSelectedBankId(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  {accounts.map((b) => {
                    const u = data.units.find((unit) => unit.id === b.unitId);
                    const uName = u ? str(u, "name") : "Matriz";
                    return (
                      <option key={b.id} value={b.id}>
                        {str(b, "name")} ({str(b, "bank") || "Conta"} · {uName})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Calculation Preview Card */}
            <div className="bank-calc-preview">
              <div className="bank-calc-row">
                <span style={{ color: "#64748b" }}>Saldo atual na conta:</span>
                <strong>
                  {targetBal !== null ? currency(targetBal) : "R$ 0,00"}
                </strong>
              </div>

              {mode === "add" && (
                <div className="bank-calc-row">
                  <span style={{ color: "#047857" }}>(+) Valor a incluir agora:</span>
                  <strong style={{ color: "#047857" }}>
                    {inputCents > 0 ? `+${currency(inputCents)}` : "R$ 0,00"}
                  </strong>
                </div>
              )}

              <div className="bank-calc-row result">
                <span>(=) Saldo final após confirmação:</span>
                <strong>
                  {currency(resultingCents)}
                </strong>
              </div>
            </div>

            {/* Amount Field */}
            <div className="task-field-group">
              <label
                htmlFor="quick-value-input"
                style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}
              >
                {mode === "add" ? "Valor a Incluir / Aporte (R$)" : "Novo Saldo Total (R$)"}{" "}
                <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                id="quick-value-input"
                type="number"
                step="0.01"
                min="0.01"
                autoFocus
                placeholder="0,00"
                value={valueInput}
                onChange={(e) => setValueInput(e.target.value)}
                style={{
                  fontSize: "20px",
                  fontWeight: 800,
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: mode === "add" ? "1.5px solid #10b981" : "1.5px solid #6366f1",
                  width: "100%",
                }}
                required
              />

              {/* Quick Add Increment Pills (in add mode) */}
              {mode === "add" && (
                <div className="bank-quick-increments">
                  <span style={{ fontSize: "11px", color: "#64748b" }}>Atalhos:</span>
                  <button
                    type="button"
                    className="bank-increment-pill"
                    onClick={() => handleAddIncrement(50)}
                  >
                    + R$ 50
                  </button>
                  <button
                    type="button"
                    className="bank-increment-pill"
                    onClick={() => handleAddIncrement(100)}
                  >
                    + R$ 100
                  </button>
                  <button
                    type="button"
                    className="bank-increment-pill"
                    onClick={() => handleAddIncrement(200)}
                  >
                    + R$ 200
                  </button>
                  <button
                    type="button"
                    className="bank-increment-pill"
                    onClick={() => handleAddIncrement(500)}
                  >
                    + R$ 500
                  </button>
                  <button
                    type="button"
                    className="bank-increment-pill"
                    onClick={() => handleAddIncrement(1000)}
                  >
                    + R$ 1.000
                  </button>
                </div>
              )}
            </div>

            {/* Date Field */}
            <div className="task-field-group">
              <label
                htmlFor="quick-date-input"
                style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}
              >
                Data da Movimentação
              </label>
              <input
                id="quick-date-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  width: "100%",
                  fontSize: "13px",
                }}
                required
              />
            </div>

            {/* Description and Transaction Checkbox in Add Mode */}
            {mode === "add" && (
              <>
                <div className="task-field-group">
                  <label
                    htmlFor="quick-notes-input"
                    style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}
                  >
                    Motivo / Observação (opcional)
                  </label>
                  <input
                    id="quick-notes-input"
                    type="text"
                    placeholder="Ex.: Entrada de vendas balcão, depósito em dinheiro, aporte..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      width: "100%",
                      fontSize: "12px",
                    }}
                  />
                </div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    color: "#334155",
                    cursor: "pointer",
                    padding: "4px 0",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={recordTransaction}
                    onChange={(e) => setRecordTransaction(e.target.checked)}
                  />
                  <span>Registrar como entrada no histórico de movimentações</span>
                </label>
              </>
            )}

            {error && (
              <div
                style={{
                  color: "#b91c1c",
                  background: "#fef2f2",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
              >
                {error}
              </div>
            )}
          </div>

          <footer className="bank-quick-modal-footer">
            <button
              type="button"
              className="mg-button secondary"
              onClick={onClose}
              disabled={busy}
              style={{ fontSize: "12px", padding: "8px 14px" }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="workspace-primary"
              disabled={busy || inputCents <= 0}
              style={{
                fontSize: "12px",
                padding: "8px 16px",
                background: mode === "add" ? "#059669" : "#4f46e5",
                borderColor: mode === "add" ? "#047857" : "#4338ca",
              }}
            >
              {busy
                ? "Salvando..."
                : mode === "add"
                  ? `➕ Incluir +${currency(inputCents)}`
                  : "Salvar Novo Saldo"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

/**
 * Full configuration modal for Bank Account
 */
function BankAccountModal({
  account,
  onClose,
  onSaved,
}: {
  account?: RecordData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, tenantId, allowedUnit } = useManagement();
  const { user } = useAuth();
  const [unit, setUnit] = useState(
    () =>
      account?.unitId ||
      (allowedUnit !== "all" ? allowedUnit : data.units[0]?.id || ""),
  );
  const [name, setName] = useState(() => (account ? str(account, "name") : ""));
  const [bank, setBank] = useState(() => (account ? str(account, "bank") : ""));
  const [balance, setBalance] = useState(() =>
    account && typeof account.balance === "number"
      ? (Number(account.balance) / 100).toFixed(2)
      : "",
  );
  const [balanceDate, setBalanceDate] = useState(
    () => (account ? str(account, "balanceDate") : "") || dateToday(),
  );
  const [creditFeePct, setCreditFeePct] = useState(() =>
    account && account.creditFeePct !== undefined ? String(account.creditFeePct) : "0",
  );
  const [debitFeePct, setDebitFeePct] = useState(() =>
    account && account.debitFeePct !== undefined ? String(account.debitFeePct) : "0",
  );
  const [pixFeePct, setPixFeePct] = useState(() =>
    account && account.pixFeePct !== undefined ? String(account.pixFeePct) : "0",
  );
  const [isSangriaAccount, setIsSangriaAccount] = useState(() =>
    Boolean(account?.isSangriaAccount),
  );
  const [reconciled, setReconciled] = useState(() =>
    account ? Boolean(account.reconciled) : true,
  );
  const [notes, setNotes] = useState(() => (account ? str(account, "notes") : ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isNew = !account;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) {
      setError("Informe o nome de identificação da conta.");
      return;
    }
    if (!bank.trim()) {
      setError("Informe a instituição financeira ou tipo de caixa.");
      return;
    }
    setBusy(true);
    setError("");

    try {
      const now = new Date().toISOString();
      const updated: RecordData = {
        ...account,
        id: account?.id || safeUUID(),
        kind: "bankAccounts",
        tenantId: account?.tenantId || tenantId || "house190",
        unitId: unit || "",
        name: name.trim(),
        bank: bank.trim(),
        balance: balance !== "" ? Math.round(Number(balance) * 100) : null,
        balanceDate: balanceDate || "",
        creditFeePct: Number(creditFeePct) || 0,
        debitFeePct: Number(debitFeePct) || 0,
        pixFeePct: Number(pixFeePct) || 0,
        isSangriaAccount,
        reconciled,
        notes: notes.trim(),
        version: Number(account?.version || 0),
        createdAt: account?.createdAt || now,
        updatedAt: now,
        createdBy: account?.createdBy || user.uid,
        updatedBy: user.uid,
      };

      await saveManagement(updated, data);
      onSaved();
    } catch (err) {
      console.error("Erro ao salvar conta bancária:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("permission") ||
        msg.includes("Permissão") ||
        msg.includes("Missing or insufficient")
      ) {
        setError(
          "Permissão insuficiente no Firebase para salvar a conta. Verifique seu login administrativo.",
        );
      } else {
        setError(msg || "Não foi possível salvar a conta.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    if (!account || !user) return;
    if (
      !confirm(
        `Deseja realmente arquivar a conta "${name}"? Ela não será mais exibida nas conciliações.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const updated: RecordData = {
        ...account,
        archived: true,
        version: Number(account.version || 0),
        updatedAt: now,
        updatedBy: user.uid,
      };
      await saveManagement(updated, data);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao arquivar conta.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="mg-modal-shade"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="mg-modal task-modal-modern" role="dialog" aria-modal="true">
        <header className="task-modal-header">
          <div className="task-modal-title-box">
            <div className="task-modal-icon-badge">
              <Landmark size={20} />
            </div>
            <div>
              <h2>{isNew ? "Nova Conta / Caixa" : "Editar Conta / Caixa"}</h2>
              <p>
                {isNew
                  ? "Cadastre uma conta bancária, maquininha ou caixa físico de loja."
                  : `Configurações de: ${name}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="task-modal-close"
            onClick={onClose}
            disabled={busy}
            title="Fechar"
          >
            ✕
          </button>
        </header>

        <form className="task-modal-form" onSubmit={handleSave}>
          {/* Card 1: Identificação da Conta & Unidade */}
          <div className="task-compact-card">
            <div className="task-grid-columns-three">
              <div className="task-field-group">
                <label htmlFor="bank-unit">Unidade / Loja</label>
                <select
                  id="bank-unit"
                  value={unit}
                  disabled={allowedUnit !== "all"}
                  onChange={(e) => setUnit(e.target.value)}
                >
                  <option value="">Matriz / Geral (Grupo)</option>
                  {data.units
                    .filter(
                      (u) =>
                        !u.archived && (allowedUnit === "all" || u.id === allowedUnit),
                    )
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {str(u, "name")}
                      </option>
                    ))}
                </select>
              </div>

              <div className="task-field-group">
                <label htmlFor="bank-name">
                  Nome no sistema <span className="task-req">*</span>
                </label>
                <input
                  id="bank-name"
                  type="text"
                  autoFocus
                  placeholder="Ex.: Sicoob Foodpark, Stone Teixeira..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="bank-type">
                  Instituição / Banco <span className="task-req">*</span>
                </label>
                <input
                  id="bank-type"
                  type="text"
                  placeholder="Ex.: Sicoob, Stone, Capta, Caixa Físico..."
                  value={bank}
                  onChange={(e) => setBank(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Card 2: Posição de Saldo & Data */}
          <div className="task-compact-card">
            <div className="task-grid-columns-two-compact">
              <div className="task-field-group">
                <label htmlFor="bank-balance">Saldo Conciliado (R$)</label>
                <input
                  id="bank-balance"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="bank-balance-date">Data do Saldo</label>
                <input
                  id="bank-balance-date"
                  type="date"
                  value={balanceDate}
                  onChange={(e) => setBalanceDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Card 3: Taxas das Operações (%) */}
          <div className="task-compact-card">
            <div className="bank-fee-header">
              <label style={{ fontSize: "11px", fontWeight: 750, color: "#334155" }}>
                Taxas da Maquininha / Banco (para desconto automático na conferência de caixa)
              </label>
            </div>
            <div className="task-grid-columns-three">
              <div className="task-field-group">
                <label htmlFor="fee-credit">Taxa Crédito (%)</label>
                <input
                  id="fee-credit"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="Ex.: 2.89"
                  value={creditFeePct}
                  onChange={(e) => setCreditFeePct(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="fee-debit">Taxa Débito (%)</label>
                <input
                  id="fee-debit"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="Ex.: 1.15"
                  value={debitFeePct}
                  onChange={(e) => setDebitFeePct(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="fee-pix">Taxa PIX (%)</label>
                <input
                  id="fee-pix"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="Ex.: 0.00"
                  value={pixFeePct}
                  onChange={(e) => setPixFeePct(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Card 4: Configurações & Observações */}
          <div className="task-compact-card">
            <div className="task-grid-columns-two-compact">
              <div className="bank-checkbox-group">
                <label className="bank-check-item">
                  <input
                    type="checkbox"
                    checked={isSangriaAccount}
                    onChange={(e) => setIsSangriaAccount(e.target.checked)}
                  />
                  <span>Caixa exclusivo de sangria</span>
                </label>
                <label className="bank-check-item">
                  <input
                    type="checkbox"
                    checked={reconciled}
                    onChange={(e) => setReconciled(e.target.checked)}
                  />
                  <span>Saldo conferido / verificado</span>
                </label>
              </div>

              <div className="task-field-group">
                <label htmlFor="bank-notes">Observações internas (opcional)</label>
                <input
                  id="bank-notes"
                  type="text"
                  placeholder="Chave PIX, agência/conta, responsável..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          {error && <div className="mg-error">{error}</div>}

          <footer
            className="task-modal-footer"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <div>
              {!isNew && (
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={busy}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "transparent",
                    color: "#dc2626",
                    border: "1px solid #fecaca",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <Trash2 size={13} /> Arquivar Conta
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="mg-button secondary task-btn-cancel"
                onClick={onClose}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="workspace-primary task-save-submit"
                disabled={busy}
              >
                {busy ? "Salvando..." : isNew ? "Cadastrar Conta" : "Salvar Alterações"}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}

export function InstantPaymentModal({
  accounts,
  tenantId,
  onClose,
  onSaved,
}: {
  accounts: RecordData[];
  tenantId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data } = useManagement();
  const { user } = useAuth();

  // Selected bank account defaults to the first available account
  const [bankAccountId, setBankAccountId] = useState(() => accounts[0]?.id || "");
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === bankAccountId) || accounts[0],
    [accounts, bankAccountId]
  );

  // Unit defaults to selected account's unitId, or first active unit
  const [unitId, setUnitId] = useState(() => selectedAccount?.unitId || "");
  const [showUnitOverride, setShowUnitOverride] = useState(false);

  // Form states
  const [description, setDescription] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [date, setDate] = useState(() => dateToday());
  const [proofFile, setProofFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleBankChange = (newBankId: string) => {
    setBankAccountId(newBankId);
    const acct = accounts.find((a) => a.id === newBankId);
    if (acct?.unitId) {
      setUnitId(acct.unitId);
    }
  };

  const QUICK_CHIPS = ["Motoboy", "Gelo", "Hortifrúti", "Manutenção", "Embalagens", "Gás"];
  const PAYMENT_METHODS = [
    { key: "PIX", label: "PIX", icon: "⚡" },
    { key: "Cartão Débito", label: "Débito", icon: "💳" },
    { key: "Dinheiro", label: "Dinheiro", icon: "💵" },
    { key: "Transferência", label: "TED / Transf.", icon: "🏦" },
    { key: "Boleto", label: "Boleto", icon: "📄" },
    { key: "Cartão Crédito", label: "Crédito", icon: "💳" },
  ];

  const parsedAmount = parseFloat(amountStr.replace(",", "."));
  const isValidAmount = !isNaN(parsedAmount) && parsedAmount > 0;
  const canSubmit = isValidAmount && description.trim().length > 0 && Boolean(bankAccountId);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    if (!isValidAmount) {
      setError("Informe um valor válido maior que zero.");
      return;
    }
    if (!description.trim()) {
      setError("Informe a descrição do que está sendo pago.");
      return;
    }
    if (!bankAccountId) {
      setError("Selecione a conta bancária de saída.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const now = new Date().toISOString();
      const defaultCategory =
        data.categories.find((c) => !c.archived && /operacion/i.test(str(c, "name"))) ||
        data.categories.find((c) => !c.archived);
      const finalCategoryId = defaultCategory?.id || "";

      const row: RecordData = {
        id: safeUUID(),
        kind: "transactions",
        tenantId: tenantId || "house190",
        unitId: unitId || "",
        version: 0,
        createdAt: now,
        updatedAt: now,
        createdBy: user.uid,
        updatedBy: user.uid,
        description: description.trim(),
        date,
        competence: date.slice(0, 7),
        direction: "Saída",
        amount: Math.round(parsedAmount * 100),
        bankAccountId,
        nature: "Operacional",
        categoryId: finalCategoryId,
        paymentMethod,
        externalId: safeUUID(),
        instantPayment: true,
      };

      if (proofFile && proofFile.size) {
        const { nameFileForDrive, uploadFileToDrive } = await import(
          "@/services/driveService"
        );
        const stored = await uploadFileToDrive(
          nameFileForDrive(
            proofFile,
            `Pagamento instantâneo - ${row.description}`,
          ),
          "payment_proofs",
        );
        row.paymentProofFileId = stored.fileId;
        row.paymentProofFileName = stored.fileName;
        row.paymentProofContentType = proofFile.type;
        row.paymentProofSize = proofFile.size;
      }

      await saveManagement(row, data);
      onSaved();
    } catch (e) {
      console.error("Erro ao registrar pagamento instantâneo:", e);
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes("permission") ||
        msg.includes("Permissão") ||
        msg.includes("Missing or insufficient")
      ) {
        setError(
          "Permissão insuficiente no Firebase para registrar a saída. Verifique seu login.",
        );
      } else {
        setError(msg || "Não foi possível registrar.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="w-full max-w-lg bg-white border border-zinc-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Limpo & Direto */}
        <header className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 shadow-xs">
              <Zap size={20} className="fill-amber-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 leading-tight">
                Pagamento Rápido
              </h2>
              <p className="text-[12px] text-zinc-500">
                Baixa imediata no saldo bancário e fluxo de caixa
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 transition"
            title="Fechar"
          >
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4">
          {/* 1. Valor em Destaque */}
          <div>
            <label className="block text-xs font-bold text-zinc-600 uppercase tracking-wider mb-1.5">
              Valor da Saída <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center bg-zinc-50 border-2 border-zinc-200 focus-within:border-amber-500 focus-within:bg-white rounded-xl px-4 py-2.5 transition">
              <span className="text-xl font-bold text-zinc-400 mr-2 select-none">R$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                autoFocus
                required
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="w-full bg-transparent text-2xl sm:text-3xl font-black text-zinc-900 placeholder:text-zinc-300 focus:outline-none"
              />
            </div>
          </div>

          {/* 2. Descrição com chips rápidos */}
          <div>
            <label className="block text-xs font-bold text-zinc-600 uppercase tracking-wider mb-1.5">
              O que está sendo pago? <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Motoboy (Lucas), Gelo, Troco, Manutenção..."
              className="w-full h-11 px-3.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-amber-500 focus:bg-white transition"
            />
            {/* Quick chips para restaurantes */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[10px] text-zinc-400 font-semibold self-center mr-1">Atalhos:</span>
              {QUICK_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    if (!description) {
                      setDescription(chip);
                    } else if (!description.includes(chip)) {
                      setDescription(`${chip} - ${description}`);
                    }
                  }}
                  className="px-2 py-0.5 rounded-lg bg-zinc-100 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 border border-zinc-200/80 text-[11px] font-medium text-zinc-600 transition"
                >
                  +{chip}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Forma de Pagamento (Pills Rápidos em 1 clique) */}
          <div>
            <label className="block text-xs font-bold text-zinc-600 uppercase tracking-wider mb-1.5">
              Forma de Pagamento
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {PAYMENT_METHODS.map((pm) => {
                const active = paymentMethod === pm.key;
                return (
                  <button
                    key={pm.key}
                    type="button"
                    onClick={() => setPaymentMethod(pm.key)}
                    className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-2 px-1 rounded-xl text-xs font-bold border transition ${
                      active
                        ? "bg-amber-50 border-amber-500 text-amber-900 shadow-xs"
                        : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    }`}
                  >
                    <span>{pm.icon}</span>
                    <span className="truncate">{pm.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Conta Bancária de Saída & Unidade */}
          <div>
            <label className="block text-xs font-bold text-zinc-600 uppercase tracking-wider mb-1.5">
              Conta Bancária de Saída <span className="text-rose-500">*</span>
            </label>
            <select
              value={bankAccountId}
              onChange={(e) => handleBankChange(e.target.value)}
              required
              className="w-full h-11 px-3.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs sm:text-sm font-semibold text-zinc-900 focus:outline-none focus:border-amber-500 focus:bg-white transition"
            >
              {accounts.map((b) => {
                const u = data.units.find((unitItem) => unitItem.id === b.unitId);
                const uName = u ? str(u, "name") : "Matriz";
                const bal = currentBalance(b, data.transactions, data.bankTransfers || []);
                const balFormatted = bal !== null ? currency(bal) : "—";
                return (
                  <option key={b.id} value={b.id}>
                    {str(b, "name")} ({str(b, "bank") || "Conta"} · {uName}) — Saldo: {balFormatted}
                  </option>
                );
              })}
            </select>

            <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-500 px-1">
              <span>
                Unidade vinculada:{" "}
                <strong className="text-zinc-700 font-semibold">
                  {data.units.find((u) => u.id === unitId)?.name || "Matriz / Geral (Grupo)"}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => setShowUnitOverride(!showUnitOverride)}
                className="text-amber-600 hover:text-amber-700 font-semibold underline"
              >
                {showUnitOverride ? "Ocultar" : "Trocar unidade"}
              </button>
            </div>

            {showUnitOverride && (
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="mt-1.5 w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-medium text-zinc-800"
              >
                <option value="">Matriz / Geral (Grupo)</option>
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

          {/* 5. Data do Pagamento */}
          <div>
            <label className="block text-xs font-bold text-zinc-600 uppercase tracking-wider mb-1.5">
              Data do Pagamento
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full h-10 px-3.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs sm:text-sm font-semibold text-zinc-800 focus:outline-none focus:border-amber-500 focus:bg-white transition"
              />
              <button
                type="button"
                onClick={() => setDate(dateToday())}
                className="px-3 py-1 text-xs font-bold text-zinc-600 hover:text-amber-700 bg-zinc-100 hover:bg-amber-50 border border-zinc-200 rounded-xl transition shrink-0"
              >
                Hoje
              </button>
            </div>
          </div>

          {/* 6. Comprovante / Anexo (Opcional) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                Comprovante / Anexo (Opcional)
              </label>
              <span className="text-[10px] text-zinc-400 font-medium">Google Drive</span>
            </div>

            {proofFile ? (
              <div className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium">
                <div className="flex items-center gap-2 truncate">
                  <Check size={16} className="text-emerald-600 shrink-0" />
                  <span className="truncate">{proofFile.name}</span>
                  <span className="text-[10px] text-emerald-600 shrink-0">
                    ({(proofFile.size / 1024).toFixed(0)} KB)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setProofFile(null)}
                  className="p-1 text-emerald-600 hover:text-emerald-900 rounded-lg hover:bg-emerald-100 transition shrink-0"
                  title="Remover anexo"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 py-2.5 px-4 border-2 border-dashed border-zinc-200 hover:border-amber-400 rounded-xl bg-zinc-50/60 hover:bg-amber-50/30 cursor-pointer text-xs font-semibold text-zinc-600 hover:text-amber-700 transition">
                <Paperclip size={14} className="text-zinc-400" />
                <span>Anexar comprovante ou print do PIX</span>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setProofFile(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Erro */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
              {error}
            </div>
          )}

          {/* Footer com botões de ação */}
          <footer className="pt-3 border-t border-zinc-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs sm:text-sm font-semibold text-zinc-700 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy || !canSubmit}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm font-bold text-white shadow-md shadow-amber-500/20 transition"
            >
              <Zap size={16} className="fill-white" />
              {busy
                ? "Registrando..."
                : isValidAmount
                ? `Confirmar Pagamento (${currency(Math.round(parsedAmount * 100))})`
                : "Confirmar Pagamento"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function TransferModal({
  accounts,
  tenantId,
  onClose,
  onSaved,
}: {
  accounts: RecordData[];
  tenantId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data } = useManagement();
  const { user } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div
      className="mg-modal-shade"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="mg-modal task-modal-modern" role="dialog" aria-modal="true">
        <header className="task-modal-header">
          <div className="task-modal-title-box">
            <div
              className="task-modal-icon-badge"
              style={{ background: "#e0e7ff", color: "#4f46e5" }}
            >
              <ArrowRightLeft size={18} />
            </div>
            <div>
              <h2>Transferência Entre Bancos</h2>
              <p>Movimentação interna entre contas bancárias ou caixas</p>
            </div>
          </div>
          <button
            type="button"
            className="task-modal-close"
            onClick={onClose}
            disabled={busy}
          >
            ✕
          </button>
        </header>

        <form
          className="task-modal-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!user) return;
            setBusy(true);
            setError("");
            try {
              const form = new FormData(event.currentTarget);
              const from = String(form.get("from") || "");
              const to = String(form.get("to") || "");
              if (!from || !to || from === to)
                throw new Error("Selecione contas de origem e destino diferentes.");
              const origin = accounts.find((a) => a.id === from);
              if (!origin) throw new Error("Conta de origem inválida.");
              const now = new Date().toISOString();
              const row: RecordData = {
                id: safeUUID(),
                kind: "bankTransfers",
                tenantId: origin.tenantId || tenantId || "house190",
                unitId: origin.unitId || "",
                version: 0,
                createdAt: now,
                updatedAt: now,
                createdBy: user.uid,
                updatedBy: user.uid,
                fromBankId: from,
                toBankId: to,
                date: String(form.get("date")),
                amount: Math.round(Number(form.get("amount")) * 100),
                notes: String(form.get("notes") || "").trim(),
              };
              await saveManagement(row, data);
              onSaved();
            } catch (e) {
              console.error("Erro ao transferir:", e);
              const msg = e instanceof Error ? e.message : String(e);
              if (
                msg.includes("permission") ||
                msg.includes("Permissão") ||
                msg.includes("Missing or insufficient")
              ) {
                setError(
                  "Permissão insuficiente no Firebase para realizar transferência. Verifique seu login.",
                );
              } else {
                setError(msg || "Não foi possível transferir.");
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="task-compact-card">
            <div className="task-grid-columns-two">
              <div className="task-field-group">
                <label htmlFor="transfer-from">
                  Conta de Origem (Saída) <span className="task-req">*</span>
                </label>
                <select id="transfer-from" name="from" required defaultValue="">
                  <option value="">Selecione a conta</option>
                  {accounts.map((a) => {
                    const u = data.units.find((unitItem) => unitItem.id === a.unitId);
                    const uName = u ? str(u, "name") : "Matriz";
                    return (
                      <option key={a.id} value={a.id}>
                        {str(a, "name")} ({str(a, "bank") || "Conta"} · {uName})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="task-field-group">
                <label htmlFor="transfer-to">
                  Conta de Destino (Entrada) <span className="task-req">*</span>
                </label>
                <select id="transfer-to" name="to" required defaultValue="">
                  <option value="">Selecione a conta</option>
                  {accounts.map((a) => {
                    const u = data.units.find((unitItem) => unitItem.id === a.unitId);
                    const uName = u ? str(u, "name") : "Matriz";
                    return (
                      <option key={a.id} value={a.id}>
                        {str(a, "name")} ({str(a, "bank") || "Conta"} · {uName})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          <div className="task-compact-card">
            <div className="task-grid-columns-two">
              <div className="task-field-group">
                <label htmlFor="transfer-date">
                  Data da Transferência <span className="task-req">*</span>
                </label>
                <input
                  id="transfer-date"
                  name="date"
                  type="date"
                  defaultValue={dateToday()}
                  required
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="transfer-amount">
                  Valor (R$) <span className="task-req">*</span>
                </label>
                <input
                  id="transfer-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00"
                  required
                  style={{ fontWeight: 700 }}
                />
              </div>
            </div>

            <div className="task-field-group full">
              <label htmlFor="transfer-notes">Observações / Motivo (opcional)</label>
              <textarea
                id="transfer-notes"
                name="notes"
                rows={2}
                placeholder="Ex.: Repasse de troco, sangria de caixa, centralização..."
              />
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: "10px 14px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "8px",
                color: "#991b1b",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}

          <footer className="task-modal-footer">
            <button
              type="button"
              className="workspace-secondary task-btn-cancel"
              onClick={onClose}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="workspace-primary task-save-submit"
              disabled={busy}
            >
              {busy ? "Transferindo..." : "Confirmar Transferência"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
