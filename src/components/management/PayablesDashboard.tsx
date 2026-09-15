"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Cloud,
  FileSpreadsheet,
  Landmark,
  ArrowDown,
  ReceiptText,
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
import { addDays, currency, RecordData, str } from "@/domain/management/model";
import { Filters, outstanding, payableStatus } from "@/domain/management/engine";
import { backupPayablesSpreadsheet } from "@/services/payablesBackupService";
import { RecordTable } from "./RecordTable";
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
  const today = filters.today;
  const unitIds = useMemo(
    () =>
      new Set(
        data.units
          .filter((unit) => !unit.archived && (!filters.unitId || unit.id === filters.unitId))
          .map((unit) => unit.id),
      ),
    [data.units, filters.unitId],
  );
  const rows = useMemo(
    () =>
      data.payables
        .filter((row) => !row.archived && unitIds.has(row.unitId))
        .sort((a, b) => str(a, "dueDate").localeCompare(str(b, "dueDate"))),
    [data.payables, unitIds],
  );
  const open = rows.filter((row) => outstanding(row, data, today) > 0);
  const overdue = open.filter((row) => str(row, "dueDate") < today);
  const todayRows = open.filter((row) => str(row, "dueDate") === today);
  const next7 = open.filter((row) => str(row, "dueDate") > today && str(row, "dueDate") <= addDays(today, 7));
  const thisMonth = open.filter((row) => str(row, "dueDate").slice(0, 7) === filters.start.slice(0, 7));
  const taxRows = open.filter(
    (row) => (str(row, "obligationType") === "Imposto" || row.sourceKind === "taxes") && str(row, "dueDate") <= addDays(today, 30),
  );
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
      const type = str(row, "obligationType") || (row.sourceKind === "taxes" ? "Imposto" : "Outros");
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

  const goToAccount = (id: string) => {
    document.getElementById(`record-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => document.getElementById(`record-${id}`)?.classList.add("record-attention"), 350);
    window.setTimeout(() => document.getElementById(`record-${id}`)?.classList.remove("record-attention"), 2400);
  };

  const createBackup = async () => {
    setBackingUp(true);
    setBackupMessage("");
    try {
      await backupPayablesSpreadsheet(data);
      setBackupMessage("Planilha de backup criada no Google Drive.");
    } catch {
      setBackupMessage("Não foi possível criar o backup agora.");
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <>
      <section className="payables-hero">
        <div>
          <span className="payables-kicker"><ReceiptText size={15} /> CONTROLE FINANCEIRO</span>
          <h2>O que precisa ser pago agora</h2>
          <p>Boletos, débitos e impostos organizados por vencimento e loja.</p>
        </div>
        <div className="bank-actions"><button className="workspace-secondary" onClick={()=>setInstantOpen(true)}><ReceiptText size={17}/> Pagamento instantâneo</button><button className="payables-backup-button" onClick={createBackup} disabled={backingUp}><FileSpreadsheet size={18} /> {backingUp ? "Criando…" : "Gerar backup agora"}</button></div>
      </section>

      <div className="payables-summary-grid">
        <SummaryCard tone="danger" icon={AlertTriangle} label="Vencidos" value={currency(sum(overdue, data, today))} detail={`${overdue.length} conta(s)`} />
        <SummaryCard tone="warning" icon={CalendarClock} label="Vence hoje" value={currency(sum(todayRows, data, today))} detail={`${todayRows.length} conta(s)`} />
        <SummaryCard tone="purple" icon={ReceiptText} label="Próximos 7 dias" value={currency(sum(next7, data, today))} detail={`${next7.length} conta(s)`} />
        <SummaryCard tone="blue" icon={Landmark} label="Impostos até 30 dias" value={currency(sum(taxRows, data, today))} detail={`${taxRows.length} imposto(s)`} />
        <SummaryCard tone="green" icon={CheckCircle2} label="Pago no mês" value={currency(paidAmount)} detail={`${paidThisMonth.length} conta(s)`} />
      </div>

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

      <section className="mg-panel payables-attention">
        <div className="payables-panel-heading">
          <div><span>ALERTAS</span><h2>Vencimentos que precisam de atenção</h2></div>
          <b>{attention.length} prioridade(s)</b>
        </div>
        {attention.length ? (
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
        )}
      </section>

      <RecordTable kind="payables" filters={filters} />
      {instantOpen&&<InstantPaymentModal accounts={data.bankAccounts.filter(row=>!row.archived)} tenantId={tenantId} onClose={()=>setInstantOpen(false)} onSaved={()=>{setInstantOpen(false);setBackupMessage("Pagamento instantâneo registrado.");}}/>}
    </>
  );
}

function SummaryCard({
  tone,
  icon: Icon,
  label,
  value,
  detail,
}: {
  tone: string;
  icon: typeof AlertTriangle;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className={`payables-summary ${tone}`}>
      <div className="payables-summary-icon"><Icon size={20} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
