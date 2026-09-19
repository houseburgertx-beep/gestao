"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  Plus,
  X,
  Pencil,
  Paperclip,
  Download,
  Cloud,
  Zap,
  AlertTriangle,
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Truck,
  Phone,
  Mail,
  FileText,
  Repeat,
  ReceiptText,
  Search,
  Copy,
  KeyRound,
} from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  RecordData,
  Field,
  DEFINITIONS,
  Database,
  currency,
  dateToday,
  addDays,
  str,
  PRIMARY_OBLIGATION_TYPES,
  PRIMARY_PAYMENT_METHODS,
  normalizeObligationType,
} from "@/domain/management/model";
import { parseField, settlement } from "@/domain/management/operations";
import {
  Filters,
  outstanding,
  payableStatus,
} from "@/domain/management/engine";
import {
  saveManagement,
  queueManagementRecord,
  commitRecords,
  reverseSettlement,
} from "@/services/managementService";
import { Empty } from "./ManagementPage";
import {
  downloadFileFromDrive,
  nameFileForDrive,
  uploadFileToDrive,
} from "@/services/driveService";
import { backupPayablesSpreadsheet } from "@/services/payablesBackupService";
import { addNotificationToFirestore } from "@/services/firestoreService";
import { parseDebtDocument, parseEmployeeDocument } from "@/domain/management/documentParsing";
import { readDocumentText } from "@/services/documentTextReader";
import { FixedExpenseModal } from "./FixedExpenseModal";

const safeUUID = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 11) + Date.now().toString(36);

function readBrazilianAmount(value: string) {
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function documentFields(text: string, suppliers: RecordData[]) {
  const parsed = parseDebtDocument(text);
  const compact = text.replace(/\s+/g, " ").trim();
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const barcode = compact.match(/(?:\d[ .-]?){44,48}/)?.[0]?.replace(/\D/g, "") || "";
  const supplierDocument = compact.match(/(?:CNPJ|CPF)\s*[:.-]?\s*([\d./-]{11,18})/i)?.[1]?.replace(/\D/g, "") || "";
  const dateMatch = compact.match(/(?:vencimento|vence em|data de vencimento).{0,35}?(\d{2}[/-]\d{2}[/-]\d{4})/i);
  const dueDate = dateMatch?.[1] || dateMatch?.[0] || "";
  const valueMatch = compact.match(/(?:valor(?:\s+(?:do\s+)?documento|\s+a\s+pagar)?|total).{0,35}?(R?\$?\s*[\d.]+,\d{2})/i) || compact.match(/R?\$?\s*[\d.]+,\d{2}/);
  const supplier = suppliers.find((item) => {
    const name = str(item, "name").trim().toLowerCase();
    const document = str(item, "document").replace(/\D/g, "");
    return (supplierDocument && document === supplierDocument) || (name.length > 2 && compact.toLowerCase().includes(name));
  });
  const documentLine = lines.findIndex((line) => /CNPJ|CPF/i.test(line));
  const candidateName = documentLine > 0 ? lines.slice(Math.max(0, documentLine - 3), documentLine).reverse().find((line) => /[A-Za-zÀ-ÿ]{3}/.test(line) && !/banco|agência|beneficiário|pagador|sacado|boleto|nota fiscal/i.test(line)) : "";
  const supplierName = supplier ? str(supplier, "name") : candidateName || "";
  const rawObligation = parsed.obligationType;
  const isInvoiceOrBoleto = rawObligation === "Débito" || rawObligation === "Boleto";
  const obligationType = isInvoiceOrBoleto ? "Fornecedor / Mercadoria" : (rawObligation || "Fornecedor / Mercadoria");
  const paymentMethod = rawObligation === "Débito" ? "Débito automático" : "Boleto";
  return {
    documentNumber: parsed.documentNumber || (!parsed.isInvoice ? barcode : ""),
    dueDate: parsed.dueDate || (dueDate ? dueDate.replace(/(\d{2})[/-](\d{2})[/-](\d{4})/, "$3-$2-$1") : ""),
    amount: parsed.amount || (!parsed.isInvoice && valueMatch ? readBrazilianAmount(valueMatch[1] || valueMatch[0]) : 0),
    supplier,
    supplierName: parsed.supplierName || supplierName,
    supplierDocument: parsed.supplierDocument || supplierDocument,
    obligationType,
    paymentMethod,
  };
}
export const formatDateBR = (dateStr: string) => {
  if (!dateStr || dateStr === "DADO PENDENTE") return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  }
  return dateStr;
};

export const formatShortUnit = (unitName: string) => {
  if (!unitName || unitName === "DADO PENDENTE") return "—";
  return unitName.replace(/^House\s+190\s+/i, "").replace(/^House\s+/i, "");
};

const fieldDisplay = (r: RecordData, f: Field, db: Database) => {
  const v = r[f.key];
  if (v === null || v === undefined || v === "" || v === "DADO PENDENTE") return "—";
  if (f.type === "money") return currency(Number(v));
  if (f.type === "check") return v ? "Sim" : "Não";
  if (f.type === "date" || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v))) {
    return formatDateBR(String(v));
  }
  if (f.type === "ref") {
    const ref = db[f.ref!]?.find((x) => x.id === v);
    return ref
      ? String(ref.name || ref.description || ref.contract || ref.bank || v)
      : "—";
  }
  return String(v);
};
export function RecordTable({
  kind,
  filters,
  filterPeriod = true,
}: {
  kind: string;
  filters: Filters;
  filterPeriod?: boolean;
}) {
  const { data, errors, allowedUnit } = useManagement();
  const { userProfile, user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [editing, setEditing] = useState<RecordData | false | null>(null);
  const [fixedExpenseOpen, setFixedExpenseOpen] = useState(false);
  const [paying, setPaying] = useState<RecordData | null>(null);
  const [message, setMessage] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [copiedPixKey, setCopiedPixKey] = useState<string | null>(null);
  const def = {...DEFINITIONS[kind],label:kind === "revenues" ? "Lançamentos manuais de faturamento" : DEFINITIONS[kind].label};
  const canWrite =
    userProfile?.role === "admin" ||
    userProfile?.role === "accountant" ||
    (userProfile?.role === "manager" && kind === "actions") ||
    (userProfile?.role === "operator" && kind === "cashClosings");
  useEffect(() => {
    if (!["payables", "suppliers", "cashClosings", "cashConferences"].includes(kind)) return;
    const open = () => {
      setMessage("");
      setEditing(false);
    };
    const openFixed = () => {
      setMessage("");
      setFixedExpenseOpen(true);
    };
    const eventName = kind === "payables" ? "open-payable-form" : kind === "suppliers" ? "open-supplier-form" : `open-${kind}-form`;
    window.addEventListener(eventName, open);
    window.addEventListener("open-fixed-expense-form", openFixed);
    if (new URLSearchParams(window.location.search).get("novo") === "1") open();
    return () => {
      window.removeEventListener(eventName, open);
      window.removeEventListener("open-fixed-expense-form", openFixed);
    };
  }, [kind]);
  const unitIds = new Set(
    data.units
      .filter(
        (u) =>
          (!filters.unitId || u.id === filters.unitId) &&
          (!filters.companyId || u.companyId === filters.companyId) &&
          (!filters.brandId || u.brandId === filters.brandId) &&
          (!filters.group ||
            str(u, "groups")
              .split(",")
              .map((s) => s.trim())
              .includes(filters.group)),
      )
      .map((u) => u.id),
  );
  const payablesCounts = React.useMemo(() => {
    if (kind !== "payables") return null;
    const baseList = (data.payables || []).filter(
      (r) =>
        !r.archived &&
        (def.global ||
          !filters.unitId ||
          filters.unitId === "all" ||
          !r.unitId ||
          r.unitId === filters.unitId ||
          unitIds.has(r.unitId)),
    );
    const fixedList = baseList.filter(
      (r) => normalizeObligationType(str(r, "obligationType")) === "Despesa Fixa",
    );
    const fixedTotal = fixedList.reduce(
      (acc, r) => acc + outstanding(r, data, filters.today),
      0,
    );
    const todayList = baseList.filter(
      (r) =>
        outstanding(r, data, filters.today) > 0 &&
        str(r, "dueDate") === filters.today,
    );
    const overdueList = baseList.filter(
      (r) =>
        outstanding(r, data, filters.today) > 0 &&
        str(r, "dueDate") < filters.today,
    );
    const next7List = baseList.filter(
      (r) =>
        outstanding(r, data, filters.today) > 0 &&
        str(r, "dueDate") > filters.today &&
        str(r, "dueDate") <= addDays(filters.today, 7),
    );
    const paidList = baseList.filter(
      (r) => outstanding(r, data, filters.today) === 0,
    );
    const partialList = baseList.filter((r) => {
      const out = outstanding(r, data, filters.today);
      const total = Number(r.amount || 0);
      return out > 0 && out < total;
    });
    const partialTotal = partialList.reduce(
      (acc, r) => acc + outstanding(r, data, filters.today),
      0,
    );
    const todayTotal = todayList.reduce(
      (acc, r) => acc + outstanding(r, data, filters.today),
      0,
    );
    const overdueTotal = overdueList.reduce(
      (acc, r) => acc + outstanding(r, data, filters.today),
      0,
    );
    return {
      all: baseList.length,
      fixed: fixedList,
      fixedTotal,
      today: todayList,
      todayTotal,
      overdue: overdueList,
      overdueTotal,
      next7: next7List,
      partial: partialList,
      partialTotal,
      paid: paidList,
    };
  }, [data.payables, data.transactions, unitIds, filters.today, filters.unitId, kind, def.global]);

  const list = (data[kind] || [])
    .filter(
      (r) =>
        !r.archived &&
        (def.global ||
          !filters.unitId ||
          filters.unitId === "all" ||
          !r.unitId ||
          r.unitId === filters.unitId ||
          unitIds.has(r.unitId)) &&
        (!filters.channel || !r.channel || r.channel === filters.channel) &&
        (!search ||
          Object.values(r).some((v) =>
            String(v).toLocaleLowerCase().includes(search.toLocaleLowerCase()),
          )),
    )
    .filter(
      (r) =>
        !filterPeriod ||
        !def.dated ||
        ["payables", "receivables"].includes(kind) ||
        (str(r, def.dated).slice(0, 7) >= filters.start.slice(0, 7) &&
          str(r, def.dated).slice(0, 7) <= filters.end.slice(0, 7)),
    )
    .filter((r) => {
      if (kind !== "payables" || statusFilter === "Todos") return true;
      if (statusFilter === "Despesas Fixas") {
        return normalizeObligationType(str(r, "obligationType")) === "Despesa Fixa";
      }
      if (statusFilter === "Hoje") {
        return (
          outstanding(r, data, filters.today) > 0 &&
          str(r, "dueDate") === filters.today
        );
      }
      if (statusFilter === "Vencidos" || statusFilter === "Vencido") {
        return (
          outstanding(r, data, filters.today) > 0 &&
          str(r, "dueDate") < filters.today
        );
      }
      if (statusFilter === "Próximos 7 dias") {
        return (
          outstanding(r, data, filters.today) > 0 &&
          str(r, "dueDate") > filters.today &&
          str(r, "dueDate") <= addDays(filters.today, 7)
        );
      }
      if (statusFilter === "Parciais" || statusFilter === "Parcial") {
        const out = outstanding(r, data, filters.today);
        const total = Number(r.amount || 0);
        return out > 0 && out < total;
      }
      if (statusFilter === "Pagos" || statusFilter === "Pago") {
        return outstanding(r, data, filters.today) === 0;
      }
      const status = payableStatus(r, data, filters.today);
      return status === statusFilter;
    });
  const columns = (kind === "payables"
    ? ["dueDate", "description", "obligationType", "paymentMethod", "amount"]
        .map((key) => def.fields.find((field) => field.key === key))
        .filter(Boolean) as Field[]
    : def.fields
    .filter(
      (f) =>
        f.type !== "textarea" &&
        f.type !== "check" &&
        !(kind === "units" && ["companyId", "brandId"].includes(f.key)),
    )
    .slice(0, 5));
  return (
    <section className="mg-panel">
      <div className="mg-toolbar payables-clean-toolbar">
        <div className="payables-toolbar-title">
          <h2>{def.label}</h2>
          <span className="payables-count-pill">{list.length}</span>
        </div>
        <div className="payables-toolbar-search">
          <Search size={14} className="payables-search-icon" />
          <input
            aria-label={`Buscar em ${def.label}`}
            placeholder="Buscar registros…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="payables-search-clear"
              onClick={() => setSearch("")}
              title="Limpar busca"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="payables-toolbar-actions">
          {kind === "payables" && (
            <button
              type="button"
              className="payables-btn-fixed-minimal"
              disabled={!canWrite || !!errors[kind]}
              onClick={() => {
                setMessage("");
                setFixedExpenseOpen(true);
              }}
            >
              <Repeat size={14} />
              <span>Lançar Despesa Fixa</span>
            </button>
          )}
          <button
            type="button"
            className="payables-btn-new-minimal"
            disabled={!canWrite || !!errors[kind]}
            onClick={() => {
              setMessage("");
              setEditing(false);
            }}
          >
            <Plus size={15} />
            <span>{kind === "payables" ? "Nova conta" : "Novo registro"}</span>
          </button>
        </div>
      </div>
      {message && (
        <p role="status" className="mg-status-message">
          {message}
        </p>
      )}
      {kind === "payables" && payablesCounts && !bannerDismissed && (
        (payablesCounts.today.length > 0 || payablesCounts.overdue.length > 0) ? (
          <div className="payables-alert-section">
            <div className={`payables-banner-minimal ${payablesCounts.today.length > 0 ? "today" : "overdue"}`}>
              <div className="payables-banner-left">
                {payablesCounts.today.length > 0 ? (
                  <CalendarClock size={16} className="payables-banner-icon today" />
                ) : (
                  <AlertTriangle size={16} className="payables-banner-icon overdue" />
                )}
                <div className="payables-banner-info">
                  {payablesCounts.today.length > 0 ? (
                    <>
                      <span className="payables-banner-main">
                        <strong>
                          {payablesCounts.today.length === 1
                            ? "1 boleto vence hoje"
                            : `${payablesCounts.today.length} boletos vencem hoje`}
                        </strong>
                        <span className="payables-banner-value">({currency(payablesCounts.todayTotal)})</span>
                      </span>
                      {payablesCounts.overdue.length > 0 && (
                        <>
                          <span className="payables-banner-divider">·</span>
                          <span className="payables-banner-overdue">
                            +{payablesCounts.overdue.length} em atraso ({currency(payablesCounts.overdueTotal)})
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="payables-banner-main">
                      <strong>
                        {payablesCounts.overdue.length === 1
                          ? "1 conta vencida pendente"
                          : `${payablesCounts.overdue.length} contas vencidas pendentes`}
                      </strong>
                      <span className="payables-banner-value">({currency(payablesCounts.overdueTotal)})</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="payables-banner-right">
                {payablesCounts.today.length > 0 ? (
                  <button
                    type="button"
                    className={`payables-banner-action-btn ${statusFilter === "Hoje" ? "active" : ""}`}
                    onClick={() => setStatusFilter(statusFilter === "Hoje" ? "Todos" : "Hoje")}
                  >
                    {statusFilter === "Hoje" ? "Ver todos" : "Filtrar hoje"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`payables-banner-action-btn danger ${statusFilter === "Vencidos" ? "active" : ""}`}
                    onClick={() => setStatusFilter(statusFilter === "Vencidos" ? "Todos" : "Vencidos")}
                  >
                    {statusFilter === "Vencidos" ? "Ver todos" : "Ver vencidos"}
                  </button>
                )}
                <button
                  type="button"
                  className="payables-banner-close-btn"
                  onClick={() => setBannerDismissed(true)}
                  title="Ocultar aviso"
                  aria-label="Ocultar aviso"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        ) : null
      )}
      {kind === "payables" && payablesCounts && (
        <nav className="payables-table-filters" aria-label="Filtrar contas por situação">
          <button
            type="button"
            className={statusFilter === "Todos" ? "active" : ""}
            onClick={() => setStatusFilter("Todos")}
          >
            Todos <span className="payables-tab-count">{payablesCounts.all}</span>
          </button>
          <button
            type="button"
            className={`payables-tab-fixed ${statusFilter === "Despesas Fixas" ? "active" : ""}`}
            onClick={() => setStatusFilter("Despesas Fixas")}
          >
            📌 Despesas Fixas <span className="payables-tab-count">{payablesCounts.fixed.length}</span>
          </button>
          <button
            type="button"
            className={`${statusFilter === "Hoje" ? "active" : ""} ${payablesCounts.today.length > 0 ? "has-today" : ""}`}
            onClick={() => setStatusFilter("Hoje")}
          >
            Hoje{" "}
            <span className={`payables-tab-count ${payablesCounts.today.length > 0 ? "count-warning" : ""}`}>
              {payablesCounts.today.length}
            </span>
          </button>
          <button
            type="button"
            className={`${statusFilter === "Vencidos" ? "active" : ""} ${payablesCounts.overdue.length > 0 ? "has-overdue" : ""}`}
            onClick={() => setStatusFilter("Vencidos")}
          >
            Vencidos{" "}
            <span className={`payables-tab-count ${payablesCounts.overdue.length > 0 ? "count-danger" : ""}`}>
              {payablesCounts.overdue.length}
            </span>
          </button>
          <button
            type="button"
            className={statusFilter === "Próximos 7 dias" ? "active" : ""}
            onClick={() => setStatusFilter("Próximos 7 dias")}
          >
            Próximos 7 dias <span className="payables-tab-count">{payablesCounts.next7.length}</span>
          </button>
          <button
            type="button"
            className={`payables-tab-partial ${statusFilter === "Parciais" ? "active" : ""}`}
            onClick={() => setStatusFilter("Parciais")}
          >
            ⏳ Parciais <span className="payables-tab-count">{payablesCounts.partial.length}</span>
          </button>
          <button
            type="button"
            className={statusFilter === "Pagos" ? "active" : ""}
            onClick={() => setStatusFilter("Pagos")}
          >
            Pagos <span className="payables-tab-count">{payablesCounts.paid.length}</span>
          </button>
        </nav>
      )}
      {kind === "payables" && statusFilter === "Despesas Fixas" && payablesCounts && (
        <div className="payables-fixed-banner">
          <div className="payables-fixed-banner-left">
            <div className="payables-fixed-banner-icon">
              <Repeat size={18} />
            </div>
            <div>
              <strong>Visualizando exclusivamente Despesas Fixas</strong>
              <p>
                {payablesCounts.fixed.length} conta(s) fixa(s) encontrada(s) · Total em aberto:{" "}
                <strong>{currency(payablesCounts.fixedTotal)}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="workspace-primary payables-fixed-banner-btn"
            onClick={() => setFixedExpenseOpen(true)}
          >
            <Repeat size={14} /> + Nova Despesa Fixa
          </button>
        </div>
      )}
      {kind === "payables" && statusFilter === "Parciais" && payablesCounts && (
        <div className="payables-fixed-banner" style={{ background: "#fffbeb", borderColor: "#fde68a" }}>
          <div className="payables-fixed-banner-left">
            <div className="payables-fixed-banner-icon" style={{ background: "#fef3c7", color: "#d97706" }}>
              <Zap size={18} />
            </div>
            <div>
              <strong style={{ color: "#92400e" }}>Visualizando Contas com Pagamento Parcial em Andamento</strong>
              <p style={{ color: "#b45309" }}>
                {payablesCounts.partial.length} conta(s) com abatimentos parciais registrados · Saldo restante a quitar:{" "}
                <strong>{currency(payablesCounts.partialTotal)}</strong>
              </p>
            </div>
          </div>
        </div>
      )}
      {list.length ? (
        <div className="mg-table-wrap">
          {kind === "payables" ? (
            <table className="mg-table mg-table-payables">
              <thead>
                <tr>
                  <th style={{ width: "110px", minWidth: "110px" }}>Vencimento</th>
                  <th>Conta / Descrição</th>
                  <th style={{ width: "135px", minWidth: "135px" }}>Unidade</th>
                  <th style={{ width: "125px", minWidth: "125px", textAlign: "right" }}>Valor</th>
                  <th style={{ width: "115px", minWidth: "115px", textAlign: "center" }}>Status</th>
                  <th style={{ width: "220px", minWidth: "220px", textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const outAmt = outstanding(r, data, filters.today);
                  const totalAmt = Number(r.amount || 0);
                  const paidAmt = Math.max(0, totalAmt - outAmt);
                  const isPaid = outAmt === 0;
                  const isPartial = outAmt > 0 && paidAmt > 0;
                  const isToday = str(r, "dueDate") === filters.today;
                  const isOverdue = str(r, "dueDate") < filters.today && outAmt > 0;
                  const statusText = isPaid
                    ? "Pago"
                    : isPartial
                      ? "Parcial"
                      : isToday
                        ? "Vence hoje"
                        : isOverdue
                          ? "Vencido"
                          : "A vencer";
                  const statusClass = isPaid
                    ? "paid"
                    : isPartial
                      ? "partial"
                      : isToday
                        ? "today"
                        : isOverdue
                          ? "overdue"
                          : "pending";
                  const unit = data.units.find((u) => u.id === r.unitId);
                  const rawObligation = str(r, "obligationType");
                  const normObligation = normalizeObligationType(rawObligation);
                  const isFixed = normObligation === "Despesa Fixa";
                  const isTax = normObligation === "Imposto / Tributo" || r.sourceKind === "taxes";
                  const methodStr = str(r, "paymentMethod");
                  const hasMethod = Boolean(methodStr && methodStr !== "DADO PENDENTE");
                  const proof = data.transactions.find((item) => item.obligationId === r.id && item.paymentProofFileId && !item.reversalOf);
                  const isExpanded = expandedId === r.id;

                  return (
                    <React.Fragment key={r.id}>
                      <tr id={`record-${r.id}`} className={`payables-row ${statusClass} ${isExpanded ? "is-expanded" : ""}`}>
                        <td>
                          <div className="payables-due-cell">
                            <strong>{formatDateBR(str(r, "dueDate"))}</strong>
                          </div>
                        </td>
                        <td>
                          <div className="payables-desc-cell">
                            <span className="payables-desc-title" title={str(r, "description")}>
                              {str(r, "description")}
                            </span>
                            <div className="payables-badges-row">
                              <span
                                className={`payables-badge-type ${isFixed ? "badge-type-fixed" : isTax ? "badge-type-tax" : "badge-type-default"}`}
                                title={`Tipo de Conta: ${normObligation}`}
                              >
                                {isFixed ? "📌 Despesa Fixa" : normObligation}
                              </span>
                              {hasMethod && (
                                <span className="payables-badge-method" title={`Forma de Pagamento: ${methodStr}`}>
                                  {methodStr === "PIX" ? "⚡ PIX" : methodStr === "Boleto" ? "📄 Boleto" : methodStr === "Débito automático" ? "🏦 Débito auto" : methodStr}
                                </span>
                              )}
                              {(() => {
                                const pixKey = str(r, "pixKey") || (str(r, "notes").match(/Chave PIX:\s*([^\s\n\r]+)/i)?.[1] || "");
                                if (!pixKey) return null;
                                return (
                                  <button
                                    type="button"
                                    className="payables-badge-pix-key"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(pixKey);
                                      setCopiedPixKey(pixKey);
                                      setTimeout(() => setCopiedPixKey(null), 2000);
                                    }}
                                    title={`Chave PIX: ${pixKey} (Clique para copiar)`}
                                  >
                                    <KeyRound size={11} />
                                    <span>PIX: <strong>{pixKey}</strong></span>
                                    <Copy size={10} className="payables-copy-icon" />
                                    {copiedPixKey === pixKey && <span className="payables-copied-feedback">Copiado!</span>}
                                  </button>
                                );
                              })()}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="payables-unit-badge" title={String(unit?.name || "Unidade")}>
                            {formatShortUnit(String(unit?.name || ""))}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="payables-amount-cell">
                            <strong className="payables-amount-val">
                              {currency(totalAmt)}
                            </strong>
                            {isPartial && (
                              <span
                                className="payables-amount-partial-pill"
                                title={`Valor total: ${currency(totalAmt)} · Já abatido: ${currency(paidAmt)} · Saldo restante: ${currency(outAmt)}`}
                              >
                                Restam: {currency(outAmt)} <small>(Pago: {currency(paidAmt)})</small>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="payables-cell-status">
                          <span className={`mg-status-badge ${statusClass}`}>
                            {statusText}
                          </span>
                        </td>
                        <td className="payables-cell-actions">
                          <div className="payables-actions-cluster">
                            {r.documentFileId && (
                              <button
                                className="mg-icon-act-btn"
                                title={str(r, "documentFileName") || "Baixar boleto"}
                                onClick={() =>
                                  downloadFileFromDrive(
                                    str(r, "documentFileId"),
                                    str(r, "documentFileName") || "boleto",
                                  )
                                }
                              >
                                <Download size={13} />
                                <span>Boleto</span>
                              </button>
                            )}
                            {proof && (
                              <button
                                className="mg-icon-act-btn"
                                title="Baixar comprovante"
                                onClick={() =>
                                  downloadFileFromDrive(
                                    str(proof, "paymentProofFileId"),
                                    str(proof, "paymentProofFileName") || "comprovante",
                                  )
                                }
                              >
                                <Download size={13} />
                                <span>Recibo</span>
                              </button>
                            )}
                            {outAmt > 0 && (
                              <button
                                className={`mg-pay-act-btn ${isPartial ? "partial-act" : ""}`}
                                disabled={!canWrite}
                                onClick={() => setPaying(r)}
                                title={isPartial ? `Pagar saldo restante de ${currency(outAmt)}` : "Registrar pagamento"}
                              >
                                <Zap size={12} /> {isPartial ? "Pagar restante" : "Pagar"}
                              </button>
                            )}
                            <button
                              className="mg-mini-btn"
                              disabled={!canWrite || Boolean(r.obligationId)}
                              title="Editar conta"
                              onClick={() =>
                                setEditing(
                                  r.sourceKind
                                    ? data[str(r, "sourceKind")]?.find((x) => x.id === r.sourceId) || r
                                    : r,
                                )
                              }
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              className="mg-mini-btn danger"
                              disabled={!canWrite}
                              title="Excluir conta"
                              onClick={async () => {
                                if (!user) return;
                                if (data.transactions.some((item) => item.obligationId === r.id && !item.reversalOf && !data.transactions.some((other) => other.reversalOf === item.id))) {
                                  setMessage("Esta conta tem pagamentos registrados. Estorne os pagamentos antes de excluir."); return;
                                }
                                if (!confirm("Excluir esta conta do painel? O histórico e o anexo serão preservados.")) return;
                                try {
                                  const rows = await saveManagement({...r, updatedBy:user.uid, updatedAt:new Date().toISOString()}, data, true);
                                  void backupPayablesSpreadsheet(data, rows).catch(console.warn);
                                  setMessage("Conta excluída. Histórico preservado.");
                                } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível excluir. A conta foi mantida."); }
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                            <button
                              className={`mg-mini-btn toggle-details ${isExpanded ? "active" : ""}`}
                              title={isExpanded ? "Ocultar detalhes" : "Ver detalhes"}
                              onClick={() => setExpandedId(isExpanded ? null : r.id)}
                            >
                              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="payables-details-row">
                          <td colSpan={6} style={{ padding: 0 }}>
                            <div className="payables-details-container">
                              <div className="payables-details-grid">
                                {def.fields.map((f) => (
                                  <div key={f.key} className="payables-detail-item">
                                    <span className="payables-detail-label">{f.label}</span>
                                    <span className="payables-detail-value">{fieldDisplay(r, f, data)}</span>
                                  </div>
                                ))}
                                <div className="payables-detail-item">
                                  <span className="payables-detail-label">Identificação ID</span>
                                  <span className="payables-detail-value monospace">{r.id}</span>
                                </div>
                                <div className="payables-detail-item">
                                  <span className="payables-detail-label">Última atualização</span>
                                  <span className="payables-detail-value">{formatDateBR(str(r, "updatedAt").slice(0, 10))}</span>
                                </div>
                              </div>

                              {(() => {
                                const settlements = data.transactions.filter(
                                  (t) => !t.archived && t.obligationId === r.id && !t.reversalOf,
                                );
                                if (!settlements.length) return null;
                                return (
                                  <div className="payables-settlements-history">
                                    <h4>
                                      <ReceiptText size={15} /> Histórico de Pagamentos e Abatimentos ({settlements.length})
                                    </h4>
                                    <table className="payables-settlements-table">
                                      <thead>
                                        <tr>
                                          <th>Data</th>
                                          <th>Valor Pago</th>
                                          <th>Conta Bancária</th>
                                          <th>Comprovante</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {settlements.map((tx) => {
                                          const bank = data.bankAccounts.find((b) => b.id === tx.bankAccountId);
                                          return (
                                            <tr key={tx.id}>
                                              <td>{formatDateBR(str(tx, "date"))}</td>
                                              <td><strong style={{ color: "#16a34a" }}>{currency(Number(tx.amount || 0))}</strong></td>
                                              <td>{bank ? str(bank, "name") : "Conta padrão"}</td>
                                              <td>
                                                {tx.paymentProofFileId ? (
                                                  <button
                                                    type="button"
                                                    className="mg-icon-act-btn"
                                                    title="Baixar comprovante deste abatimento"
                                                    onClick={() =>
                                                      downloadFileFromDrive(
                                                        str(tx, "paymentProofFileId"),
                                                        str(tx, "paymentProofFileName") || "comprovante",
                                                      )
                                                    }
                                                  >
                                                    <Download size={12} /> Recibo
                                                  </button>
                                                ) : (
                                                  <span style={{ color: "#94a3b8" }}>—</span>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                );
                              })()}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="mg-table">
              <thead>
                <tr>
                  {!def.global && <th>Unidade</th>}
                  {columns.map((f) => (
                    <th key={f.key}>{f.label}</th>
                  ))}
                  {kind === "receivables" && (
                    <>
                      <th>Em aberto</th>
                      <th>Status</th>
                    </>
                  )}
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <React.Fragment key={r.id}>
                    <tr id={`record-${r.id}`}>
                      {!def.global && (
                        <td>
                          {formatShortUnit(
                            String(data.units.find((u) => u.id === r.unitId)?.name || "—")
                          )}
                        </td>
                      )}
                      {columns.map((f) => (
                        <td key={f.key}>{fieldDisplay(r, f, data)}</td>
                      ))}
                      {kind === "receivables" && (
                        <>
                          <td>{currency(outstanding(r, data, filters.today))}</td>
                          <td>
                            <span
                              className={
                                "mg-tag " +
                                (payableStatus(r, data, filters.today) === "Pago"
                                  ? "good"
                                  : payableStatus(r, data, filters.today) === "Vencido"
                                  ? "bad"
                                  : "")
                              }
                            >
                              {payableStatus(r, data, filters.today) === "Pago"
                                ? "Recebido"
                                : payableStatus(r, data, filters.today)}
                            </span>
                          </td>
                        </>
                      )}
                      <td>
                        <div className="flex gap-2">
                          <button
                            className="mg-button secondary"
                            disabled={!canWrite || Boolean(r.obligationId)}
                            onClick={() =>
                              setEditing(
                                r.sourceKind
                                  ? data[str(r, "sourceKind")]?.find(
                                      (x) => x.id === r.sourceId,
                                    ) || r
                                  : r,
                              )
                            }
                          >
                            <Pencil size={13} /> Editar
                          </button>
                          {canWrite && !r.obligationId && (
                            <button
                              className="mg-button danger"
                              title={kind === "suppliers" ? "Excluir fornecedor" : "Excluir registro"}
                              onClick={async () => {
                                if (!user) return;
                                if (kind === "suppliers") {
                                  const linked = (data.payables || []).filter(
                                    (p) => !p.archived && p.supplierId === r.id
                                  );
                                  if (linked.length > 0) {
                                    const hasOpen = linked.some(
                                      (p) => outstanding(p, data, filters.today) > 0
                                    );
                                    if (hasOpen) {
                                      alert(
                                        `Não é possível excluir o fornecedor "${r.name}": existem ${linked.length} conta(s) vinculadas, sendo que algumas ainda estão em aberto. Remova ou quite as contas antes de excluir.`
                                      );
                                      return;
                                    }
                                  }
                                }
                                const name = r.name || r.description || "este registro";
                                if (!confirm(`Tem certeza que deseja excluir "${name}"?`)) return;
                                try {
                                  await saveManagement(
                                    { ...r, archived: true, updatedBy: user.uid, updatedAt: new Date().toISOString() },
                                    data,
                                    true
                                  );
                                  setMessage(`"${name}" foi excluído com sucesso.`);
                                } catch (error) {
                                  setMessage(error instanceof Error ? error.message : "Não foi possível excluir.");
                                }
                              }}
                            >
                              <Trash2 size={13} /> Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={10}>
                        <details>
                          <summary>Detalhes e origem</summary>
                          <div className="mg-form py-3">
                            {def.fields.map((f) => (
                              <div key={f.key}>
                                <span className="mg-label">{f.label}</span>
                                <p>{fieldDisplay(r, f, data)}</p>
                              </div>
                            ))}
                          </div>
                        </details>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <Empty
          text={
            errors[kind] ? "DADO PENDENTE" : "Nenhum registro neste recorte"
          }
          detail={
            errors[kind]
              ? "A base ainda não está disponível."
              : "Cadastre informações reais. Ausência de registros não confirma saldo zero."
          }
        />
      )}
      {editing !== null && (
        <RecordForm
          kind={editing ? editing.kind : kind}
          record={editing || undefined}
          suggestedUnit={
            filters.unitId || (allowedUnit === "all" ? "" : allowedUnit)
          }
          onClose={() => setEditing(null)}
          onSaved={(savedMessage) => {
            setEditing(null);
            setMessage(savedMessage || "Registro salvo e confirmado na nuvem.");
          }}
        />
      )}
      {paying && (
        <SettlementForm
          record={paying}
          onClose={() => setPaying(null)}
          onSaved={(savedMessage) => {
            setPaying(null);
            setMessage(savedMessage || "Baixa registrada na obrigação e no caixa.");
          }}
        />
      )}
      {fixedExpenseOpen && (
        <FixedExpenseModal
          initialUnitId={filters.unitId || (allowedUnit === "all" ? "" : allowedUnit)}
          onClose={() => setFixedExpenseOpen(false)}
          onSaved={(savedMessage) => {
            setFixedExpenseOpen(false);
            setStatusFilter("Despesas Fixas");
            setMessage(savedMessage || "Despesa fixa cadastrada com sucesso!");
          }}
        />
      )}
    </section>
  );
}
function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    root.current?.querySelector<HTMLElement>("button,input,select")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const focusable = Array.from(
          root.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input,select,textarea,a[href]",
          ) || [],
        );
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div className="mg-modal-shade">
      <div
        className="mg-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={root}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" aria-label="Fechar" onClick={onClose}>
            <X size={22} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function RecordForm({
  kind,
  record,
  suggestedUnit = "",
  onClose,
  onSaved,
}: {
  kind: string;
  record?: RecordData;
  suggestedUnit?: string;
  onClose: () => void;
  onSaved: (message?: string) => void;
}) {
  const { data, tenantId, allowedUnit } = useManagement();
  const { user } = useAuth();
  const def = DEFINITIONS[kind];
  const [id] = useState(() => record?.id || safeUUID());
  const [unit, setUnit] = useState(record?.unitId || suggestedUnit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [readingDocument, setReadingDocument] = useState(false);
  const [documentReadMessage, setDocumentReadMessage] = useState("");
  const [scannedSupplier, setScannedSupplier] = useState({ name: "", document: "" });
  const [supplierDraftOpen, setSupplierDraftOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!supplierDraftOpen) return;
    const field = formRef.current?.elements.namedItem("supplierId") as HTMLSelectElement | null;
    if (field) field.value = "__new_supplier__";
  }, [supplierDraftOpen, scannedSupplier]);
  const scanPayableDocument = async (file: File) => {
    setReadingDocument(true);
    setDocumentReadMessage("Lendo documento…");
    try {
      const found = documentFields(await readDocumentText(file), data.suppliers);
      setScannedSupplier({ name: "", document: "" });
      setSupplierDraftOpen(false);
      const form = formRef.current;
      if (!form) return;
      const setValue = (name: string, value: string) => {
        const field = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
        if (field && value) field.value = value;
      };
      setValue("documentNumber", found.documentNumber);
      setValue("dueDate", found.dueDate);
      if (found.amount) {
        setValue("amount", (found.amount / 100).toFixed(2));
        setValue("originalAmount", (found.amount / 100).toFixed(2));
      }
      if (found.supplier) {
        setValue("supplierId", found.supplier.id);
        setValue("description", `Documento de ${str(found.supplier, "name")}`);
      } else if (found.supplierName) {
        setScannedSupplier({ name: found.supplierName, document: found.supplierDocument });
        setSupplierDraftOpen(true);
        setValue("description", `Documento de ${found.supplierName}`);
      } else {
        const supplierField = form.elements.namedItem("supplierId") as HTMLSelectElement | null;
        if (supplierField) supplierField.value = "";
      }
      setValue("obligationType", found.obligationType);
      const filled = [(found.supplier || found.supplierName) && "fornecedor", found.dueDate && "vencimento", found.amount && "valor", found.documentNumber && "código"].filter(Boolean);
      setDocumentReadMessage(filled.length ? `Preenchido automaticamente: ${filled.join(", ")}. Confira antes de salvar.` : "Não encontrei os dados com segurança. Preencha os campos manualmente.");
    } catch (error) {
      setDocumentReadMessage(error instanceof Error ? error.message : "Não foi possível ler. Envie uma imagem nítida ou um PDF com texto.");
    } finally {
      setReadingDocument(false);
    }
  };
  const scanEmployeeDocument = async (file: File) => {
    setReadingDocument(true);
    setDocumentReadMessage("Lendo ficha de registro de empregado…");
    try {
      const text = await readDocumentText(file);
      const parsed = parseEmployeeDocument(text);
      const form = formRef.current;
      if (!form) return;
      const setValue = (name: string, value: string) => {
        const field = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
        if (field && value) field.value = value;
      };
      setValue("name", parsed.name);
      setValue("role", parsed.role);
      setValue("department", parsed.department);
      setValue("admissionDate", parsed.admissionDate);
      if (parsed.salaryCents) {
        setValue("salary", (parsed.salaryCents / 100).toFixed(2));
      }
      setValue("status", "Ativo");
      setValue("notes", parsed.notes);
      if (parsed.unitId) {
        setValue("unitId", parsed.unitId);
      }
      const filled = [
        parsed.name && "nome",
        parsed.role && "cargo",
        parsed.department && "setor",
        parsed.admissionDate && "admissão",
        parsed.salary && "salário",
      ].filter(Boolean);
      setDocumentReadMessage(
        filled.length
          ? `Preenchido automaticamente: ${filled.join(", ")}. Confira antes de salvar.`
          : "Não encontrei os dados com segurança. Preencha os campos manualmente."
      );
    } catch (error) {
      setDocumentReadMessage(
        error instanceof Error ? error.message : "Não foi possível ler. Envie um PDF ou foto nítida do documento."
      );
    } finally {
      setReadingDocument(false);
    }
  };
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError("");
    let pendingRecord: RecordData | null = null;
    try {
      const form = new FormData(e.currentTarget);
      const now = new Date().toISOString();
      const next: RecordData = {
        ...record,
        id,
        kind,
        tenantId,
        unitId: def.global ? "" : unit,
        version: record?.version || 0,
        createdAt: record?.createdAt || now,
        updatedAt: now,
        createdBy: record?.createdBy || user.uid,
        updatedBy: user.uid,
      };
      for (const field of def.fields)
        next[field.key] = parseField(field, form.get(field.key));
      if (kind === "payables" && next.supplierId === "__new_supplier__") {
        if (!scannedSupplier.name.trim()) throw new Error("Informe o nome do fornecedor.");
        next.supplierId = "";
        next.scannedSupplierName = scannedSupplier.name;
        next.scannedSupplierDocument = scannedSupplier.document;
      }
      if (kind === "units") next.unitId = "";
      if (kind === "payables") {
        next.competence = next.competence || str(next, "dueDate").slice(0, 7);
        next.status = next.status || "Pendente";
        next.nature = next.nature || "Operacional";
        next.originalAmount = next.originalAmount || next.amount;
        const document = form.get("documentFile");
        if (document instanceof File && document.size > 0) {
          const named = nameFileForDrive(
            document,
            `${str(next, "description")} - ${str(next, "dueDate")}`,
          );
          const stored = await uploadFileToDrive(named, "payment_proofs");
          next.documentFileId = stored.fileId;
          next.documentFileName = stored.fileName;
          next.documentMimeType = stored.mimeType;
          next.documentSize = stored.size;
        }
      }
      pendingRecord = next;
      const savedRows = await saveManagement(next, data);
      if (savedRows.some((row) => row.kind === "payables")) {
        const dueDate = str(next, "dueDate");
        const today = dateToday();
        if (!record || (dueDate && dueDate <= today)) {
          void addNotificationToFirestore({
            type: str(next, "obligationType") === "Imposto" ? "tax" : "payable",
            title: dueDate < today ? "Conta já vencida incluída" : dueDate === today ? "Conta vence hoje" : "Nova conta cadastrada",
            details: [{label:"Conta",value:str(next,"description")},{label:"Fornecedor",value:String(data.suppliers.find((item) => item.id === next.supplierId)?.name || scannedSupplier.name || "DADO PENDENTE")},{label:"Valor",value:currency(Number(next.amount || 0))},{label:"Vencimento",value:dueDate.split("-").reverse().join("/") || "DADO PENDENTE"},{label:"Unidade",value:String(data.units.find((item) => item.id === next.unitId)?.name || "DADO PENDENTE")}],
            message: `${str(next, "description")} · ${currency(Number(next.amount || 0))} · vencimento ${dueDate.split("-").reverse().join("/")}.`,
            link: "/contas-a-pagar/",
            severity: dueDate < today ? "danger" : dueDate === today ? "warning" : "info",
            read: false,
            timestamp: new Date().toISOString(),
          });
        }
        void backupPayablesSpreadsheet(data, savedRows).catch((error) => console.warn("Backup em planilha pendente:", error));
        onSaved("Conta salva. E-mail e backup estão sendo processados em segundo plano.");
      } else onSaved();
    } catch (err) {
      const message = err instanceof Error ? `${err.name} ${err.message}` : "";
      if (pendingRecord && /quota|resource-exhausted/i.test(message)) {
        queueManagementRecord(pendingRecord);
        onSaved("Conta guardada neste dispositivo. A sincronização será concluída automaticamente quando o Firebase liberar a cota.");
      } else setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };
  const payableMainFields = new Set([
    "obligationType",
    "description",
    "supplierId",
    "dueDate",
    "originalAmount",
    "amount",
    "paymentMethod",
    "documentNumber",
  ]);
  const renderField = (field: Field) => {
    const value = record?.[field.key];
    const inputType =
      field.type === "money" || field.type === "number" || field.type === "percent"
        ? "number"
        : field.type === "date"
          ? "date"
          : field.type === "month"
            ? "month"
            : "text";
    return field.type === "check" ? (
      <label key={field.key} className="check-field full">
        <input type="checkbox" name={field.key} defaultChecked={value === true} />
        {field.label}
      </label>
    ) : (
      <label key={field.key} className={field.type === "textarea" ? "full" : ""}>
        {field.label}{field.required ? " *" : ""}
        {field.type === "select" ? (
          (() => {
            let options = field.options;
            if (kind === "payables" && field.key === "obligationType") {
              options = Array.from(
                new Set([
                  ...PRIMARY_OBLIGATION_TYPES,
                  ...(value ? [String(value)] : []),
                ]),
              );
            } else if (kind === "payables" && field.key === "paymentMethod") {
              options = Array.from(
                new Set([
                  ...PRIMARY_PAYMENT_METHODS,
                  ...(value ? [String(value)] : []),
                ]),
              );
            }
            return (
              <select
                name={field.key}
                required={field.required}
                defaultValue={String(
                  value || (field.key === "status" ? "Pendente" : ""),
                )}
              >
                <option value="">Selecione</option>
                {options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            );
          })()
        ) : field.type === "ref" ? (
          <select name={field.key} required={field.required} defaultValue={String(value || "")}>
            <option value="">Selecione</option>
            {field.key === "supplierId" && supplierDraftOpen && (
              <option value="__new_supplier__">{scannedSupplier.name || "Novo fornecedor"} — cadastrar ao salvar</option>
            )}
            {data[field.ref!]
              ?.filter((item) => !item.archived && (DEFINITIONS[field.ref!].global || item.unitId === unit))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {String(item.name || item.description || item.contract || item.bank || item.id)}
                </option>
              ))}
          </select>
        ) : field.type === "textarea" ? (
          <textarea name={field.key} required={field.required} rows={3} defaultValue={String(value || "")} />
        ) : (
          <input
            name={field.key}
            required={field.required}
            type={inputType}
            step={["money", "number", "percent"].includes(field.type || "") ? "0.01" : undefined}
            defaultValue={
              value === undefined || value === null
                ? ""
                : field.type === "money"
                  ? Number(value) / 100
                  : String(value)
            }
          />
        )}
        {field.hint && <small>{field.hint}</small>}
      </label>
    );
  };

  if (kind === "suppliers") {
    return (
      <div className="mg-modal-shade" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
        <div className="mg-modal task-modal-modern" role="dialog" aria-modal="true">
          <header className="task-modal-header">
            <div className="task-modal-title-box">
              <div className="task-modal-icon-badge">
                <Truck size={20} />
              </div>
              <div>
                <h2>{record ? "Editar Fornecedor" : "Novo Fornecedor"}</h2>
                <p>{record ? `Atualizando dados de ${record.name || "fornecedor"}` : "Cadastre uma empresa, distribuidora ou prestador de serviço."}</p>
              </div>
            </div>
            <button type="button" className="task-modal-close" onClick={onClose} disabled={busy} title="Fechar">
              ✕
            </button>
          </header>

          <form ref={formRef} className="task-modal-form" onSubmit={save}>
            {/* Card 1: Identificação Principal */}
            <div className="task-compact-card">
              <div className="task-grid-columns-two-compact">
                <div className="task-field-group">
                  <label htmlFor="sup-name">
                    <Truck size={13} className="task-sec-icon" />
                    Razão Social / Nome Fantasia <span className="task-req">*</span>
                  </label>
                  <input
                    id="sup-name"
                    name="name"
                    type="text"
                    autoFocus
                    placeholder="Ex.: Distribuidora de Carnes Bela Vista"
                    defaultValue={String(record?.name || "")}
                    required
                  />
                </div>

                <div className="task-field-group">
                  <label htmlFor="sup-doc">
                    <FileText size={13} />
                    CNPJ ou CPF (opcional)
                  </label>
                  <input
                    id="sup-doc"
                    name="document"
                    type="text"
                    placeholder="00.000.000/0000-00 ou CPF"
                    defaultValue={String(record?.document || "")}
                  />
                </div>
              </div>
            </div>

            {/* Card 2: Canais de Contato & Comunicação */}
            <div className="task-compact-card">
              <div className="task-grid-columns-two-compact">
                <div className="task-field-group">
                  <label htmlFor="sup-email">
                    <Mail size={13} />
                    E-mail para envio de comprovantes
                  </label>
                  <input
                    id="sup-email"
                    name="email"
                    type="email"
                    placeholder="financeiro@fornecedor.com.br"
                    defaultValue={String(record?.email || "")}
                  />
                </div>

                <div className="task-field-group">
                  <label htmlFor="sup-phone">
                    <Phone size={13} />
                    Telefone / WhatsApp Comercial
                  </label>
                  <input
                    id="sup-phone"
                    name="phone"
                    type="text"
                    placeholder="(00) 00000-0000"
                    defaultValue={String(record?.phone || "")}
                  />
                </div>
              </div>
            </div>

            {error && <div className="mg-error">{error}</div>}

            <footer className="task-modal-footer">
              {record && (
                <button
                  type="button"
                  className="mg-button danger"
                  style={{
                    marginRight: "auto",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "#fef2f2",
                    color: "#dc2626",
                    border: "1px solid #fecaca",
                    padding: "9px 14px",
                    borderRadius: "8px",
                    fontWeight: 600,
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                  disabled={busy}
                  onClick={async () => {
                    if (!user) return;
                    const linked = (data.payables || []).filter(
                      (p) => !p.archived && p.supplierId === record.id
                    );
                    if (linked.length > 0) {
                      const hasOpen = linked.some(
                        (p) => outstanding(p, data, dateToday()) > 0
                      );
                      if (hasOpen) {
                        alert(
                          `Não é possível excluir o fornecedor "${record.name}": existem ${linked.length} conta(s) vinculadas, sendo que algumas ainda estão em aberto. Remova ou quite as contas antes de excluir.`
                        );
                        return;
                      }
                    }
                    if (!confirm(`Tem certeza que deseja excluir o fornecedor "${record.name}"?`)) return;
                    setBusy(true);
                    try {
                      await saveManagement(
                        { ...record, archived: true, updatedBy: user.uid, updatedAt: new Date().toISOString() },
                        data,
                        true
                      );
                      onSaved(`Fornecedor "${record.name}" excluído.`);
                      onClose();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Erro ao excluir.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Trash2 size={13} /> Excluir Fornecedor
                </button>
              )}
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
                {busy ? "Salvando..." : record ? "Salvar Alterações" : "Cadastrar Fornecedor"}
              </button>
            </footer>
          </form>
        </div>
      </div>
    );
  }

  return (
    <ModalShell
      title={`${record ? "Editar" : "Cadastrar"} ${def.singular}`}
      onClose={() => !busy && onClose()}
    >
      <form ref={formRef} className="mg-form" onSubmit={save}>
        {!def.global && (
          <label className="full">
            Unidade
            <select
              value={unit}
              required
              disabled={allowedUnit !== "all"}
              onChange={(e) => setUnit(e.target.value)}
            >
              <option value="">Selecione</option>
              {data.units
                .filter(
                  (u) =>
                    !u.archived &&
                    (allowedUnit === "all" || u.id === allowedUnit),
                )
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {str(u, "name")}
                  </option>
                ))}
            </select>
          </label>
        )}
        {(kind === "payables" || kind === "employees") && (
          <label className={`full mg-document-reader ${readingDocument ? "is-reading" : ""}`}>
            <Paperclip size={20} />
            <span>
              <strong>
                {readingDocument
                  ? "Lendo o documento…"
                  : kind === "employees"
                  ? "Ler Ficha de Registro de Empregado (PDF / Foto)"
                  : "Ler boleto ou nota fiscal"}
              </strong>
              <small>
                {documentReadMessage ||
                  (kind === "employees"
                    ? "Adicione o PDF ou foto do registro. Nome, cargo, setor, admissão e salário serão preenchidos automaticamente."
                    : "Adicione um PDF ou foto nítida. Fornecedor, vencimento, valor e número serão preenchidos automaticamente.")}
              </small>
            </span>
            <b>{readingDocument ? "AGUARDE" : "ADICIONAR DOCUMENTO"}</b>
            <input
              name="documentFile"
              type="file"
              accept="image/*,.pdf"
              capture="environment"
              disabled={readingDocument}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  if (kind === "employees") scanEmployeeDocument(file);
                  else scanPayableDocument(file);
                }
              }}
            />
          </label>
        )}
        {(kind === "payables"
          ? def.fields.filter((field) => payableMainFields.has(field.key))
          : def.fields
        ).map(renderField)}
        {kind === "payables" && (
          <div className="full mg-form-advanced">
            <button type="button" className="mg-button secondary" disabled={busy || readingDocument} onClick={() => {
              setSupplierDraftOpen(true);
              const field = formRef.current?.elements.namedItem("supplierId") as HTMLSelectElement | null;
              if (field && supplierDraftOpen) field.value = "__new_supplier__";
            }}><Plus size={16} /> Cadastrar fornecedor nesta nota</button>
            {supplierDraftOpen && <div className="mg-form">
              <label>Nome do fornecedor *<input value={scannedSupplier.name} onChange={(event) => setScannedSupplier((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>CNPJ / CPF<input value={scannedSupplier.document} onChange={(event) => setScannedSupplier((current) => ({ ...current, document: event.target.value }))} /></label>
              <small className="full">Confira os dados. O fornecedor será cadastrado e vinculado automaticamente ao salvar a conta, sem duplicar um cadastro existente.</small>
            </div>}
          </div>
        )}
        {kind === "payables" && (
          <>
            <details className="full mg-form-advanced">
              <summary>Mais detalhes</summary>
              <div className="mg-form">
                {def.fields.filter((field) => !payableMainFields.has(field.key)).map(renderField)}
              </div>
            </details>
            <p className="full mg-backup-note">
              <Cloud size={16} /> Ao salvar, o sistema cria automaticamente uma planilha de backup no Google Drive.
            </p>
          </>
        )}
        {kind === "payroll" && (
          <p className="mg-method full">
            Férias = base ÷ 12; adicional = férias ÷ 3; 13º = base ÷ 12. FGTS e
            encargos usam exclusivamente as alíquotas informadas. Não inclua os
            mesmos valores novamente em “Encargos patronais”.
          </p>
        )}
        {kind === "taxes" && (
          <p className="mg-method full">
            O valor gera uma obrigação vinculada. Para guias já reconhecidas na
            folha, escolha “Sem efeito na DRE” para evitar dupla despesa;
            registre a obrigação apenas uma vez.
          </p>
        )}
        {error && (
          <p role="alert" className="mg-error">
            {error}
          </p>
        )}
        <footer>
          <button
            type="button"
            className="mg-button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="mg-button" disabled={busy || readingDocument}>
            {readingDocument ? "Lendo documento…" : busy ? "Salvando…" : "Salvar na nuvem"}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}
export function SettlementForm({
  record,
  onClose,
  onSaved,
}: {
  record: RecordData;
  onClose: () => void;
  onSaved: (message?: string) => void;
}) {
  const { data } = useManagement();
  const { user } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);
  const [id] = useState(() => safeUUID());
  const today = dateToday();

  const totalCents = Number(record.amount || 0);
  const outCents = outstanding(record, data, today);
  const alreadyPaidCents = Math.max(0, totalCents - outCents);

  const [paymentMode, setPaymentMode] = useState<"total" | "partial">("total");
  const [amountStr, setAmountStr] = useState<string>(() => (outCents / 100).toFixed(2));

  const handleModeChange = (mode: "total" | "partial") => {
    setPaymentMode(mode);
    if (mode === "total") {
      setAmountStr((outCents / 100).toFixed(2));
    } else {
      const currentVal = Number(amountStr.replace(",", "."));
      if (isNaN(currentVal) || currentVal >= outCents / 100 || currentVal <= 0) {
        const half = Math.round(outCents / 2) / 100;
        setAmountStr(half > 0 ? half.toFixed(2) : (outCents / 100).toFixed(2));
      }
    }
  };

  const parsedAmount = Number(amountStr.replace(",", "."));
  const currentPayCents = Math.round((isNaN(parsedAmount) || parsedAmount < 0 ? 0 : parsedAmount) * 100);
  const remainingAfterCents = Math.max(0, outCents - currentPayCents);
  const isCompletePay = currentPayCents === outCents;
  const isValidAmount = currentPayCents > 0 && currentPayCents <= outCents;

  const supplier = data.suppliers.find((s) => s.id === record.supplierId);
  const supplierName = supplier ? str(supplier, "name") : str(record, "scannedSupplierName") || "";
  const unit = data.units.find((u) => u.id === record.unitId);

  return (
    <ModalShell
      title={
        record.kind === "receivables"
          ? "Registrar recebimento"
          : isCompletePay
            ? "Quitar Conta (100%)"
            : "Registrar Pagamento Parcial (Abatimento)"
      }
      onClose={() => !busy && onClose()}
    >
      <form
        className="mg-form settlement-modal"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!user) return;
          if (!isValidAmount) {
            setError("Informe um valor válido e positivo para a baixa, não excedendo o saldo pendente.");
            return;
          }
          setBusy(true);
          setError("");
          try {
            const form = new FormData(e.currentTarget);
            const row = settlement(
              record,
              data,
              currentPayCents,
              String(form.get("date")),
              String(form.get("bank")),
              user.uid,
              id,
            );
            const proof = form.get("paymentProof");
            if (proof instanceof File && proof.size > 0) {
              const named = nameFileForDrive(
                proof,
                `Comprovante - ${str(record, "description")} - ${String(form.get("date"))}`,
              );
              const stored = await uploadFileToDrive(named, "payment_proofs");
              row.paymentProofFileId = stored.fileId;
              row.paymentProofFileName = stored.fileName;
              row.paymentProofMimeType = stored.mimeType;
              row.paymentProofSize = stored.size;
            }
            await commitRecords([row], data, row);
            void backupPayablesSpreadsheet(data, [row]).catch((err) =>
              console.warn("Backup em planilha pendente:", err),
            );
            onSaved(
              isCompletePay
                ? `Conta quitada 100%! Baixa de ${currency(currentPayCents)} confirmada.`
                : `Pagamento parcial de ${currency(currentPayCents)} abatido com sucesso! Saldo restante: ${currency(remainingAfterCents)}.`,
            );
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Falha ao registrar baixa.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="full settlement-overview-card">
          <div className="settlement-overview-header">
            <div className="settlement-overview-title">
              <strong>{str(record, "description")}</strong>
              <span>
                {unit?.name || "Todas as unidades"} {supplierName ? `· ${supplierName}` : ""}
              </span>
            </div>
            <span className="payables-due-cell">
              Vencimento: <strong>{formatDateBR(str(record, "dueDate"))}</strong>
            </span>
          </div>
          <div className="settlement-metrics-grid">
            <div className="settlement-metric-box">
              <span>Valor Total da Conta</span>
              <strong>{currency(totalCents)}</strong>
            </div>
            <div className="settlement-metric-box">
              <span>Total Já Quitado</span>
              <strong style={{ color: alreadyPaidCents > 0 ? "#16a34a" : "#64748b" }}>
                {currency(alreadyPaidCents)}
              </strong>
            </div>
            <div className="settlement-metric-box highlight">
              <span>Saldo Pendente Atual</span>
              <strong>{currency(outCents)}</strong>
            </div>
          </div>
          {(() => {
            const pixKey = str(record, "pixKey") || (str(record, "notes").match(/Chave PIX:\s*([^\s\n\r]+)/i)?.[1] || "");
            if (!pixKey) return null;
            return (
              <div className="settlement-pix-card">
                <span className="settlement-pix-tag">⚡ DADOS PARA PAGAMENTO PIX</span>
                <div className="settlement-pix-content">
                  <span className="settlement-pix-label">Chave PIX:</span>
                  <code className="settlement-pix-code">{pixKey}</code>
                  <button
                    type="button"
                    className="settlement-pix-copy-btn"
                    onClick={() => {
                      navigator.clipboard.writeText(pixKey);
                      setCopiedPix(true);
                      setTimeout(() => setCopiedPix(false), 2000);
                    }}
                  >
                    <Copy size={12} /> {copiedPix ? "Chave Copiada!" : "Copiar Chave"}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>

        {record.kind === "payables" && outCents > 0 && (
          <div className="full settlement-type-toggle">
            <button
              type="button"
              className={`settlement-mode-btn ${paymentMode === "total" ? "active" : ""}`}
              onClick={() => handleModeChange("total")}
            >
              <strong>⚡ Quitar Valor Total (100%)</strong>
              <small>Pagar saldo integral de {currency(outCents)}</small>
            </button>
            <button
              type="button"
              className={`settlement-mode-btn ${paymentMode === "partial" ? "active" : ""}`}
              onClick={() => handleModeChange("partial")}
            >
              <strong>✂️ Pagamento Parcial (Abatimento)</strong>
              <small>Pagar uma parte agora e abater do valor</small>
            </button>
          </div>
        )}

        <label className={paymentMode === "partial" ? "full" : ""}>
          {paymentMode === "partial" ? "Valor do Abatimento a Pagar Agora (R$) *" : "Valor da Baixa (R$) *"}
          <input
            type="number"
            name="amount"
            step="0.01"
            min="0.01"
            max={outCents / 100}
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            disabled={paymentMode === "total"}
            required
          />
        </label>

        {paymentMode === "total" && (
          <label>
            Data efetiva do pagamento *
            <input
              name="date"
              type="date"
              max={today}
              defaultValue={today}
              required
            />
          </label>
        )}

        {paymentMode === "partial" && (
          <>
            <div className="full settlement-calc-panel">
              <div className="settlement-calc-row">
                <span>Saldo antes deste pagamento:</span>
                <strong>{currency(outCents)}</strong>
              </div>
              <div className="settlement-calc-row">
                <span>(-) Abatimento a pagar agora:</span>
                <strong style={{ color: "#d97706" }}>-{currency(currentPayCents)}</strong>
              </div>
              <div className="settlement-calc-row remaining">
                <span>(=) Saldo restante que continuará em aberto:</span>
                <strong style={{ color: remainingAfterCents > 0 ? "#b45309" : "#16a34a" }}>
                  {currency(remainingAfterCents)}
                </strong>
              </div>
              <div className={`settlement-calc-alert ${remainingAfterCents > 0 ? "warn" : ""}`}>
                {remainingAfterCents > 0 ? (
                  <>⏳ <strong>Atenção:</strong> Esta conta permanecerá em aberto como <strong>Parcial</strong> com saldo restante de <strong>{currency(remainingAfterCents)}</strong> até atingir 100% de quitação.</>
                ) : (
                  <>✅ <strong>Aviso:</strong> Este valor liquidará 100% da conta e o status passará para <strong>Pago</strong>.</>
                )}
              </div>
            </div>

            <label className="full">
              Data efetiva do pagamento *
              <input
                name="date"
                type="date"
                max={today}
                defaultValue={today}
                required
              />
            </label>
          </>
        )}

        <label className="full">
          Conta bancária de saída *
          <select name="bank" required defaultValue="">
            <option value="">Selecione a conta bancária para baixa</option>
            {(() => {
              const currentUnitAccounts = data.bankAccounts.filter(
                (b) => !b.archived && b.unitId === record.unitId,
              );
              const otherAccounts = data.bankAccounts.filter(
                (b) => !b.archived && b.unitId !== record.unitId,
              );
              const currentUnitObj = data.units.find((u) => u.id === record.unitId);
              const currentUnitName = currentUnitObj
                ? str(currentUnitObj, "name")
                : "Desta Unidade";

              return (
                <>
                  {currentUnitAccounts.length > 0 && (
                    <optgroup label={`Contas da Unidade (${currentUnitName})`}>
                      {currentUnitAccounts.map((b) => (
                        <option value={b.id} key={b.id}>
                          {str(b, "name")} ({str(b, "bank") || "Conta"})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {otherAccounts.length > 0 && (
                    <optgroup label="Outras Contas do Grupo (Todas as Lojas / Matriz)">
                      {otherAccounts.map((b) => {
                        const u = data.units.find((unit) => unit.id === b.unitId);
                        const uName = u ? str(u, "name") : "Matriz / Geral";
                        return (
                          <option value={b.id} key={b.id}>
                            {str(b, "name")} ({str(b, "bank") || "Conta"} · {uName})
                          </option>
                        );
                      })}
                    </optgroup>
                  )}
                </>
              );
            })()}
          </select>
        </label>

        <label className="full mg-file-field">
          <span><Paperclip size={15}/> Comprovante de pagamento no Google Drive</span>
          <input name="paymentProof" type="file" accept=".pdf,image/*" />
          <small>Opcional. O arquivo é arquivado no Google Drive e vinculado permanentemente a esta baixa.</small>
        </label>

        <p className="full mg-method">
          Esta ação registra uma liquidação já realizada. O sistema não faz
          transferência bancária.
        </p>

        {error && <p className="mg-error">{error}</p>}

        <footer>
          <button
            type="button"
            className="mg-button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="mg-button"
            disabled={busy || !isValidAmount}
            style={paymentMode === "partial" && !isCompletePay ? { background: "linear-gradient(135deg, #d97706, #f59e0b)" } : {}}
          >
            {busy
              ? "Registrando…"
              : isCompletePay
                ? `⚡ Quitar Totalmente (${currency(currentPayCents)})`
                : `✂️ Confirmar Abatimento de ${currency(currentPayCents)}`}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}
export function Tables({
  kinds,
  filters,
}: {
  kinds: string[];
  filters: Filters;
}) {
  const [active, setActive] = useState(kinds[0]);
  useEffect(() => {
    if (!kinds.includes(active)) setActive(kinds[0]);
  }, [kinds.join("|")]);
  return (
    <>
      <nav className="mg-tabs" aria-label="Bases do módulo">
        {kinds.map((k) => (
          <button
            key={k}
            className={active === k ? "active" : ""}
            onClick={() => setActive(k)}
          >
            {k === "revenues" ? "Lançamentos manuais" : DEFINITIONS[k].label}
          </button>
        ))}
      </nav>
      <RecordTable
        kind={active}
        filters={filters}
        filterPeriod={
          ![
            "companies",
            "brands",
            "units",
            "categories",
            "costCenters",
            "suppliers",
            "bankAccounts",
            "products",
            "policies",
            "coverage",
            "actions",
            "employees",
            "loans",
          ].includes(active)
        }
      />
    </>
  );
}
