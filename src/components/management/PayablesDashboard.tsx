"use client";

import { useMemo, useState, useRef } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Cloud,
  FileSpreadsheet,
  Landmark,
  ArrowDown,
  ReceiptText,
  Repeat,
  Download,
  Zap,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useManagement } from "@/contexts/ManagementContext";
import { addDays, currency, normalizeObligationType, RecordData, str } from "@/domain/management/model";
import { Filters, outstanding, payableStatus } from "@/domain/management/engine";
import { backupPayablesSpreadsheet } from "@/services/payablesBackupService";
import { downloadFileFromDrive } from "@/services/driveService";
import { RecordTable, SettlementForm, formatDateBR, formatShortUnit } from "./RecordTable";
import { InstantPaymentModal } from "@/components/finance/BankWorkspace";

const COLORS = ["#5b5ce2", "#06a77d", "#ff9f43", "#e84a5f", "#20a4f3", "#8f5bd7"];

function sum(rows: RecordData[], data: ReturnType<typeof useManagement>["data"], today: string) {
  return rows.reduce((total, row) => total + outstanding(row, data, today), 0);
}

function formatDate(date: string) {
  if (!date) return "DADO PENDENTE";
  return date.split("-").reverse().join("/");
}

export function PayablesDashboard({ filters }: { filters: Filters }) {
  const { data, tenantId } = useManagement();
  const [backupMessage, setBackupMessage] = useState("");
  const [backingUp, setBackingUp] = useState(false);
  const [instantOpen, setInstantOpen] = useState(false);
  type RecorteKey = "overdue" | "today" | "next7" | "fixed" | "taxes" | "paid";
  const [selectedRecorte, setSelectedRecorte] = useState<RecorteKey | null>(null);
  const [payingRecord, setPayingRecord] = useState<RecordData | null>(null);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const dedicatedRef = useRef<HTMLDivElement>(null);

  const toggleRecorte = (key: RecorteKey) => {
    setSelectedRecorte((current) => {
      const next = current === key ? null : key;
      if (next) {
        setTimeout(() => {
          dedicatedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
      }
      return next;
    });
  };

  const today = filters.today;
  const unitIds = useMemo(
    () =>
      new Set(
        data.units
          .filter((unit) => !unit.archived && (!filters.unitId || filters.unitId === "all" || unit.id === filters.unitId))
          .map((unit) => unit.id),
      ),
    [data.units, filters.unitId],
  );
  const rows = useMemo(
    () =>
      (data.payables || [])
        .filter(
          (row) =>
            !row.archived &&
            (!filters.unitId ||
              filters.unitId === "all" ||
              !row.unitId ||
              row.unitId === filters.unitId ||
              unitIds.has(row.unitId)),
        )
        .sort((a, b) => str(a, "dueDate").localeCompare(str(b, "dueDate"))),
    [data.payables, filters.unitId, unitIds],
  );
  const open = rows.filter((row) => outstanding(row, data, today) > 0);
  const overdue = open.filter((row) => str(row, "dueDate") < today);
  const todayRows = open.filter((row) => str(row, "dueDate") === today);
  const next7 = open.filter((row) => str(row, "dueDate") > today && str(row, "dueDate") <= addDays(today, 7));
  const thisMonth = open.filter((row) => str(row, "dueDate").slice(0, 7) === filters.start.slice(0, 7));
  const taxRows = open.filter(
    (row) => (str(row, "obligationType") === "Imposto" || row.sourceKind === "taxes" || normalizeObligationType(str(row, "obligationType")) === "Imposto / Tributo") && str(row, "dueDate") <= addDays(today, 30),
  );
  const fixedRows = open.filter((row) => normalizeObligationType(str(row, "obligationType")) === "Despesa Fixa");
  const fixedThisMonth = fixedRows.filter((row) => str(row, "dueDate").slice(0, 7) === filters.start.slice(0, 7));
  const fixedAmount = sum(fixedThisMonth, data, today);
  const paidThisMonth = rows.filter((row) => {
    const payments = data.transactions.filter(
      (item) =>
        !item.archived &&
        item.obligationId === row.id &&
        str(item, "date").slice(0, 7) === filters.start.slice(0, 7),
    );
    return payments.length > 0;
  });
  const paidAmount = paidThisMonth.reduce(
    (total, row) =>
      total +
      data.transactions
        .filter(
          (item) =>
            !item.archived &&
            item.obligationId === row.id &&
            str(item, "date").slice(0, 7) === filters.start.slice(0, 7),
        )
        .reduce((value, item) => value + Number(item.amount || 0) * (item.reversalOf ? -1 : 1), 0),
    0,
  );

  const recorteConfig = useMemo(() => {
    if (!selectedRecorte) return null;
    switch (selectedRecorte) {
      case "overdue":
        return {
          key: "overdue" as const,
          title: "Contas Vencidas",
          description: "Contas com vencimento anterior a hoje que aguardam quitação.",
          tone: "danger",
          icon: AlertTriangle,
          rows: overdue,
          total: sum(overdue, data, today),
          emptyText: "Parabéns! Nenhuma conta vencida neste momento.",
        };
      case "today":
        return {
          key: "today" as const,
          title: "Vencem Hoje",
          description: `Contas com vencimento previsto para a data de hoje (${formatDate(today)}).`,
          tone: "warning",
          icon: CalendarClock,
          rows: todayRows,
          total: sum(todayRows, data, today),
          emptyText: "Nenhuma conta programada para vencer hoje.",
        };
      case "next7":
        return {
          key: "next7" as const,
          title: "Próximos 7 Dias",
          description: "Contas a vencer nos próximos 7 dias para planejamento de caixa imediato.",
          tone: "purple",
          icon: ReceiptText,
          rows: next7,
          total: sum(next7, data, today),
          emptyText: "Nenhuma conta a vencer nos próximos 7 dias.",
        };
      case "fixed":
        return {
          key: "fixed" as const,
          title: "Despesas Fixas Cadastradas",
          description: "Contas fixas e recorrentes (aluguel, luz, água, internet, contabilidade, softwares).",
          tone: "cyan",
          icon: Repeat,
          rows: fixedRows,
          total: sum(fixedRows, data, today),
          emptyText: "Nenhuma despesa fixa em aberto cadastrada.",
        };
      case "taxes":
        return {
          key: "taxes" as const,
          title: "Impostos até 30 Dias",
          description: "Guias tributárias, impostos e encargos com vencimento nos próximos 30 dias.",
          tone: "blue",
          icon: Landmark,
          rows: taxRows,
          total: sum(taxRows, data, today),
          emptyText: "Nenhum imposto com vencimento nos próximos 30 dias.",
        };
      case "paid":
        return {
          key: "paid" as const,
          title: "Contas Pagas no Mês",
          description: `Histórico de contas com pagamentos ou baixas na competência ${filters.start.slice(0, 7)}.`,
          tone: "green",
          icon: CheckCircle2,
          rows: paidThisMonth,
          total: paidAmount,
          emptyText: "Nenhuma conta com pagamento registrado nesta competência.",
        };
    }
  }, [selectedRecorte, overdue, todayRows, next7, fixedRows, taxRows, paidThisMonth, data, today, filters.start, paidAmount]);

  const chart = [
    { name: "Atrasados", valor: sum(overdue, data, today) / 100, color: "#e84a5f" },
    { name: "Hoje", valor: sum(todayRows, data, today) / 100, color: "#ff9f43" },
    { name: "1–7 dias", valor: sum(next7, data, today) / 100, color: "#5b5ce2" },
    {
      name: "8–15 dias",
      valor: sum(open.filter((row) => str(row, "dueDate") > addDays(today, 7) && str(row, "dueDate") <= addDays(today, 15)), data, today) / 100,
      color: "#20a4f3",
    },
    {
      name: "16–30 dias",
      valor: sum(open.filter((row) => str(row, "dueDate") > addDays(today, 15) && str(row, "dueDate") <= addDays(today, 30)), data, today) / 100,
      color: "#06a77d",
    },
  ];
  const byType = Array.from(
    open.reduce((map, row) => {
      const raw = str(row, "obligationType");
      const type = normalizeObligationType(raw) || (row.sourceKind === "taxes" ? "Imposto / Tributo" : "Outros");
      map.set(type, (map.get(type) || 0) + outstanding(row, data, today));
      return map;
    }, new Map<string, number>()),
  ).map(([name, value]) => ({ name, value: value / 100 }));
  const attention = [...overdue, ...todayRows, ...next7, ...taxRows]
    .filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index)
    .sort((a, b) => {
      const priority = (row: RecordData) => str(row, "dueDate") === today ? 0 : str(row, "dueDate") < today ? 1 : 2;
      return priority(a) - priority(b) || str(a, "dueDate").localeCompare(str(b, "dueDate"));
    })
    .slice(0, 12);

  const attentionTotal = useMemo(
    () => attention.reduce((sum, row) => sum + outstanding(row, data, today), 0),
    [attention, data, today],
  );

  const goToAccount = (id: string) => {
    document.getElementById(`record-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const createBackup = async () => {
    setBackingUp(true);
    setBackupMessage("");
    try {
      const rows = data.payables || [];
      await backupPayablesSpreadsheet(data, rows);
      setBackupMessage("Backup em planilha gerado com sucesso no Google Drive.");
    } catch {
      setBackupMessage("Não foi possível gerar a planilha no Drive agora.");
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <>
      <section className="payables-hero">
        <div className="payables-hero-text">
          <span className="payables-tag">CONTROLE FINANCEIRO DO GRUPO</span>
          <h1>O que precisa ser pago hoje</h1>
          <p>Boletos, débitos e impostos organizados por prioridade para não atrasar nada.</p>
        </div>
        <div className="payables-hero-actions">
          <button
            className="payables-hero-btn-fixed"
            onClick={() => window.dispatchEvent(new CustomEvent("open-fixed-expense-form"))}
            title="Lançar conta ou despesa fixa recorrente"
          >
            <Repeat size={16} /> Lançar Despesa Fixa
          </button>
          <button className="payables-hero-btn-instant" onClick={() => setInstantOpen(true)} title="Registrar baixa rápida">
            <ReceiptText size={16} /> Pagamento instantâneo
          </button>
          <button className="payables-hero-btn-backup" onClick={createBackup} disabled={backingUp} title="Sincronizar planilha no Google Drive">
            <FileSpreadsheet size={16} /> {backingUp ? "Criando…" : "Gerar backup agora"}
          </button>
        </div>
      </section>

      <div className="payables-summary-grid">
        <SummaryCard
          tone="danger"
          icon={AlertTriangle}
          label="Vencidos"
          value={currency(sum(overdue, data, today))}
          detail={`${overdue.length} conta(s)`}
          isActive={selectedRecorte === "overdue"}
          onClick={() => toggleRecorte("overdue")}
        />
        <SummaryCard
          tone="warning"
          icon={CalendarClock}
          label="Vence hoje"
          value={currency(sum(todayRows, data, today))}
          detail={`${todayRows.length} conta(s)`}
          isActive={selectedRecorte === "today"}
          onClick={() => toggleRecorte("today")}
        />
        <SummaryCard
          tone="purple"
          icon={ReceiptText}
          label="Próximos 7 dias"
          value={currency(sum(next7, data, today))}
          detail={`${next7.length} conta(s)`}
          isActive={selectedRecorte === "next7"}
          onClick={() => toggleRecorte("next7")}
        />
        <SummaryCard
          tone="cyan"
          icon={Repeat}
          label="Despesas Fixas (mês)"
          value={currency(fixedAmount)}
          detail={`${fixedThisMonth.length} conta(s) fixa(s)`}
          isActive={selectedRecorte === "fixed"}
          onClick={() => toggleRecorte("fixed")}
        />
        <SummaryCard
          tone="blue"
          icon={Landmark}
          label="Impostos até 30 dias"
          value={currency(sum(taxRows, data, today))}
          detail={`${taxRows.length} imposto(s)`}
          isActive={selectedRecorte === "taxes"}
          onClick={() => toggleRecorte("taxes")}
        />
        <SummaryCard
          tone="green"
          icon={CheckCircle2}
          label="Pago no mês"
          value={currency(paidAmount)}
          detail={`${paidThisMonth.length} conta(s)`}
          isActive={selectedRecorte === "paid"}
          onClick={() => toggleRecorte("paid")}
        />
      </div>

      {recorteConfig && (
        <section className="payables-dedicated-panel" ref={dedicatedRef}>
          <header className="payables-dedicated-header">
            <div className="payables-dedicated-title-area">
              <div className={`payables-dedicated-icon ${recorteConfig.tone}`}>
                <recorteConfig.icon size={22} />
              </div>
              <div className="payables-dedicated-title-texts">
                <h3>
                  Recorte Dedicado: {recorteConfig.title}
                  <span className="payables-dedicated-badge-count">
                    {recorteConfig.rows.length} conta(s)
                  </span>
                  <span className="payables-dedicated-badge-total">
                    {currency(recorteConfig.total)}
                  </span>
                </h3>
                <p>{recorteConfig.description}</p>
              </div>
            </div>
            <div className="payables-dedicated-actions">
              {recorteConfig.key === "fixed" && (
                <button
                  type="button"
                  className="workspace-secondary"
                  onClick={() => window.dispatchEvent(new CustomEvent("open-fixed-expense-form"))}
                >
                  <Repeat size={14} /> + Nova Despesa Fixa
                </button>
              )}
              <button
                type="button"
                className="payables-dedicated-close-btn"
                onClick={() => setSelectedRecorte(null)}
                title="Fechar recorte dedicado"
              >
                <X size={15} /> Fechar recorte
              </button>
            </div>
          </header>

          {recorteConfig.rows.length === 0 ? (
            <div className="payables-dedicated-empty">
              {recorteConfig.emptyText}
            </div>
          ) : (
            <div className="payables-dedicated-table-wrap">
              <table className="mg-table">
                <thead>
                  <tr>
                    <th style={{ width: "110px" }}>Vencimento</th>
                    <th>Conta / Descrição</th>
                    <th style={{ width: "135px" }}>Unidade</th>
                    <th style={{ width: "135px", textAlign: "right" }}>Valor</th>
                    <th style={{ width: "115px", textAlign: "center" }}>Status</th>
                    <th style={{ width: "180px", textAlign: "right" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {recorteConfig.rows.map((row) => {
                    const outAmt = outstanding(row, data, today);
                    const totalAmt = Number(row.amount || 0);
                    const paidAmt = Math.max(0, totalAmt - outAmt);
                    const isPaid = outAmt === 0;
                    const isPartial = outAmt > 0 && paidAmt > 0;
                    const isToday = str(row, "dueDate") === today;
                    const isOverdue = str(row, "dueDate") < today && outAmt > 0;
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

                    const unit = data.units.find((u) => u.id === row.unitId);
                    const rawObligation = str(row, "obligationType");
                    const normObligation = normalizeObligationType(rawObligation);
                    const isFixed = normObligation === "Despesa Fixa";
                    const isTax = normObligation === "Imposto / Tributo" || row.sourceKind === "taxes";
                    const methodStr = str(row, "paymentMethod");
                    const proof = data.transactions.find((item) => item.obligationId === row.id && item.paymentProofFileId && !item.reversalOf);

                    return (
                      <tr key={row.id}>
                        <td>
                          <strong>{formatDateBR(str(row, "dueDate"))}</strong>
                        </td>
                        <td>
                          <div className="payables-desc-cell">
                            <span className="payables-desc-title">{str(row, "description")}</span>
                            <div className="payables-badges-row">
                              <span className={`payables-badge-type ${isFixed ? "badge-type-fixed" : isTax ? "badge-type-tax" : "badge-type-default"}`}>
                                {isFixed ? "📌 Despesa Fixa" : normObligation}
                              </span>
                              {methodStr && methodStr !== "DADO PENDENTE" && (
                                <span className="payables-badge-method">
                                  {methodStr === "PIX" ? "⚡ PIX" : methodStr === "Boleto" ? "📄 Boleto" : methodStr === "Débito automático" ? "🏦 Débito auto" : methodStr}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>{unit?.name ? formatShortUnit(String(unit.name)) : "—"}</td>
                        <td style={{ textAlign: "right" }}>
                          <strong className="payables-amount-val">{currency(totalAmt)}</strong>
                          {isPartial && (
                            <span className="payables-amount-partial-pill">
                              Restam: {currency(outAmt)}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className={`mg-status-badge ${statusClass}`}>{statusText}</span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="payables-actions-cluster" style={{ justifyContent: "flex-end" }}>
                            {row.documentFileId && (
                              <button
                                className="mg-icon-act-btn"
                                title="Baixar boleto"
                                onClick={() => downloadFileFromDrive(str(row, "documentFileId"), str(row, "documentFileName") || "boleto")}
                              >
                                <Download size={13} /> Boleto
                              </button>
                            )}
                            {proof && (
                              <button
                                className="mg-icon-act-btn"
                                title="Baixar comprovante"
                                onClick={() => downloadFileFromDrive(str(proof, "paymentProofFileId"), str(proof, "paymentProofFileName") || "comprovante")}
                              >
                                <Download size={13} /> Recibo
                              </button>
                            )}
                            {outAmt > 0 && (
                              <button
                                className={`mg-pay-act-btn ${isPartial ? "partial-act" : ""}`}
                                onClick={() => setPayingRecord(row)}
                                title={isPartial ? "Pagar saldo restante" : "Registrar pagamento"}
                              >
                                <Zap size={12} /> {isPartial ? "Pagar restante" : "Pagar"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div className="payables-insight">
        <div><Cloud size={19} /><strong>Backup automático ativo</strong></div>
        <p>Cada conta incluída, alterada ou baixada gera uma nova planilha no Google Drive.</p>
        {backupMessage && <span>{backupMessage}</span>}
      </div>

      <div className="payables-chart-grid">
        <section className="mg-panel payables-chart-card">
          <div className="payables-panel-heading">
            <div><span>PREVISÃO</span><h2>Valores por vencimento</h2></div>
            <strong>{currency(sum(thisMonth, data, today))}<small> em aberto no mês</small></strong>
          </div>
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={chart} margin={{ top: 20, right: 8, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9eaf2" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: number) => currency(value * 100)} cursor={{ fill: "#f4f5fb" }} />
              <Bar dataKey="valor" name="A pagar" radius={[8, 8, 2, 2]}>
                {chart.map((item) => <Cell key={item.name} fill={item.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="mg-panel payables-chart-card">
          <div className="payables-panel-heading"><div><span>COMPOSIÇÃO</span><h2>Contas por tipo</h2></div></div>
          {byType.length ? (
            <ResponsiveContainer width="100%" height={270}>
              <PieChart>
                <Pie data={byType} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={3}>
                  {byType.map((item, index) => <Cell key={item.name} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value: number) => currency(value * 100)} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="payables-no-data">Nenhuma conta em aberto neste recorte.</div>
          )}
        </section>
      </div>

      <section className={`mg-panel payables-attention ${attentionOpen ? "is-open" : "is-collapsed"}`}>
        <div
          className="payables-panel-heading clickable"
          onClick={() => setAttentionOpen((prev) => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setAttentionOpen((prev) => !prev);
            }
          }}
          aria-expanded={attentionOpen}
        >
          <div className="payables-heading-left">
            <span className="payables-attention-eyebrow">ALERTAS</span>
            <div className="payables-title-cluster">
              <h2>Vencimentos que precisam de atenção</h2>
              {attention.length > 0 && (
                <b className="payables-attention-badge">{attention.length} prioridade(s)</b>
              )}
            </div>
            {!attentionOpen && attention.length > 0 && (
              <small className="payables-collapsed-hint">
                {attention.length === 1
                  ? `1 conta pendente (${currency(attentionTotal)}) · Clique para expandir`
                  : `${attention.length} contas pendentes (${currency(attentionTotal)}) · Clique para expandir`}
              </small>
            )}
          </div>
          <button
            type="button"
            className="payables-collapse-btn"
            onClick={(e) => {
              e.stopPropagation();
              setAttentionOpen((prev) => !prev);
            }}
            aria-label={attentionOpen ? "Recolher alertas" : "Expandir alertas"}
          >
            {attentionOpen ? (
              <>
                <span>Recolher</span>
                <ChevronUp size={15} />
              </>
            ) : (
              <>
                <span>Ver alertas ({attention.length})</span>
                <ChevronDown size={15} />
              </>
            )}
          </button>
        </div>
        {attentionOpen && (
          attention.length ? (
            <div className="payables-alert-list">
              {attention.map((row) => {
                const status = payableStatus(row, data, today);
                const isTax = str(row, "obligationType") === "Imposto" || row.sourceKind === "taxes";
                const unit = data.units.find((item) => item.id === row.unitId);
                return (
                  <button className="payables-alert-row" key={row.id} onClick={() => goToAccount(row.id)} title="Abrir esta conta na lista">
                    <span className={`payables-status-dot ${status === "Vencido" ? "danger" : status === "Vencendo" ? "warning" : "normal"}`} />
                    <div className="payables-alert-description">
                      <strong>{str(row, "description")}</strong>
                      <span>{unit?.name || "DADO PENDENTE"} · {isTax ? "Imposto" : str(row, "obligationType") || "Conta"}</span>
                    </div>
                    <span className={`payables-status ${status.toLowerCase()}`}>{status}</span>
                    <span className="payables-due">{formatDate(str(row, "dueDate"))}</span>
                    <strong className="payables-amount">{currency(outstanding(row, data, today))}</strong>
                    <ArrowDown size={15} className="payables-alert-open" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="payables-no-data">Nenhum vencimento urgente. Tudo em dia neste recorte.</div>
          )
        )}
      </section>

      <RecordTable kind="payables" filters={filters} />
      {instantOpen && (
        <InstantPaymentModal
          accounts={data.bankAccounts.filter((row) => !row.archived)}
          tenantId={tenantId}
          onClose={() => setInstantOpen(false)}
          onSaved={() => {
            setInstantOpen(false);
            setBackupMessage("Pagamento instantâneo registrado.");
          }}
        />
      )}
      {payingRecord && (
        <SettlementForm
          record={payingRecord}
          onClose={() => setPayingRecord(null)}
          onSaved={(message) => {
            setPayingRecord(null);
            if (message) setBackupMessage(message);
          }}
        />
      )}
    </>
  );
}

function SummaryCard({
  tone,
  icon: Icon,
  label,
  value,
  detail,
  isActive = false,
  onClick,
}: {
  tone: string;
  icon: typeof AlertTriangle;
  label: string;
  value: string;
  detail: string;
  isActive?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`payables-summary ${tone} ${isActive ? "is-active" : ""}`}
      onClick={onClick}
      title={`Clique para abrir o recorte dedicado de ${label}`}
    >
      <div className="payables-summary-icon"><Icon size={20} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
      {isActive && (
        <span className="payables-summary-badge-active">
          ✓ Recorte aberto
        </span>
      )}
    </button>
  );
}
