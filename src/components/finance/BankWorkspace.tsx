"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft, Building2, CalendarDays, Landmark, MessageCircle, Plus, WalletCards } from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import { currency, dateToday, RecordData, str } from "@/domain/management/model";
import { saveManagement } from "@/services/managementService";
import { RecordForm } from "@/components/management/RecordTable";
import "@/components/management/management.css";

function currentBalance(account: RecordData, transactions: RecordData[], transfers: RecordData[]) {
  if (typeof account.balance !== "number") return null;
  const since = str(account, "balanceDate");
  let value = Number(account.balance);
  transactions.filter((row) => !row.archived && row.bankAccountId === account.id && (!since || str(row, "date") > since))
    .forEach((row) => { value += Number(row.amount || 0) * (row.direction === "Entrada" ? 1 : -1); });
  transfers.filter((row) => !row.archived && (!since || str(row, "date") > since)).forEach((row) => {
    if (row.fromBankId === account.id) value -= Number(row.amount || 0);
    if (row.toBankId === account.id) value += Number(row.amount || 0);
  });
  return value;
}

export function BankWorkspace() {
  const { data, tenantId } = useManagement();
  const { user } = useAuth();
  const [editingBank, setEditingBank] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [message, setMessage] = useState("");
  const today = dateToday();
  const accounts = data.bankAccounts.filter((row) => !row.archived);
  const balances = useMemo(() => accounts.map((account) => ({ account, balance: currentBalance(account, data.transactions, data.bankTransfers || []) })), [accounts, data.transactions, data.bankTransfers]);
  const total = balances.every((item) => item.balance !== null) ? balances.reduce((sum, item) => sum + Number(item.balance), 0) : null;
  const paidToday = data.transactions.filter((row) => !row.archived && row.direction === "Saída" && row.obligationId && str(row, "date") === today && !row.reversalOf);
  const paidTotal = paidToday.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const share = (type: "banks" | "paid") => {
    const text = type === "banks"
      ? [`*SALDOS BANCÁRIOS — ${today.split("-").reverse().join("/")}*`, ...balances.map(({ account, balance }) => `${str(account, "name")}: ${currency(balance)}`), `*TOTAL: ${currency(total)}*`].join("\n")
      : [`*PAGAMENTOS DO DIA — ${today.split("-").reverse().join("/")}*`, ...paidToday.map((row) => `• ${str(row, "description").replace(/^Baixa:\s*/, "")} — ${currency(Number(row.amount || 0))}`), `*TOTAL PAGO: ${currency(paidTotal)}*`].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  return <div className="workspace-shell banking-workspace">
    <header className="workspace-header">
      <div><span className="workspace-eyebrow">TESOURARIA</span><h1>Bancos e movimentações</h1><p>Saldos, transferências internas e relatórios diários em um só lugar.</p></div>
      <div className="bank-actions"><button className="workspace-secondary" onClick={() => share("banks")}><MessageCircle size={16}/> Saldos no WhatsApp</button><button className="workspace-primary" onClick={() => setTransferOpen(true)}><ArrowRightLeft size={16}/> Transferir</button></div>
    </header>
    <section className="bank-total-card"><div><span>SALDO TOTAL DO GRUPO</span><strong>{currency(total)}</strong><small>{total === null ? "Atualize os saldos pendentes para obter o total" : `Posição calculada em ${today.split("-").reverse().join("/")}`}</small></div><WalletCards size={38}/></section>
    <section className="bank-grid">
      {balances.map(({ account, balance }) => <article className="bank-card" key={account.id}><div className="bank-card-icon"><Landmark size={19}/></div><div><span>{str(account, "bank") || "Conta bancária"}</span><h3>{str(account, "name")}</h3><strong>{currency(balance)}</strong><small>{str(account, "balanceDate") ? `Conciliado em ${str(account, "balanceDate").split("-").reverse().join("/")}` : "Saldo inicial pendente"}</small></div></article>)}
      {!accounts.length && <div className="bank-empty">Os sete bancos estão sendo preparados. Nenhum saldo foi inventado.</div>}
    </section>
    <section className="bank-report-row"><div><CalendarDays size={20}/><div><span>PAGAMENTOS REGISTRADOS HOJE</span><strong>{currency(paidTotal)}</strong><small>{paidToday.length} pagamento(s)</small></div></div><button className="workspace-secondary" onClick={() => share("paid")}><MessageCircle size={16}/> Enviar relatório do dia</button></section>
    {message && <p className="workspace-message">{message}</p>}
    <section className="mg-panel"><div className="mg-toolbar"><h2>Contas cadastradas <span className="mg-tag">{accounts.length}</span></h2><button className="mg-button" onClick={() => setEditingBank(true)}><Plus size={15}/> Nova conta</button></div></section>
    {editingBank && <RecordForm kind="bankAccounts" suggestedUnit="" onClose={() => setEditingBank(false)} onSaved={() => {setEditingBank(false);setMessage("Conta bancária salva.");}}/>}
    {transferOpen && <TransferModal accounts={accounts} tenantId={tenantId} onClose={() => setTransferOpen(false)} onSaved={() => {setTransferOpen(false);setMessage("Transferência registrada nas duas contas.");}}/>}
  </div>;
}

function TransferModal({ accounts, tenantId, onClose, onSaved }: { accounts: RecordData[]; tenantId: string; onClose: () => void; onSaved: () => void }) {
  const { data } = useManagement(); const { user } = useAuth(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  return <div className="mg-modal-shade"><div className="mg-modal" role="dialog" aria-modal="true"><header><h2>Transferência entre bancos</h2><button onClick={onClose}>×</button></header><form className="mg-form" onSubmit={async (event) => {event.preventDefault(); if(!user)return; setBusy(true);setError("");try {const form=new FormData(event.currentTarget);const from=String(form.get("from")||"");const to=String(form.get("to")||"");if(!from||!to||from===to)throw new Error("Selecione contas diferentes.");const origin=accounts.find(a=>a.id===from);if(!origin)throw new Error("Conta de origem inválida.");const now=new Date().toISOString();const row:RecordData={id:crypto.randomUUID(),kind:"bankTransfers",tenantId,unitId:origin.unitId,version:0,createdAt:now,updatedAt:now,createdBy:user.uid,updatedBy:user.uid,fromBankId:from,toBankId:to,date:String(form.get("date")),amount:Math.round(Number(form.get("amount"))*100),notes:String(form.get("notes")||"")};await saveManagement(row,data);onSaved();}catch(e){setError(e instanceof Error?e.message:"Não foi possível transferir.");}finally{setBusy(false);}}}>
    <label>Conta de origem<select name="from" required><option value="">Selecione</option>{accounts.map(a=><option key={a.id} value={a.id}>{str(a,"name")}</option>)}</select></label>
    <label>Conta de destino<select name="to" required><option value="">Selecione</option>{accounts.map(a=><option key={a.id} value={a.id}>{str(a,"name")}</option>)}</select></label>
    <label>Data<input name="date" type="date" defaultValue={dateToday()} required/></label><label>Valor<input name="amount" type="number" step="0.01" min="0.01" required/></label><label className="full">Observações<textarea name="notes" rows={3}/></label>
    {error&&<p className="mg-error">{error}</p>}<footer><button type="button" className="mg-button secondary" onClick={onClose}>Cancelar</button><button className="mg-button" disabled={busy}>{busy?"Salvando…":"Confirmar transferência"}</button></footer></form></div></div>;
}
