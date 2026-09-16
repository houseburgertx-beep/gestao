"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft, CalendarDays, Landmark, MessageCircle, Pencil, Plus, WalletCards, Zap } from "lucide-react";
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
  const [editingBank, setEditingBank] = useState<RecordData | false | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [instantOpen, setInstantOpen] = useState(false);
  const [message, setMessage] = useState("");
  const today = dateToday();
  const accounts = data.bankAccounts.filter((row) => !row.archived);
  const balances = useMemo(() => accounts.map((account) => ({ account, balance: currentBalance(account, data.transactions, data.bankTransfers || []) })), [accounts, data.transactions, data.bankTransfers]);
  const total = balances.every((item) => item.balance !== null) ? balances.reduce((sum, item) => sum + Number(item.balance), 0) : null;
  const paidToday = data.transactions.filter((row) => !row.archived && row.direction === "Saída" && str(row, "date") === today && !row.reversalOf);
  const paidTotal = paidToday.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const share = (type: "banks" | "paid") => {
    const text = type === "banks"
      ? [`*SALDOS BANCÁRIOS — ${today.split("-").reverse().join("/")}*`, ...balances.map(({ account, balance }) => `${str(account, "name")}: ${balance===null?"Não informado":currency(balance)}`), `*TOTAL: ${total===null?"Não informado":currency(total)}*`].join("\n")
      : [`*PAGAMENTOS DO DIA — ${today.split("-").reverse().join("/")}*`, ...paidToday.map((row) => `• ${str(row, "description").replace(/^Baixa:\s*/, "")} — ${currency(Number(row.amount || 0))}`), `*TOTAL PAGO: ${currency(paidTotal)}*`].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  return <div className="workspace-shell banking-workspace">
    <header className="workspace-header">
      <div><span className="workspace-eyebrow">TESOURARIA</span><h1>Bancos e movimentações</h1><p>Saldos, transferências internas e relatórios diários em um só lugar.</p></div>
      <div className="bank-actions"><button className="workspace-secondary" onClick={() => share("banks")}><MessageCircle size={16}/> Saldos no WhatsApp</button><button className="workspace-secondary" onClick={() => setInstantOpen(true)}><Zap size={16}/> Pagamento instantâneo</button><button className="workspace-primary" onClick={() => setTransferOpen(true)}><ArrowRightLeft size={16}/> Transferir</button></div>
    </header>
    <section className="bank-total-card"><div><span>SALDO TOTAL DO GRUPO</span><strong>{total===null?"Não informado":currency(total)}</strong><small>{total === null ? "Informe os valores dos bancos para calcular o total" : `Posição calculada em ${today.split("-").reverse().join("/")}`}</small></div><WalletCards size={38}/></section>
    <section className="bank-grid">
      {balances.map(({ account, balance }) => <article className="bank-card" key={account.id}><div className="bank-card-icon"><Landmark size={19}/></div><div><span>{str(account, "bank") || "Conta bancária"}</span><h3>{str(account, "name")}</h3><strong>{balance===null?"Não informado":currency(balance)}</strong><small>{str(account, "balanceDate") ? `Atualizado em ${str(account, "balanceDate").split("-").reverse().join("/")}` : "Informe o primeiro valor"}</small><button className="bank-edit" onClick={()=>setEditingBank(account)}><Pencil size={13}/> Incluir valor</button></div></article>)}
      {!accounts.length && <div className="bank-empty">Os sete bancos estão sendo preparados. Nenhum saldo foi inventado.</div>}
    </section>
    <section className="bank-report-row"><div><CalendarDays size={20}/><div><span>PAGAMENTOS REGISTRADOS HOJE</span><strong>{currency(paidTotal)}</strong><small>{paidToday.length} pagamento(s)</small></div></div><button className="workspace-secondary" onClick={() => share("paid")}><MessageCircle size={16}/> Enviar relatório do dia</button></section>
    {message && <p className="workspace-message">{message}</p>}
    <section className="mg-panel"><div className="mg-toolbar"><h2>Contas cadastradas <span className="mg-tag">{accounts.length}</span></h2><button className="mg-button" onClick={() => setEditingBank(false)}><Plus size={15}/> Nova conta</button></div></section>
    {editingBank !== null && (
      <BankAccountModal
        account={editingBank || undefined}
        onClose={() => setEditingBank(null)}
        onSaved={() => {
          setEditingBank(null);
          setMessage("Conta / Caixa salvo com sucesso no Firebase.");
        }}
      />
    )}
    {transferOpen && <TransferModal accounts={accounts} tenantId={tenantId} onClose={() => setTransferOpen(false)} onSaved={() => {setTransferOpen(false);setMessage("Transferência registrada nas duas contas.");}}/>}
    {instantOpen && <InstantPaymentModal accounts={accounts} tenantId={tenantId} onClose={()=>setInstantOpen(false)} onSaved={()=>{setInstantOpen(false);setMessage("Pagamento instantâneo registrado e incluído no relatório do dia.");}}/>}
  </div>;
}

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
  const [unit, setUnit] = useState(() => account?.unitId || (allowedUnit !== "all" ? allowedUnit : (data.units[0]?.id || "")));
  const [name, setName] = useState(() => (account ? str(account, "name") : ""));
  const [bank, setBank] = useState(() => (account ? str(account, "bank") : ""));
  const [balance, setBalance] = useState(() => (account && typeof account.balance === "number" ? (Number(account.balance) / 100).toFixed(2) : ""));
  const [balanceDate, setBalanceDate] = useState(() => (account ? str(account, "balanceDate") : "") || dateToday());
  const [creditFeePct, setCreditFeePct] = useState(() => (account && account.creditFeePct !== undefined ? String(account.creditFeePct) : "0"));
  const [debitFeePct, setDebitFeePct] = useState(() => (account && account.debitFeePct !== undefined ? String(account.debitFeePct) : "0"));
  const [pixFeePct, setPixFeePct] = useState(() => (account && account.pixFeePct !== undefined ? String(account.pixFeePct) : "0"));
  const [isSangriaAccount, setIsSangriaAccount] = useState(() => Boolean(account?.isSangriaAccount));
  const [reconciled, setReconciled] = useState(() => account ? Boolean(account.reconciled) : true);
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
        id: account?.id || crypto.randomUUID(),
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

  return (
    <div className="mg-modal-shade" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="mg-modal task-modal-modern" role="dialog" aria-modal="true">
        <header className="task-modal-header">
          <div className="task-modal-title-box">
            <div className="task-modal-icon-badge">
              <Landmark size={20} />
            </div>
            <div>
              <h2>{isNew ? "Nova Conta / Caixa" : "Editar Conta / Caixa"}</h2>
              <p>{isNew ? "Cadastre uma conta bancária, maquininha ou caixa físico de loja." : `Atualizando: ${name}`}</p>
            </div>
          </div>
          <button type="button" className="task-modal-close" onClick={onClose} disabled={busy} title="Fechar">
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
                    .filter((u) => !u.archived && (allowedUnit === "all" || u.id === allowedUnit))
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

          <footer className="task-modal-footer">
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
          </footer>
        </form>
      </div>
    </div>
  );
}

export function InstantPaymentModal({accounts,tenantId,onClose,onSaved}:{accounts:RecordData[];tenantId:string;onClose:()=>void;onSaved:()=>void}){
  const {data}=useManagement();const {user}=useAuth();const [unit,setUnit]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const banks=accounts.filter(a=>!unit||a.unitId===unit);
  return <div className="mg-modal-shade"><div className="mg-modal" role="dialog" aria-modal="true"><header><h2>Pagamento instantâneo</h2><button onClick={onClose}>×</button></header><form className="mg-form" onSubmit={async event=>{event.preventDefault();if(!user)return;setBusy(true);setError("");try{const form=new FormData(event.currentTarget);const proof=form.get("proof");const now=new Date().toISOString();const row:RecordData={id:crypto.randomUUID(),kind:"transactions",tenantId,unitId:unit,version:0,createdAt:now,updatedAt:now,createdBy:user.uid,updatedBy:user.uid,description:String(form.get("description")),date:String(form.get("date")),competence:String(form.get("date")).slice(0,7),direction:"Saída",amount:Math.round(Number(form.get("amount"))*100),bankAccountId:String(form.get("bank")),nature:"Operacional",categoryId:String(form.get("category")),paymentMethod:String(form.get("method")),externalId:crypto.randomUUID(),instantPayment:true};if(proof instanceof File&&proof.size){const {nameFileForDrive,uploadFileToDrive}=await import("@/services/driveService");const stored=await uploadFileToDrive(nameFileForDrive(proof,`Pagamento instantâneo - ${row.description}`),"payment_proofs");row.paymentProofFileId=stored.fileId;row.paymentProofFileName=stored.fileName;}await saveManagement(row,data);onSaved();}catch(e){setError(e instanceof Error?e.message:"Não foi possível registrar.");}finally{setBusy(false);}}}>
    <label className="full">Descrição<input name="description" required placeholder="Ex.: compra emergencial, motoboy ou manutenção"/></label><label>Unidade<select required value={unit} onChange={e=>setUnit(e.target.value)}><option value="">Selecione</option>{data.units.filter(u=>!u.archived).map(u=><option key={u.id} value={u.id}>{str(u,"name")}</option>)}</select></label><label>Conta bancária<select name="bank" required><option value="">Selecione</option>{banks.map(b=><option key={b.id} value={b.id}>{str(b,"name")}</option>)}</select></label><label>Data<input name="date" type="date" defaultValue={dateToday()} required/></label><label>Valor<input name="amount" type="number" min="0.01" step="0.01" required/></label><label>Categoria<select name="category" required><option value="">Selecione</option>{data.categories.filter(c=>!c.archived).map(c=><option key={c.id} value={c.id}>{str(c,"name")}</option>)}</select></label><label>Forma<select name="method" required><option>PIX</option><option>Transferência</option><option>Débito automático</option><option>Dinheiro</option><option>Outros</option></select></label><label className="full mg-file-field">Comprovante no Google Drive<input name="proof" type="file" accept=".pdf,image/*"/></label>{error&&<p className="mg-error">{error}</p>}<footer><button type="button" className="mg-button secondary" onClick={onClose}>Cancelar</button><button className="mg-button" disabled={busy}>{busy?"Salvando…":"Registrar pagamento"}</button></footer></form></div></div>
}

function TransferModal({ accounts, tenantId, onClose, onSaved }: { accounts: RecordData[]; tenantId: string; onClose: () => void; onSaved: () => void }) {
  const { data } = useManagement(); const { user } = useAuth(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  return <div className="mg-modal-shade"><div className="mg-modal" role="dialog" aria-modal="true"><header><h2>Transferência entre bancos</h2><button onClick={onClose}>×</button></header><form className="mg-form" onSubmit={async (event) => {event.preventDefault(); if(!user)return; setBusy(true);setError("");try {const form=new FormData(event.currentTarget);const from=String(form.get("from")||"");const to=String(form.get("to")||"");if(!from||!to||from===to)throw new Error("Selecione contas diferentes.");const origin=accounts.find(a=>a.id===from);if(!origin)throw new Error("Conta de origem inválida.");const now=new Date().toISOString();const row:RecordData={id:crypto.randomUUID(),kind:"bankTransfers",tenantId,unitId:origin.unitId,version:0,createdAt:now,updatedAt:now,createdBy:user.uid,updatedBy:user.uid,fromBankId:from,toBankId:to,date:String(form.get("date")),amount:Math.round(Number(form.get("amount"))*100),notes:String(form.get("notes")||"")};await saveManagement(row,data);onSaved();}catch(e){setError(e instanceof Error?e.message:"Não foi possível transferir.");}finally{setBusy(false);}}}>
    <label>Conta de origem<select name="from" required><option value="">Selecione</option>{accounts.map(a=><option key={a.id} value={a.id}>{str(a,"name")}</option>)}</select></label>
    <label>Conta de destino<select name="to" required><option value="">Selecione</option>{accounts.map(a=><option key={a.id} value={a.id}>{str(a,"name")}</option>)}</select></label>
    <label>Data<input name="date" type="date" defaultValue={dateToday()} required/></label><label>Valor<input name="amount" type="number" step="0.01" min="0.01" required/></label><label className="full">Observações<textarea name="notes" rows={3}/></label>
    {error&&<p className="mg-error">{error}</p>}<footer><button type="button" className="mg-button secondary" onClick={onClose}>Cancelar</button><button className="mg-button" disabled={busy}>{busy?"Salvando…":"Confirmar transferência"}</button></footer></form></div></div>;
}
