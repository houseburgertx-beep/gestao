"use client";

import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  CalendarDays,
  CreditCard,
  Landmark,
  LayoutGrid,
  List,
  MessageCircle,
  Pencil,
  Plus,
  PlusCircle,
  Search,
  ShoppingBag,
  Store,
  Trash2,
  WalletCards,
  Zap,
} from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import { currency, dateToday, RecordData, str } from "@/domain/management/model";
import { saveManagement } from "@/services/managementService";
import "@/components/management/management.css";

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
  let value = Number(account.balance);
  transactions
    .filter(
      (row) =>
        !row.archived &&
        row.bankAccountId === account.id &&
        (!since || str(row, "date") > since),
    )
    .forEach((row) => {
      value += Number(row.amount || 0) * (row.direction === "Entrada" ? 1 : -1);
    });
  transfers
    .filter((row) => !row.archived && (!since || str(row, "date") > since))
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
    <div className="workspace-shell banking-workspace">
      {/* Executive Header */}
      <header className="workspace-header">
        <div>
          <span className="workspace-eyebrow">TESOURARIA & FINANÇAS</span>
          <h1>Bancos & Caixas</h1>
          <p>Saldos em tempo real, conciliação por loja e movimentações financeiras.</p>
        </div>
        <div className="bank-actions">
          <button
            type="button"
            className="bank-btn-whatsapp"
            onClick={() => share("banks")}
            title="Compartilhar resumo executivo no WhatsApp"
          >
            <MessageCircle size={15} /> WhatsApp
          </button>
          <button
            type="button"
            className="workspace-secondary"
            onClick={() => setQuickModal({ mode: "add" })}
            style={{
              background: "#ecfdf5",
              color: "#047857",
              borderColor: "#a7f3d0",
              fontWeight: 700,
            }}
            title="Incluir mais valor ou entrada em qualquer banco"
          >
            <PlusCircle size={15} /> Incluir Valor
          </button>
          <button
            type="button"
            className="workspace-secondary"
            onClick={() => setInstantOpen(true)}
          >
            <Zap size={15} /> Pagamento Instantâneo
          </button>
          <button
            type="button"
            className="workspace-secondary"
            onClick={() => setTransferOpen(true)}
          >
            <ArrowRightLeft size={15} /> Transferir
          </button>
          <button
            type="button"
            className="workspace-primary"
            onClick={() => setEditingBank(false)}
          >
            <Plus size={15} /> Nova Conta
          </button>
        </div>
      </header>

      {/* KPI Cards Grid (Clickable store filter) */}
      <section className="bank-kpi-grid">
        {/* Consolidated Total Card (Light Executive Style) */}
        <div
          className={`bank-kpi-card is-total ${unitFilter === "all" ? "is-active-filter" : ""}`}
          onClick={() => setUnitFilter("all")}
          title="Clique para filtrar todas as contas"
        >
          <div className="bank-kpi-header">
            <span>TOTAL CONSOLIDADO</span>
            <div className="bank-kpi-icon">
              <WalletCards size={16} />
            </div>
          </div>
          <div className="bank-kpi-value">
            {accounts.length ? currency(total) : "R$ 0,00"}
          </div>
          <div className="bank-kpi-footer">
            <span>
              {accounts.length - missingCount} de {accounts.length} contas com saldo
            </span>
            {missingCount > 0 && <span>· {missingCount} pendente(s)</span>}
          </div>
        </div>

        {/* Store Breakdown Cards */}
        {unitSummaries.map((summary) => {
          const isActive = unitFilter === summary.unit.id;
          return (
            <div
              key={summary.unit.id}
              className={`bank-kpi-card ${isActive ? "is-active-filter" : ""}`}
              onClick={() =>
                setUnitFilter(isActive ? "all" : summary.unit.id)
              }
              title={`Clique para filtrar ${summary.shortName}`}
            >
              <div className="bank-kpi-header">
                <span>{summary.shortName.toUpperCase()}</span>
                <div className="bank-kpi-icon">
                  <Store size={15} />
                </div>
              </div>
              <div className="bank-kpi-value">{currency(summary.total)}</div>
              <div className="bank-kpi-footer">
                <span>
                  {summary.informedCount} de {summary.count} conta(s)
                </span>
                {isActive && (
                  <span style={{ color: "#6366f1", fontWeight: 700 }}>· Filtrado</span>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Modern Filter Toolbar */}
      <section className="bank-controls-bar">
        <div className="bank-filter-group">
          {/* Unit Tabs */}
          <button
            type="button"
            className={`bank-filter-btn ${unitFilter === "all" ? "active" : ""}`}
            onClick={() => setUnitFilter("all")}
          >
            Todas ({balances.length})
          </button>
          {unitSummaries.map((s) => (
            <button
              key={s.unit.id}
              type="button"
              className={`bank-filter-btn ${unitFilter === s.unit.id ? "active" : ""}`}
              onClick={() => setUnitFilter(s.unit.id)}
            >
              {s.shortName} ({s.count})
            </button>
          ))}

          <div className="bank-filter-divider" />

          {/* Category Filter */}
          <button
            type="button"
            className={`bank-filter-btn ${categoryFilter === "all" ? "active" : ""}`}
            onClick={() => setCategoryFilter("all")}
          >
            Todos Tipos
          </button>
          <button
            type="button"
            className={`bank-filter-btn ${categoryFilter === "card_machine" ? "active" : ""}`}
            onClick={() => setCategoryFilter("card_machine")}
          >
            Maquininhas
          </button>
          <button
            type="button"
            className={`bank-filter-btn ${categoryFilter === "delivery" ? "active" : ""}`}
            onClick={() => setCategoryFilter("delivery")}
          >
            Delivery / iFood
          </button>
          <button
            type="button"
            className={`bank-filter-btn ${categoryFilter === "traditional" ? "active" : ""}`}
            onClick={() => setCategoryFilter("traditional")}
          >
            Bancos
          </button>
          <button
            type="button"
            className={`bank-filter-btn ${categoryFilter === "cash" ? "active" : ""}`}
            onClick={() => setCategoryFilter("cash")}
          >
            Caixa / Sangria
          </button>

          <div className="bank-filter-divider" />

          {/* Status Filter */}
          <button
            type="button"
            className={`bank-filter-btn ${statusFilter === "has_balance" ? "active" : ""}`}
            onClick={() =>
              setStatusFilter(statusFilter === "has_balance" ? "all" : "has_balance")
            }
          >
            Com Saldo
          </button>
          <button
            type="button"
            className={`bank-filter-btn ${statusFilter === "pending" ? "active" : ""}`}
            onClick={() =>
              setStatusFilter(statusFilter === "pending" ? "all" : "pending")
            }
          >
            Pendentes ({missingCount})
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Search Box */}
          <div className="bank-search-box">
            <Search size={14} style={{ color: "#94a3b8" }} />
            <input
              type="text"
              placeholder="Buscar conta ou banco..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* View Mode Switch */}
          <div className="bank-view-switch">
            <button
              type="button"
              className={`bank-view-btn ${viewMode === "cards" ? "active" : ""}`}
              onClick={() => setViewMode("cards")}
              title="Visualização em Cards"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              className={`bank-view-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
              title="Visualização em Tabela"
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </section>

      {/* Messages */}
      {message && (
        <p
          className="workspace-message"
          style={{
            margin: "0",
            background: "#ecfdf5",
            borderColor: "#a7f3d0",
            color: "#065f46",
          }}
        >
          {message}
        </p>
      )}

      {/* Content: Cards View vs Table View */}
      {viewMode === "cards" ? (
        <section className="bank-cards-grid">
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
              <article className="bank-card-modern" key={account.id}>
                <div className="bank-card-top">
                  <span
                    className="bank-inst-badge"
                    style={{
                      backgroundColor: meta.bg,
                      borderColor: meta.border,
                      color: meta.color,
                    }}
                  >
                    {meta.label}
                  </span>
                  <span className="bank-unit-chip">{unitShort}</span>
                </div>

                <div className="bank-card-body">
                  <h3 className="bank-card-name">{str(account, "name")}</h3>
                  {account.isSangriaAccount ? (
                    <span className="bank-card-sangria">Caixa de Sangria</span>
                  ) : null}

                  <div className="bank-card-balance-box">
                    <span
                      className={`bank-balance-num ${
                        isPending
                          ? "is-pending"
                          : isNegative
                            ? "is-negative"
                            : "is-positive"
                      }`}
                    >
                      {isPending ? "R$ —" : currency(balance)}
                    </span>
                    {isPending && (
                      <span
                        style={{
                          fontSize: "11px",
                          color: "#94a3b8",
                          fontWeight: 600,
                        }}
                      >
                        Pendente
                      </span>
                    )}
                  </div>
                </div>

                <div className="bank-card-footer">
                  <span>
                    {str(account, "balanceDate")
                      ? `Atualizado: ${str(account, "balanceDate").split("-").reverse().join("/")}`
                      : "Sem saldo registrado"}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <button
                      type="button"
                      className="bank-quick-btn add"
                      onClick={() => setQuickModal({ account, mode: "add" })}
                      title="Incluir mais valor / somar a esta conta"
                    >
                      <Plus size={12} /> Incluir Valor
                    </button>
                    <button
                      type="button"
                      className="bank-quick-btn"
                      onClick={() => setQuickModal({ account, mode: "set" })}
                      title="Ajustar saldo total"
                    >
                      <Zap size={11} /> Saldo
                    </button>
                    <button
                      type="button"
                      className="bank-quick-btn"
                      onClick={() => setEditingBank(account)}
                      title="Configurações completas da conta"
                    >
                      <Pencil size={11} /> Detalhes
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {!filteredBalances.length && (
            <div
              className="bank-empty"
              style={{
                gridColumn: "1 / -1",
                padding: "36px",
                background: "#ffffff",
                borderRadius: "12px",
                border: "1px dashed #cbd5e1",
                textAlign: "center",
                color: "#64748b",
              }}
            >
              Nenhuma conta bancária encontrada com os filtros selecionados.
            </div>
          )}
        </section>
      ) : (
        <section
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.03)",
          }}
        >
          {filteredBalances.length > 0 ? (
            <table className="bank-table-modern">
              <thead>
                <tr>
                  <th style={{ width: "160px" }}>Instituição</th>
                  <th>Nome da Conta</th>
                  <th style={{ width: "160px" }}>Unidade</th>
                  <th style={{ textAlign: "right", width: "170px" }}>Saldo Atual</th>
                  <th style={{ textAlign: "center", width: "150px" }}>
                    Última Atualização
                  </th>
                  <th style={{ textAlign: "right", width: "190px" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
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
                    <tr key={account.id}>
                      <td>
                        <span
                          className="bank-inst-badge"
                          style={{
                            backgroundColor: meta.bg,
                            borderColor: meta.border,
                            color: meta.color,
                          }}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "2px",
                          }}
                        >
                          <strong style={{ fontSize: "13px", color: "#0f172a" }}>
                            {str(account, "name")}
                          </strong>
                          {account.isSangriaAccount && (
                            <span
                              className="bank-card-sangria"
                              style={{ width: "fit-content" }}
                            >
                              Caixa de Sangria
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="bank-unit-chip">
                          {unit ? getUnitShortName(str(unit, "name")) : "Matriz"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {isPending ? (
                          <span
                            style={{
                              color: "#94a3b8",
                              fontWeight: 600,
                              fontSize: "13px",
                            }}
                          >
                            —
                          </span>
                        ) : (
                          <strong
                            style={{
                              fontSize: "14px",
                              color: isNegative ? "#dc2626" : "#0f172a",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {currency(balance)}
                          </strong>
                        )}
                      </td>
                      <td
                        style={{
                          textAlign: "center",
                          fontSize: "12px",
                          color: "#64748b",
                        }}
                      >
                        {str(account, "balanceDate") ? (
                          str(account, "balanceDate").split("-").reverse().join("/")
                        ) : (
                          <span style={{ color: "#94a3b8" }}>Pendente</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <button
                            type="button"
                            className="bank-quick-btn add"
                            onClick={() => setQuickModal({ account, mode: "add" })}
                            title="Incluir mais valor nesta conta"
                          >
                            <Plus size={11} /> Incluir
                          </button>
                          <button
                            type="button"
                            className="bank-quick-btn"
                            onClick={() => setQuickModal({ account, mode: "set" })}
                            title="Ajustar saldo total"
                          >
                            <Zap size={11} /> Saldo
                          </button>
                          <button
                            type="button"
                            className="bank-quick-btn"
                            onClick={() => setEditingBank(account)}
                            title="Editar configurações da conta"
                          >
                            <Pencil size={11} /> Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bank-table-total-row">
                  <td colSpan={3}>
                    <strong>TOTAL ({filteredBalances.length} CONTAS FILTRADAS)</strong>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <strong style={{ fontSize: "15px", color: "#0f172a" }}>
                      {currency(filteredTotal)}
                    </strong>
                  </td>
                  <td
                    colSpan={2}
                    style={{
                      textAlign: "center",
                      fontSize: "12px",
                      color: "#64748b",
                    }}
                  >
                    {filteredBalances.filter((b) => b.balance !== null).length} com saldo
                    informado
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <div
              style={{
                padding: "36px",
                textAlign: "center",
                color: "#64748b",
                fontSize: "13px",
              }}
            >
              Nenhuma conta bancária encontrada com os filtros selecionados.
            </div>
          )}
        </section>
      )}

      {/* Daily Payments Summary Row */}
      <section className="bank-report-row">
        <div>
          <CalendarDays size={20} />
          <div>
            <span>PAGAMENTOS REGISTRADOS HOJE</span>
            <strong>{currency(paidTotal)}</strong>
            <small>{paidToday.length} pagamento(s) liquidado(s)</small>
          </div>
        </div>
        <button
          type="button"
          className="workspace-secondary"
          onClick={() => share("paid")}
          title="Compartilhar lista de pagamentos do dia no WhatsApp"
        >
          <MessageCircle size={15} /> Relatório de Pagamentos
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

      // 1. Update account balance and reference date
      const updatedAccount: RecordData = {
        ...targetAccount,
        balance: updatedBalance,
        balanceDate: date || dateToday(),
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
          createdAt: now,
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
        tenantId,
        unitId: unit,
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
        version: (account?.version || 0) + 1,
        createdAt: account?.createdAt || now,
        updatedAt: now,
        createdBy: account?.createdBy || user.uid,
        updatedBy: user.uid,
      };

      await saveManagement(updated, data);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a conta.");
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
        version: (account.version || 0) + 1,
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
                  required
                >
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
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="mg-modal-shade">
      <div className="mg-modal" role="dialog" aria-modal="true">
        <header>
          <h2>Pagamento instantâneo</h2>
          <button onClick={onClose}>×</button>
        </header>
        <form
          className="mg-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!user) return;
            setBusy(true);
            setError("");
            try {
              const form = new FormData(event.currentTarget);
              const proof = form.get("proof");
              const now = new Date().toISOString();
              const row: RecordData = {
                id: safeUUID(),
                kind: "transactions",
                tenantId,
                unitId: unit,
                version: 0,
                createdAt: now,
                updatedAt: now,
                createdBy: user.uid,
                updatedBy: user.uid,
                description: String(form.get("description")),
                date: String(form.get("date")),
                competence: String(form.get("date")).slice(0, 7),
                direction: "Saída",
                amount: Math.round(Number(form.get("amount")) * 100),
                bankAccountId: String(form.get("bank")),
                nature: "Operacional",
                categoryId: String(form.get("category")),
                paymentMethod: String(form.get("method")),
                externalId: safeUUID(),
                instantPayment: true,
              };
              if (proof instanceof File && proof.size) {
                const { nameFileForDrive, uploadFileToDrive } = await import(
                  "@/services/driveService"
                );
                const stored = await uploadFileToDrive(
                  nameFileForDrive(
                    proof,
                    `Pagamento instantâneo - ${row.description}`,
                  ),
                  "payment_proofs",
                );
                row.paymentProofFileId = stored.fileId;
                row.paymentProofFileName = stored.fileName;
              }
              await saveManagement(row, data);
              onSaved();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Não foi possível registrar.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="full">
            Descrição
            <input
              name="description"
              required
              placeholder="Ex.: compra emergencial, motoboy ou manutenção"
            />
          </label>
          <label>
            Unidade da despesa
            <select
              required
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            >
              <option value="">Selecione</option>
              {data.units
                .filter((u) => !u.archived)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {str(u, "name")}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Conta bancária de saída
            <select name="bank" required>
              <option value="">Selecione qualquer conta do grupo</option>
              {accounts.map((b) => {
                const u = data.units.find((unitItem) => unitItem.id === b.unitId);
                const uName = u ? str(u, "name") : "Matriz";
                return (
                  <option key={b.id} value={b.id}>
                    {str(b, "name")} ({str(b, "bank") || "Conta"} · {uName})
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            Data
            <input name="date" type="date" defaultValue={dateToday()} required />
          </label>
          <label>
            Valor
            <input name="amount" type="number" min="0.01" step="0.01" required />
          </label>
          <label>
            Categoria
            <select name="category" required>
              <option value="">Selecione</option>
              {data.categories
                .filter((c) => !c.archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {str(c, "name")}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Forma
            <select name="method" required>
              <option>PIX</option>
              <option>Transferência</option>
              <option>Débito automático</option>
              <option>Dinheiro</option>
              <option>Outros</option>
            </select>
          </label>
          <label className="full mg-file-field">
            Comprovante no Google Drive
            <input name="proof" type="file" accept=".pdf,image/*" />
          </label>
          {error && <p className="mg-error">{error}</p>}
          <footer>
            <button
              type="button"
              className="mg-button secondary"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button className="mg-button" disabled={busy}>
              {busy ? "Salvando…" : "Registrar pagamento"}
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
    <div className="mg-modal-shade">
      <div className="mg-modal" role="dialog" aria-modal="true">
        <header>
          <h2>Transferência entre bancos</h2>
          <button onClick={onClose}>×</button>
        </header>
        <form
          className="mg-form"
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
                throw new Error("Selecione contas diferentes.");
              const origin = accounts.find((a) => a.id === from);
              if (!origin) throw new Error("Conta de origem inválida.");
              const now = new Date().toISOString();
              const row: RecordData = {
                id: safeUUID(),
                kind: "bankTransfers",
                tenantId,
                unitId: origin.unitId,
                version: 0,
                createdAt: now,
                updatedAt: now,
                createdBy: user.uid,
                updatedBy: user.uid,
                fromBankId: from,
                toBankId: to,
                date: String(form.get("date")),
                amount: Math.round(Number(form.get("amount")) * 100),
                notes: String(form.get("notes") || ""),
              };
              await saveManagement(row, data);
              onSaved();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Não foi possível transferir.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Conta de origem
            <select name="from" required>
              <option value="">Selecione</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {str(a, "name")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Conta de destino
            <select name="to" required>
              <option value="">Selecione</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {str(a, "name")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Data
            <input name="date" type="date" defaultValue={dateToday()} required />
          </label>
          <label>
            Valor
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
            />
          </label>
          <label className="full">
            Observações
            <textarea name="notes" rows={3} />
          </label>
          {error && <p className="mg-error">{error}</p>}
          <footer>
            <button
              type="button"
              className="mg-button secondary"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button className="mg-button" disabled={busy}>
              {busy ? "Salvando…" : "Confirmar transferência"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
