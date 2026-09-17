"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  Download,
  Landmark,
  Paperclip,
  Search,
  User,
  X,
  Clock,
  Tag,
} from "lucide-react";
import { Database, RecordData, currency, dateToday, str } from "@/domain/management/model";
import { UserProfile, useAuth } from "@/contexts/AuthContext";
import { subscribeUsers } from "@/services/userService";
import { downloadFileFromDrive } from "@/services/driveService";

export interface BankStatementModalProps {
  account: RecordData;
  accounts: RecordData[];
  data: Database;
  currentBalanceValue: number | null;
  onClose: () => void;
}

interface StatementEntry {
  id: string;
  type: "inflow" | "outflow" | "base";
  amount: number; // cents
  date: string; // YYYY-MM-DD
  datetime: string; // ISO or date string
  title: string;
  categoryOrMethod?: string;
  authorName: string;
  proofFileId?: string;
  proofFileName?: string;
  details?: string;
}

function formatDateTimeBR(isoOrDate?: string): string {
  if (!isoOrDate) return "—";
  if (isoOrDate.includes("T")) {
    try {
      const d = new Date(isoOrDate);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, "0");
        const minutes = String(d.getMinutes()).padStart(2, "0");
        return `${day}/${month}/${year} às ${hours}:${minutes}`;
      }
    } catch {}
  }
  const parts = (isoOrDate || "").split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoOrDate;
}

export function BankStatementModal({
  account,
  accounts,
  data,
  currentBalanceValue,
  onClose,
}: BankStatementModalProps) {
  const { user, userProfile } = useAuth();
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [filterType, setFilterType] = useState<"all" | "inflow" | "outflow">("all");
  const [search, setSearch] = useState("");
  const [downloadingProofId, setDownloadingProofId] = useState<string | null>(null);

  // Assinar lista de usuários para resolver UIDs para nomes reais
  useEffect(() => {
    const unsub = subscribeUsers(setUsersList);
    return () => unsub();
  }, []);

  // Fechar com a tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const resolveUserName = (
    uid?: string,
    explicitName?: string,
  ): string => {
    if (explicitName && explicitName.trim() && !explicitName.startsWith("user-") && explicitName.length < 35) {
      return explicitName.trim();
    }
    if (!uid) return "Sistema";
    if (user && user.uid === uid) {
      return userProfile?.displayName || user.email?.split("@")[0] || "Você";
    }
    const foundUser = usersList.find((u) => u.uid === uid);
    if (foundUser) {
      return foundUser.displayName || foundUser.email?.split("@")[0] || "Usuário";
    }
    const emp = (data.employees || []).find((e) => e.id === uid);
    if (emp) {
      return str(emp, "name") || "Colaborador";
    }
    if (uid.includes("@")) {
      return uid.split("@")[0];
    }
    if (uid.length > 20) {
      return "Financeiro / Gestão";
    }
    return uid;
  };

  // Montar extrato completo de movimentações desta conta bancária
  const entries = useMemo<StatementEntry[]>(() => {
    const list: StatementEntry[] = [];
    const accountId = account.id;

    // 1. Transações bancárias (Baixas de contas a pagar, recebimentos, aportes, sangrias)
    const txs = (data.transactions || []).filter(
      (t) => !t.archived && t.bankAccountId === accountId,
    );

    for (const tx of txs) {
      const isInflow = tx.direction === "Entrada";
      let title = str(tx, "description");
      let categoryOrMethod = str(tx, "paymentMethod") || str(tx, "nature") || "";

      // Se for liquidação de conta a pagar, enriquecer com nome do fornecedor
      if (tx.obligationId && tx.obligationKind === "payables") {
        const payable = (data.payables || []).find((p) => p.id === tx.obligationId);
        if (payable) {
          const supp = (data.suppliers || []).find((s) => s.id === payable.supplierId);
          const suppName = supp ? str(supp, "name") : str(payable, "scannedSupplierName");
          if (suppName) {
            categoryOrMethod = categoryOrMethod ? `${categoryOrMethod} · ${suppName}` : suppName;
          }
        }
      }

      const explicitAuthor =
        str(tx, "operatorName") ||
        str(tx, "reviewedBy") ||
        str(tx, "conferredBy");

      list.push({
        id: tx.id,
        type: isInflow ? "inflow" : "outflow",
        amount: Number(tx.amount || 0),
        date: str(tx, "date") || dateToday(),
        datetime: str(tx, "createdAt") || str(tx, "date") || "",
        title: title || (isInflow ? "Entrada na conta" : "Saída da conta"),
        categoryOrMethod,
        authorName: resolveUserName(str(tx, "createdBy") || str(tx, "updatedBy"), explicitAuthor),
        proofFileId: str(tx, "paymentProofFileId") || undefined,
        proofFileName: str(tx, "paymentProofFileName") || undefined,
      });
    }

    // 2. Transferências entre contas do grupo
    const transfers = (data.bankTransfers || []).filter(
      (tr) => !tr.archived && (tr.fromBankId === accountId || tr.toBankId === accountId),
    );

    for (const tr of transfers) {
      const isSender = tr.fromBankId === accountId;
      const otherBankId = isSender ? tr.toBankId : tr.fromBankId;
      const otherBank = accounts.find((a) => a.id === otherBankId);
      const otherBankName = otherBank ? str(otherBank, "name") : "Outro banco";

      list.push({
        id: tr.id,
        type: isSender ? "outflow" : "inflow",
        amount: Number(tr.amount || 0),
        date: str(tr, "date") || dateToday(),
        datetime: str(tr, "createdAt") || str(tr, "date") || "",
        title: isSender
          ? `Transferência para ${otherBankName}`
          : `Transferência recebida de ${otherBankName}`,
        categoryOrMethod: "Transferência Interna",
        details: str(tr, "notes") || undefined,
        authorName: resolveUserName(str(tr, "createdBy") || str(tr, "updatedBy")),
      });
    }

    // 3. Saldo base inicial registrado (se existir)
    if (typeof account.balance === "number" && account.balanceDate) {
      list.push({
        id: `base-${account.id}`,
        type: "base",
        amount: Number(account.balance),
        date: str(account, "balanceDate"),
        datetime: str(account, "balanceUpdatedAt") || str(account, "updatedAt") || str(account, "balanceDate") || "",
        title: "Saldo Base Conciliado",
        categoryOrMethod: "Saldo Inicial / Ponto de Partida",
        authorName: resolveUserName(str(account, "updatedBy") || str(account, "createdBy")),
        details: "Saldo de referência registrado para conciliação",
      });
    }

    // Ordenar de forma cronológica decrescente (mais recentes primeiro)
    return list.sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return b.datetime.localeCompare(a.datetime);
    });
  }, [account, accounts, data, usersList, user, userProfile]);

  // Totais de entradas e saídas
  const totals = useMemo(() => {
    let inflowSum = 0;
    let outflowSum = 0;
    let inflowCount = 0;
    let outflowCount = 0;

    for (const entry of entries) {
      if (entry.type === "inflow") {
        inflowSum += entry.amount;
        inflowCount++;
      } else if (entry.type === "outflow") {
        outflowSum += entry.amount;
        outflowCount++;
      }
    }

    return {
      inflowSum,
      outflowSum,
      inflowCount,
      outflowCount,
      totalCount: entries.length,
    };
  }, [entries]);

  // Filtros aplicados
  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((item) => {
      if (filterType === "inflow" && item.type !== "inflow") return false;
      if (filterType === "outflow" && item.type !== "outflow") return false;
      if (q) {
        const text = `${item.title} ${item.authorName} ${item.categoryOrMethod || ""} ${item.details || ""}`.toLowerCase();
        return text.includes(q);
      }
      return true;
    });
  }, [entries, filterType, search]);

  const handleDownloadProof = async (fileId: string, fileName?: string) => {
    setDownloadingProofId(fileId);
    try {
      await downloadFileFromDrive(fileId, fileName || "comprovante");
    } catch (err) {
      alert("Não foi possível baixar o comprovante do Google Drive.");
    } finally {
      setDownloadingProofId(null);
    }
  };

  const unit = (data.units || []).find((u) => u.id === account.unitId);
  const unitName = unit ? str(unit, "name") : "Geral / Grupo";

  return (
    <div
      className="bank-quick-modal-shade"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bank-stmt-modal" role="dialog" aria-modal="true">
        {/* Header Minimalista */}
        <header className="bank-stmt-header">
          <div className="bank-stmt-title-group">
            <div className="bank-stmt-chips">
              <span className="bank-stmt-badge">{str(account, "bank") || "Banco"}</span>
              <span className="bank-stmt-unit">{unitName}</span>
            </div>
            <h3 className="bank-stmt-title">{str(account, "name")}</h3>
          </div>

          <div className="bank-stmt-balance-pill">
            <span className="bank-stmt-balance-label">Saldo Atual</span>
            <strong
              className={`bank-stmt-balance-val ${
                currentBalanceValue === null
                  ? ""
                  : currentBalanceValue < 0
                    ? "is-negative"
                    : "is-positive"
              }`}
            >
              {currentBalanceValue === null ? "R$ —" : currency(currentBalanceValue)}
            </strong>
          </div>

          <button
            type="button"
            className="bank-stmt-close-btn"
            onClick={onClose}
            title="Fechar extrato (ESC)"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>

        {/* Resumo Minimalista de Entradas e Saídas */}
        <section className="bank-stmt-summary-strip">
          <div className="bank-stmt-summary-box inflow">
            <div className="bank-stmt-summary-icon">
              <ArrowDownLeft size={16} />
            </div>
            <div className="bank-stmt-summary-info">
              <span>Total Entradas</span>
              <strong>+{currency(totals.inflowSum)}</strong>
              <small>{totals.inflowCount} {totals.inflowCount === 1 ? "registro" : "registros"}</small>
            </div>
          </div>

          <div className="bank-stmt-summary-box outflow">
            <div className="bank-stmt-summary-icon">
              <ArrowUpRight size={16} />
            </div>
            <div className="bank-stmt-summary-info">
              <span>Total Saídas</span>
              <strong>-{currency(totals.outflowSum)}</strong>
              <small>{totals.outflowCount} {totals.outflowCount === 1 ? "registro" : "registros"}</small>
            </div>
          </div>
        </section>

        {/* Filtros e Busca Minimalista */}
        <div className="bank-stmt-toolbar">
          <div className="bank-stmt-filter-tabs">
            <button
              type="button"
              className={`bank-stmt-tab ${filterType === "all" ? "active" : ""}`}
              onClick={() => setFilterType("all")}
            >
              Todas ({entries.length})
            </button>
            <button
              type="button"
              className={`bank-stmt-tab ${filterType === "inflow" ? "active inflow" : ""}`}
              onClick={() => setFilterType("inflow")}
            >
              Entradas ({totals.inflowCount})
            </button>
            <button
              type="button"
              className={`bank-stmt-tab ${filterType === "outflow" ? "active outflow" : ""}`}
              onClick={() => setFilterType("outflow")}
            >
              Saídas ({totals.outflowCount})
            </button>
          </div>

          <div className="bank-stmt-search-box">
            <Search size={13} className="bank-stmt-search-icon" />
            <input
              type="text"
              placeholder="Buscar por descrição, quem fez..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="bank-stmt-search-clear"
                onClick={() => setSearch("")}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Lista de Movimentações */}
        <div className="bank-stmt-body">
          {filteredEntries.length === 0 ? (
            <div className="bank-stmt-empty">
              <div className="bank-stmt-empty-icon">
                <Landmark size={26} />
              </div>
              <h4>Nenhuma movimentação encontrada</h4>
              <p>
                {search
                  ? "Nenhum lançamento corresponde ao termo buscado."
                  : "Esta conta ainda não possui entradas ou saídas registradas."}
              </p>
            </div>
          ) : (
            <div className="bank-stmt-list">
              {filteredEntries.map((item) => {
                const isBase = item.type === "base";
                const isInflow = item.type === "inflow";

                return (
                  <article
                    key={item.id}
                    className={`bank-stmt-item ${item.type}`}
                  >
                    {/* Ícone Minimalista */}
                    <div className={`bank-stmt-type-icon ${item.type}`}>
                      {isBase ? (
                        <Landmark size={14} />
                      ) : isInflow ? (
                        <ArrowDownLeft size={15} />
                      ) : (
                        <ArrowUpRight size={15} />
                      )}
                    </div>

                    {/* Descrição e Detalhes */}
                    <div className="bank-stmt-item-center">
                      <div className="bank-stmt-item-header">
                        <strong className="bank-stmt-item-title">{item.title}</strong>
                        {item.categoryOrMethod && (
                          <span className="bank-stmt-method-chip">
                            {item.categoryOrMethod}
                          </span>
                        )}
                      </div>

                      <div className="bank-stmt-item-meta">
                        {/* Data e Horário */}
                        <span className="bank-stmt-meta-date" title={item.datetime}>
                          <Clock size={11} /> {formatDateTimeBR(item.datetime || item.date)}
                        </span>

                        {/* QUEM FEZ */}
                        <span className="bank-stmt-meta-author" title="Responsável pelo lançamento">
                          <User size={11} /> {item.authorName}
                        </span>

                        {/* Detalhes extras se houver */}
                        {item.details && (
                          <span className="bank-stmt-meta-details">
                            {item.details}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Valor e Comprovante */}
                    <div className="bank-stmt-item-right">
                      <strong
                        className={`bank-stmt-val ${
                          isBase
                            ? "base"
                            : isInflow
                              ? "inflow"
                              : "outflow"
                        }`}
                      >
                        {isBase
                          ? currency(item.amount)
                          : `${isInflow ? "+" : "-"}${currency(item.amount)}`}
                      </strong>

                      {item.proofFileId && (
                        <button
                          type="button"
                          className="bank-stmt-proof-btn"
                          disabled={downloadingProofId === item.proofFileId}
                          onClick={() => handleDownloadProof(item.proofFileId!, item.proofFileName)}
                          title="Baixar comprovante anexado no Google Drive"
                        >
                          <Paperclip size={11} />
                          {downloadingProofId === item.proofFileId ? "Abrindo…" : "Comprovante"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* Rodapé Minimalista */}
        <footer className="bank-stmt-footer">
          <span className="bank-stmt-footer-hint">
            Exibindo {filteredEntries.length} {filteredEntries.length === 1 ? "movimentação" : "movimentações"}
          </span>
          <button type="button" className="bank-stmt-footer-close" onClick={onClose}>
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
}
