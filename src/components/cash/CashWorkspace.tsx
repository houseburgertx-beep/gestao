"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, Calculator, CheckCircle2, ClipboardCheck, Download, Edit3, FileCheck2, FileText, Landmark, Percent, Plus, Search, Sliders, Upload, Users, Wallet, X } from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import { currency, dateToday, RecordData, str } from "@/domain/management/model";
import { commitRecords, saveManagement } from "@/services/managementService";
import { downloadFileFromDrive, nameFileForDrive, uploadFileToDrive } from "@/services/driveService";
import { validate } from "@/domain/management/operations";
import "@/components/management/management.css";

const safeUUID = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 11) + Date.now().toString(36);

const n=(value:FormDataEntryValue|null)=>Math.max(0,Math.round(Number(value||0)*100));
const brl=(value:number)=>currency(Math.round(value));
const parseBankAmounts=(row:RecordData):Record<string,{credit:number;debit:number;pix:number}>=>{
  try{
    return JSON.parse(str(row,"reviewedBankAmountsJson")||str(row,"bankAmountsJson")||"{}");
  }catch{
    return {};
  }
};
const parseAttachments=(row:RecordData):Array<{fileId:string;fileName:string;mimeType:string;size:number}>=>{
  try{
    const parsed = JSON.parse(str(row,"attachmentsJson")||"[]");
    return Array.isArray(parsed) ? parsed : [];
  }catch{
    return [];
  }
};
const closingValue=(row:RecordData,key:string,fallback=0)=>typeof row[key]==="number"?Number(row[key]):fallback;

type ClosingCalc={systemTotal:number;confirmedTotal:number;cashExpected:number;cashFound:number;cashDifference:number;creditFound:number;creditDifference:number;debitFound:number;debitDifference:number;pixFound:number;pixDifference:number;difference:number;motoboyDifference:number;invoiceDifference:number};
const emptyCalc:ClosingCalc={systemTotal:0,confirmedTotal:0,cashExpected:0,cashFound:0,cashDifference:0,creditFound:0,creditDifference:0,debitFound:0,debitDifference:0,pixFound:0,pixDifference:0,difference:0,motoboyDifference:0,invoiceDifference:0};

export function CashWorkspace({ mode }: { mode: "closing" | "conference" }) {
  const { data } = useManagement(); const { userProfile }=useAuth();
  const [closingOpen,setClosingOpen]=useState(false); const [reviewing,setReviewing]=useState<RecordData|null>(null); const [message,setMessage]=useState("");
  const [confTab,setConfTab]=useState<"queue"|"audit"|"rates">("queue");
  const [queueFilter,setQueueFilter]=useState<string>("all");
  useEffect(()=>{if(mode!=="closing")return;const open=()=>setClosingOpen(true);window.addEventListener("open-cashClosings-form",open);return()=>window.removeEventListener("open-cashClosings-form",open);},[mode]);
  const today=dateToday(); const closings=data.cashClosings.filter(row=>!row.archived).sort((a,b)=>str(b,"date").localeCompare(str(a,"date")));
  const visible=mode==="closing"?(userProfile?.role==="operator"?closings.filter(r=>r.unitId===userProfile.unitId):closings):closings.filter(r=>r.status!=="Rascunho");
  const todayRows=visible.filter(r=>str(r,"date")===today); const difference=todayRows.reduce((sum,row)=>sum+Number(row.difference||0),0); const pending=closings.filter(row=>row.status==="Aguardando conferência"||row.status==="Com divergência");
  const filteredQueue=visible.filter(row=>{
    if(queueFilter==="pending")return row.status==="Aguardando conferência";
    if(queueFilter==="divergent")return row.status==="Com divergência";
    if(queueFilter==="reviewed")return row.status==="Conferido";
    return true;
  });

  return <div className="workspace-shell cash-workspace">
    <header className="workspace-header"><div><span className="workspace-eyebrow">FECHAMENTO DE CAIXA HOUSE 190</span><h1>{mode==="closing"?"Fechamento de caixa":"Conferência financeira"}</h1><p>{mode==="closing"?"Entrada total e conciliação objetiva de Dinheiro, Crédito, Débito e PIX.":"Compare os valores apurados, revise divergências, audite motoboys e aprove os saldos líquidos dos bancos."}</p></div>{mode==="closing"&&<button className="workspace-primary" onClick={()=>setClosingOpen(true)}><Plus size={16}/> Novo fechamento</button>}</header>
    <section className="workspace-metrics">
      <Metric icon={Wallet} tone="purple" label="Registros de hoje" value={String(todayRows.length)}/>
      <Metric icon={Calculator} tone={difference===0?"green":"red"} label="Diferença do dia" value={brl(difference)}/>
      <Metric icon={AlertTriangle} tone={pending.length>0?"red":"blue"} label="Aguardando financeiro" value={String(pending.length)}/>
      <Metric icon={CheckCircle2} tone="green" label="Conferidos" value={String(closings.filter(r=>r.status==="Conferido").length)}/>
    </section>
    {message&&<p className="workspace-message">{message}</p>}

    {mode==="conference"&&(
      <div className="cash-subtabs">
        <button className={`cash-subtab ${confTab==="queue"?"active":""}`} onClick={()=>setConfTab("queue")}>
          <ClipboardCheck size={16}/> Caixas para conferência <b>{pending.length}</b>
        </button>
        <button className={`cash-subtab ${confTab==="audit"?"active":""}`} onClick={()=>setConfTab("audit")}>
          <FileText size={16}/> Auditoria de Motoboys & Notas <b>{closings.length}</b>
        </button>
        <button className={`cash-subtab ${confTab==="rates"?"active":""}`} onClick={()=>setConfTab("rates")}>
          <Percent size={16}/> Taxas das Máquinas & Bancos
        </button>
      </div>
    )}

    {mode==="conference"&&confTab==="audit"?(
      <AuditHistoryTab closings={closings} />
    ):mode==="conference"&&confTab==="rates"?(
      <BankRatesTab />
    ):(
      <section className="cash-list">
        <header>
          <div>
            <span>{mode==="closing"?"HISTÓRICO":"FILA FINANCEIRA"}</span>
            <h2>{mode==="closing"?"Fechamentos registrados":"Caixas para conferência"}</h2>
          </div>
          {mode==="conference"&&(
            <div className="flex items-center gap-1.5 flex-wrap">
              <button className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${queueFilter==="all"?"bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300":"text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`} onClick={()=>setQueueFilter("all")}>
                Todos ({visible.length})
              </button>
              <button className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${queueFilter==="pending"?"bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300":"text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`} onClick={()=>setQueueFilter("pending")}>
                Pendentes ({visible.filter(r=>r.status==="Aguardando conferência").length})
              </button>
              <button className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${queueFilter==="divergent"?"bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300":"text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`} onClick={()=>setQueueFilter("divergent")}>
                Divergências ({visible.filter(r=>r.status==="Com divergência").length})
              </button>
              <button className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${queueFilter==="reviewed"?"bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300":"text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`} onClick={()=>setQueueFilter("reviewed")}>
                Conferidos ({visible.filter(r=>r.status==="Conferido").length})
              </button>
            </div>
          )}
          <b>{filteredQueue.length}</b>
        </header>
        {filteredQueue.length?filteredQueue.map(row=>{
          const unit=data.units.find(u=>u.id===row.unitId);
          const hasDiff=Number(row.difference||0)!==0;
          return <article key={row.id}>
            <div className="cash-status-icon"><ClipboardCheck size={18}/></div>
            <div>
              <strong>{unit?.name||"Unidade"}</strong>
              <span>{str(row,"date").split("-").reverse().join("/")} · Turno {str(row,"shift")} · {str(row,"operatorName")}</span>
              {Number(row.sangriaAmount||0)>0&&(
                <small className="cash-sangria-badge">
                  Sangria: {brl(Number(row.sangriaAmount))} ({str(row,"sangriaStatus")||"Registrada"}{str(row,"sangriaRecipient")?` · ${str(row,"sangriaRecipient")}`:""})
                </small>
              )}
            </div>
            <div>
              <small>Entrada total</small>
              <b>{currency(Number(row.systemTotal||0))}</b>
            </div>
            <div>
              <small>Diferença total</small>
              <b className={!hasDiff?"ok":"bad"}>{currency(Number(row.difference||0))}</b>
            </div>
            <span className={`cash-badge ${str(row,"status").toLowerCase().replace(/\s+/g,"-")}`}>{str(row,"status")}</span>
            {mode==="conference"&&<button className="workspace-primary" onClick={()=>setReviewing(row)}><BadgeCheck size={15}/> {row.status==="Conferido"?"Rever":"Conferir Caixa"}</button>}
          </article>;
        }):<div className="people-empty"><FileCheck2 size={30}/><strong>Nenhum fechamento encontrado</strong><span>{mode==="closing"?"Use “Novo fechamento” para iniciar.":"Nenhum caixa encontrado para este filtro."}</span></div>}
      </section>
    )}

    {closingOpen&&<ClosingModal onClose={()=>setClosingOpen(false)} onSaved={()=>{setClosingOpen(false);setMessage("Fechamento enviado ao financeiro para conferência.");}}/>}
    {reviewing&&<ConferenceModal closing={reviewing} onClose={()=>setReviewing(null)} onSaved={()=>{setReviewing(null);setMessage("Conferência aprovada e saldos bancários atualizados com desconto de taxas.");}}/>}
  </div>;
}

function Modal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean}){return <div className="mg-modal-shade"><div className={`mg-modal ${wide?"cash-modal-wide":""}`} role="dialog" aria-modal="true"><header><h2>{title}</h2><button onClick={onClose}><X size={20}/></button></header>{children}</div></div>}

function ClosingModal({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
  const {data,tenantId,allowedUnit}=useManagement();const {user,userProfile}=useAuth();const [unit,setUnit]=useState(allowedUnit==="all"?"":allowedUnit);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [calc,setCalc]=useState<ClosingCalc>(emptyCalc);const [selected,setSelected]=useState<Record<string,boolean>>({});const [outflows,setOutflows]=useState([{id:safeUUID(),name:"",amount:""}]);const [pixRequests,setPixRequests]=useState([{id:safeUUID(),name:"",key:"",description:"",amount:""}]);
  const banks=data.bankAccounts.filter(row=>!row.archived&&row.unitId===unit);
  const recalc=(form:HTMLFormElement)=>{const f=new FormData(form);const systemCash=n(f.get("systemCash")),systemCredit=n(f.get("systemCredit")),systemDebit=n(f.get("systemDebit")),systemPix=n(f.get("systemPix"));let creditFound=0,debitFound=0,pixFound=0;banks.filter(b=>f.get(`used_${b.id}`)==="on").forEach(bank=>{creditFound+=n(f.get(`credit_${bank.id}`));debitFound+=n(f.get(`debit_${bank.id}`));pixFound+=n(f.get(`pix_${bank.id}`));});const other=n(f.get("systemIfoodOnline"))+n(f.get("systemIfoodVoucher"))+n(f.get("systemTerm"))+n(f.get("systemClub"))+n(f.get("systemAccrual"));const cashOutflows=outflows.reduce((sum,row)=>sum+n(row.amount as FormDataEntryValue),0);const cashExpected=n(f.get("openingAmount"))+systemCash+n(f.get("cashIn"))-cashOutflows;const cashFound=n(f.get("sangriaAmount"))+n(f.get("closingFloat"));const cashDifference=cashFound-cashExpected,creditDifference=creditFound-systemCredit,debitDifference=debitFound-systemDebit,pixDifference=pixFound-systemPix,motoboyDifference=n(f.get("motoboyPaid"))-n(f.get("motoboySystem")),invoiceDifference=n(f.get("ifoodAudit"))+n(f.get("fiscalMachines"))-n(f.get("invoiceIssued"));setCalc({systemTotal:systemCash+systemCredit+systemDebit+systemPix+other,confirmedTotal:cashFound+creditFound+debitFound+pixFound,cashExpected,cashFound,cashDifference,creditFound,creditDifference,debitFound,debitDifference,pixFound,pixDifference,difference:cashDifference+creditDifference+debitDifference+pixDifference,motoboyDifference,invoiceDifference});};
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!user)return;setBusy(true);setError("");try{const f=new FormData(event.currentTarget);const bankAmounts:Record<string,{credit:number;debit:number;pix:number}>={};banks.filter(bank=>selected[bank.id]).forEach(bank=>bankAmounts[bank.id]={credit:n(f.get(`credit_${bank.id}`)),debit:n(f.get(`debit_${bank.id}`)),pix:n(f.get(`pix_${bank.id}`))});if(!Object.keys(bankAmounts).length&&(n(f.get("systemCredit"))+n(f.get("systemDebit"))+n(f.get("systemPix")))>0)throw new Error("Selecione ao menos uma máquina/banco utilizado.");const requestedPix=pixRequests.filter(item=>item.name.trim()||item.key.trim()||item.description.trim()||Number(item.amount)>0);if(requestedPix.some(item=>!item.name.trim()||!item.key.trim()||!item.description.trim()||Number(item.amount)<=0))throw new Error("Preencha nome, chave PIX, descrição e valor em cada solicitação PIX.");const files=f.getAll("attachments").filter(x=>x instanceof File&&x.size) as File[];if(files.length>5)throw new Error("Envie no máximo 5 comprovantes.");const attachments=[];for(const file of files){const saved=await uploadFileToDrive(nameFileForDrive(file,`Fechamento ${String(f.get("date"))} - ${unit}`),"payment_proofs");attachments.push({fileId:saved.fileId,fileName:saved.fileName,mimeType:saved.mimeType,size:saved.size});}const now=new Date().toISOString();const closingId=`closing-${String(f.get("date"))}-${unit}-unico`;
    const sangriaVal=n(f.get("sangriaAmount"));
    const sangriaStatus=sangriaVal>0?String(f.get("sangriaStatus")||"Na loja"):"";
    const sangriaRecipient=sangriaVal>0?String(f.get("sangriaRecipient")||"").trim():"";
    if(sangriaVal>0&&!sangriaRecipient)throw new Error("Informe para quem foi entregue a sangria ou onde está guardada na loja.");
    const row:RecordData={id:closingId,kind:"cashClosings",tenantId,unitId:unit,version:0,createdAt:now,updatedAt:now,createdBy:user.uid,updatedBy:user.uid,date:String(f.get("date")),shift:"Único",operatorName:String(f.get("operatorName")),systemCash:n(f.get("systemCash")),systemCredit:n(f.get("systemCredit")),systemDebit:n(f.get("systemDebit")),systemPix:n(f.get("systemPix")),systemIfoodOnline:n(f.get("systemIfoodOnline")),systemIfoodVoucher:n(f.get("systemIfoodVoucher")),systemTerm:n(f.get("systemTerm")),systemClub:n(f.get("systemClub")),systemAccrual:n(f.get("systemAccrual")),openingAmount:n(f.get("openingAmount")),cashIn:n(f.get("cashIn")),cashOutflows:n(f.get("cashOutflows")),cashOutflowsJson:JSON.stringify(outflows.filter(item=>item.name.trim()||Number(item.amount)>0)),sangriaAmount:sangriaVal,sangriaStatus,sangriaRecipient,closingFloat:n(f.get("closingFloat")),bankAmountsJson:JSON.stringify(bankAmounts),systemTotal:calc.systemTotal,countedTotal:calc.confirmedTotal,cashExpected:calc.cashExpected,cashFound:calc.cashFound,cashDifference:calc.cashDifference,creditFound:calc.creditFound,creditDifference:calc.creditDifference,debitFound:calc.debitFound,debitDifference:calc.debitDifference,pixFound:calc.pixFound,pixDifference:calc.pixDifference,difference:calc.difference,motoboySystem:n(f.get("motoboySystem")),motoboyPaid:n(f.get("motoboyPaid")),motoboyDifference:calc.motoboyDifference,ifoodAudit:n(f.get("ifoodAudit")),fiscalMachines:n(f.get("fiscalMachines")),invoiceIssued:n(f.get("invoiceIssued")),invoiceDifference:calc.invoiceDifference,pixRequestsJson:JSON.stringify(requestedPix),attachmentsJson:JSON.stringify(attachments),status:calc.difference===0?"Aguardando conferência":"Com divergência",notes:String(f.get("notes")||"")};const payables=requestedPix.map(request=>({id:`pix-${closingId}-${request.id}`,kind:"payables" as const,tenantId,unitId:unit,version:0,createdAt:now,updatedAt:now,createdBy:user.uid,updatedBy:user.uid,obligationType:"Outros",description:`PIX — ${request.description} (${request.name})`,competence:String(f.get("date")).slice(0,7),dueDate:String(f.get("date")),amount:Math.round(Number(request.amount)*100),paymentMethod:"PIX",status:"Pendente",nature:"Operacional",sourceId:closingId,pixKey:request.key,notes:`Solicitação criada no fechamento de caixa. Chave PIX: ${request.key}`})) as RecordData[];[row,...payables].forEach(record=>validate(record,data));await commitRecords([row,...payables],data,row);onSaved();}catch(e){const message=e instanceof Error?e.message:"Não foi possível salvar o fechamento.";setError(/quota exceeded|resource exhausted/i.test(message)?"O Firebase atingiu o limite temporário de uso. Nenhum fechamento foi confirmado; tente novamente mais tarde.":message);}finally{setBusy(false);}};
  return <Modal title="Novo fechamento de caixa" onClose={onClose} wide><form className="cash-form" onChange={e=>recalc(e.currentTarget)} onSubmit={submit}>
    <section><h3>1. Identificação</h3><div className="cash-fields identification-fields"><label>Unidade<select required value={unit} disabled={allowedUnit!=="all"} onChange={e=>{setUnit(e.target.value);setSelected({});}}><option value="">Selecione</option>{data.units.filter(u=>!u.archived&&(allowedUnit==="all"||u.id===allowedUnit)).map(u=><option key={u.id} value={u.id}>{str(u,"name")}</option>)}</select></label><label>Data<input name="date" type="date" defaultValue={dateToday()} required/></label><label>Operador<input name="operatorName" defaultValue={userProfile?.displayName||""} required/></label></div></section>
    <section className="cash-system-section"><header className="cash-section-title"><div><span className="cash-step">ETAPA 2</span><h3>Valores do sistema</h3><p>Informe o que apareceu no sistema de vendas.</p></div><div className="entry-total"><span>ENTRADA TOTAL</span><strong>{brl(calc.systemTotal)}</strong></div></header><div className="cash-primary-grid"><Money name="systemCash" label="Dinheiro"/><Money name="systemCredit" label="Crédito"/><Money name="systemDebit" label="Débito"/><Money name="systemPix" label="PIX"/></div><p className="cash-reconciliation-note">Estes quatro valores serão comparados na conferência financeira.</p><details className="other-receipts"><summary><span>Adicionar outros recebimentos</span><small>iFood, voucher, notas, clube e acréscimos</small></summary><div className="cash-extra-grid"><Money name="systemIfoodOnline" label="iFood Online"/><Money name="systemIfoodVoucher" label="iFood Voucher"/><Money name="systemTerm" label="Notas a prazo/boleto"/><Money name="systemClub" label="Resgate Clube"/><Money name="systemAccrual" label="Acréscimos"/></div></details></section>
    <section><h3>3. Fechamento do dinheiro</h3><p className="cash-formula">Saldo inicial + entrada em dinheiro + suprimentos − saídas = sangria + troco final</p><div className="cash-money-grid"><Money name="openingAmount" label="Saldo inicial/troco"/><Money name="cashIn" label="Suprimentos/entradas"/><Money name="sangriaAmount" label="Sangria/retirada"/><Money name="closingFloat" label="Troco final"/></div>
    <div className="cash-sangria-details"><label>Destino da sangria<select name="sangriaStatus"><option value="Na loja">Está guardado na loja</option><option value="Entregue a responsável">Entregue a responsável</option></select></label><label className="cash-sangria-recipient">Para quem foi entregue / Localização na loja<input name="sangriaRecipient" placeholder="Ex.: Gerente João / Cofre do escritório" /></label></div>
    <input type="hidden" name="cashOutflows" value={outflows.reduce((sum,row)=>sum+Number(row.amount||0),0)}/><div className="cash-outflows"><header><div><strong>Saídas em dinheiro</strong><small>Registre cada valor retirado do caixa.</small></div><button type="button" className="cash-add" onClick={()=>setOutflows(rows=>[...rows,{id:safeUUID(),name:"",amount:""}])}>+ Adicionar saída</button></header>{outflows.map((row,index)=><div className="cash-outflow-row" key={row.id}><label>Nome/descrição<input value={row.name} placeholder="Ex.: motoboy, compra ou fornecedor" onChange={e=>setOutflows(rows=>rows.map(item=>item.id===row.id?{...item,name:e.target.value}:item))}/></label><label>Valor<input type="number" min="0" step="0.01" value={row.amount} placeholder="R$ 0,00" onChange={e=>setOutflows(rows=>rows.map(item=>item.id===row.id?{...item,amount:e.target.value}:item))}/></label>{outflows.length>1&&<button type="button" className="cash-remove" aria-label={`Remover saída ${index+1}`} onClick={()=>setOutflows(rows=>rows.filter(item=>item.id!==row.id))}>×</button>}</div>)}<footer>Total de saídas <b>{brl(outflows.reduce((sum,row)=>sum+Number(row.amount||0)*100,0))}</b></footer></div><div className="cash-equation"><span>Esperado: <b>{brl(calc.cashExpected)}</b></span><span>Encontrado: <b>{brl(calc.cashFound)}</b></span><Difference value={calc.cashDifference}/></div></section>
    <section><div className="pix-request-heading"><div><h3>Solicitações de PIX</h3><p>Os pedidos abaixo entrarão em Contas a Pagar como pendentes.</p></div><button type="button" className="cash-add" onClick={()=>setPixRequests(rows=>[...rows,{id:safeUUID(),name:"",key:"",description:"",amount:""}])}>+ Adicionar PIX</button></div><div className="pix-request-list">{pixRequests.map((row,index)=><div className="pix-request-row" key={row.id}><label>Nome<input value={row.name} placeholder="Favorecido" onChange={e=>setPixRequests(rows=>rows.map(item=>item.id===row.id?{...item,name:e.target.value}:item))}/></label><label>Chave PIX<input value={row.key} placeholder="CPF, telefone, e-mail..." onChange={e=>setPixRequests(rows=>rows.map(item=>item.id===row.id?{...item,key:e.target.value}:item))}/></label><label>Descrição<input value={row.description} placeholder="Motivo do pagamento" onChange={e=>setPixRequests(rows=>rows.map(item=>item.id===row.id?{...item,description:e.target.value}:item))}/></label><label>Valor<input type="number" min="0" step="0.01" value={row.amount} placeholder="R$ 0,00" onChange={e=>setPixRequests(rows=>rows.map(item=>item.id===row.id?{...item,amount:e.target.value}:item))}/></label>{pixRequests.length>1&&<button type="button" className="cash-remove" aria-label={`Remover solicitação PIX ${index+1}`} onClick={()=>setPixRequests(rows=>rows.filter(item=>item.id!==row.id))}>×</button>}</div>)}</div></section>
    <section><h3>4. Conferência de Crédito, Débito e PIX</h3><p className="cash-hint">Marque somente as máquinas/bancos utilizados no turno e informe os valores encontrados.</p>{banks.length?<div className="machine-grid">{banks.map(bank=><article key={bank.id} className={selected[bank.id]?"selected":""}><label className="machine-toggle"><input name={`used_${bank.id}`} type="checkbox" checked={!!selected[bank.id]} onChange={e=>setSelected(s=>({...s,[bank.id]:e.target.checked}))}/><strong><Landmark size={15}/>{str(bank,"name")}</strong></label><Money name={`credit_${bank.id}`} label="Crédito" disabled={!selected[bank.id]}/><Money name={`debit_${bank.id}`} label="Débito" disabled={!selected[bank.id]}/><Money name={`pix_${bank.id}`} label="PIX" disabled={!selected[bank.id]}/></article>)}</div>:<p className="cash-hint">Selecione a unidade para carregar suas máquinas e bancos.</p>}</section>
    <section><h3>5. Resultado da conciliação</h3><div className="reconciliation-grid"><Result label="Dinheiro" systemValue={calc.cashExpected} found={calc.cashFound} difference={calc.cashDifference}/><Result label="Crédito" systemValue={calc.creditFound-calc.creditDifference} found={calc.creditFound} difference={calc.creditDifference}/><Result label="Débito" systemValue={calc.debitFound-calc.debitDifference} found={calc.debitFound} difference={calc.debitDifference}/><Result label="PIX" systemValue={calc.pixFound-calc.pixDifference} found={calc.pixFound} difference={calc.pixDifference}/></div><div className={`total-divergence ${calc.difference===0?"ok":"bad"}`}><span>DIVERGÊNCIA TOTAL</span><strong>{brl(calc.difference)}</strong><small>{calc.difference===0?"Fechamento sem divergência":calc.difference>0?"Sobra encontrada":"Falta encontrada"}</small></div></section>
    <section><h3>6. Auditorias do dia</h3><p className="cash-hint">Motoboys e notas fiscais são conferências separadas do fechamento principal.</p><div className="audit-grid"><article><strong>Auditoria de motoboys</strong><Money name="motoboySystem" label="Valor no sistema"/><Money name="motoboyPaid" label="Valor realmente pago"/><b>Diferença: {brl(calc.motoboyDifference)}</b></article><article><strong>Auditoria de notas fiscais</strong><Money name="ifoodAudit" label="Valor vendido no iFood"/><Money name="fiscalMachines" label="Máquinas fiscais"/><Money name="invoiceIssued" label="Nota fiscal emitida"/><b>Diferença: {brl(calc.invoiceDifference)}</b></article></div><label className="employee-file-upload"><Upload size={15}/> Anexar comprovantes no Google Drive<input name="attachments" type="file" multiple className="sr-only" accept=".pdf,image/*"/></label><label>Observações<textarea name="notes" rows={3} placeholder="Explique faltas, sobras ou ocorrências do turno."/></label></section>
    {error&&<p className="mg-error">{error}</p>}<footer><button type="button" className="mg-button secondary" onClick={onClose}>Cancelar</button><button className="mg-button" disabled={busy||!unit}>{busy?"Enviando…":"Enviar ao financeiro"}</button></footer>
  </form></Modal>;
}

function ConferenceModal({closing,onClose,onSaved}:{closing:RecordData;onClose:()=>void;onSaved:()=>void}){
  const {data,tenantId}=useManagement();const {user,userProfile}=useAuth();const [review,setReview]=useState(false);
  const initialSaved=useMemo(()=>parseBankAmounts(closing),[closing]);
  const allBanks=data.bankAccounts.filter(b=>!b.archived&&b.unitId===closing.unitId);
  const banks=allBanks.filter(b=>initialSaved[b.id]!==undefined);

  // Editable bank values: credit, debit, pix per bank
  const [bankVals,setBankVals]=useState<Record<string,{credit:number;debit:number;pix:number}>>(()=>
    Object.fromEntries(banks.map(b=>[b.id,{
      credit:Number(initialSaved[b.id]?.credit||0),
      debit:Number(initialSaved[b.id]?.debit||0),
      pix:Number(initialSaved[b.id]?.pix||0)
    }]))
  );

  // Editable cash found
  const [cashFound,setCashFound]=useState<number>(()=>closingValue(closing,"cashFound"));

  const [checks,setChecks]=useState({cash:false,credit:false,debit:false,pix:false});
  const [notes,setNotes]=useState(()=>str(closing,"notes")||"");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  // Sum up credit, debit, pix from editable bank values
  const totalCreditFound=Object.values(bankVals).reduce((s,b)=>s+b.credit,0);
  const totalDebitFound=Object.values(bankVals).reduce((s,b)=>s+b.debit,0);
  const totalPixFound=Object.values(bankVals).reduce((s,b)=>s+b.pix,0);

  const cashExpected=closingValue(closing,"cashExpected");
  const systemCredit=closingValue(closing,"systemCredit");
  const systemDebit=closingValue(closing,"systemDebit");
  const systemPix=closingValue(closing,"systemPix");

  const cashDiff=cashFound-cashExpected;
  const creditDiff=totalCreditFound-systemCredit;
  const debitDiff=totalDebitFound-systemDebit;
  const pixDiff=totalPixFound-systemPix;
  const totalDiff=cashDiff+creditDiff+debitDiff+pixDiff;

  const rows=[
    {key:"cash" as const,label:"Dinheiro",system:cashExpected,found:cashFound,difference:cashDiff},
    {key:"credit" as const,label:"Crédito",system:systemCredit,found:totalCreditFound,difference:creditDiff},
    {key:"debit" as const,label:"Débito",system:systemDebit,found:totalDebitFound,difference:debitDiff},
    {key:"pix" as const,label:"PIX",system:systemPix,found:totalPixFound,difference:pixDiff}
  ];

  // Fee deductions calculation per bank
  const bankCalculations=useMemo(()=>{
    return banks.map(bank=>{
      const vals=bankVals[bank.id]||{credit:0,debit:0,pix:0};
      const creditPct=Number(bank.creditFeePct||0);
      const debitPct=Number(bank.debitFeePct||0);
      const pixPct=Number(bank.pixFeePct||0);

      const grossAmount=vals.credit+vals.debit+vals.pix;
      const creditFee=Math.round(vals.credit*(creditPct/100));
      const debitFee=Math.round(vals.debit*(debitPct/100));
      const pixFee=Math.round(vals.pix*(pixPct/100));
      const totalFees=creditFee+debitFee+pixFee;
      const netAmount=grossAmount-totalFees;

      return {
        bank,
        vals,
        creditPct,
        debitPct,
        pixPct,
        grossAmount,
        creditFee,
        debitFee,
        pixFee,
        totalFees,
        netAmount
      };
    });
  },[banks,bankVals]);

  const allChecked=Object.values(checks).every(Boolean);
  const hasDifference=totalDiff!==0;

  const save=async()=>{
    if(!user)return;
    if(!allChecked){setError("Confirme as quatro conciliações antes de concluir.");return}
    if(hasDifference&&!notes.trim()){setError("Explique a divergência antes de aprovar.");return}
    setBusy(true);setError("");
    try{
      const now=new Date().toISOString();
      const before=Object.fromEntries(banks.map(b=>[b.id,typeof b.balance==="number"?b.balance:null]));
      const afterNetValues=Object.fromEntries(bankCalculations.map(c=>[c.bank.id,c.netAmount]));

      // Update bank account balances with NET amounts (or gross if no fees)
      const updates=bankCalculations.map(calcItem=>{
        const prevBal=typeof calcItem.bank.balance==="number"?Number(calcItem.bank.balance):0;
        // In cash closing conference, the balance is updated by adding net receipts to the bank account
        const newBalance=prevBal+calcItem.netAmount;
        return {
          ...calcItem.bank,
          balance:Math.round(newBalance),
          balanceDate:str(closing,"date"),
          reconciled:true,
          updatedAt:now,
          updatedBy:user.uid
        };
      });

      // Dedicated Sangria Account handling
      const sangriaAmount=Number(closing.sangriaAmount||0);
      let sangriaAccountUpdate:RecordData|null=null;
      if(sangriaAmount>0){
        const unitObj=data.units.find(u=>u.id===closing.unitId);
        const sangriaAccountName=`Caixa Sangria - ${unitObj?.name||"Unidade"}`;
        const existingSangriaAccount=data.bankAccounts.find(
          b=>!b.archived&&b.unitId===closing.unitId&&(b.isSangriaAccount||b.name===sangriaAccountName)
        );

        if(existingSangriaAccount){
          const prevSangriaBal=typeof existingSangriaAccount.balance==="number"?Number(existingSangriaAccount.balance):0;
          sangriaAccountUpdate={
            ...existingSangriaAccount,
            balance:prevSangriaBal+sangriaAmount,
            balanceDate:str(closing,"date"),
            reconciled:true,
            updatedAt:now,
            updatedBy:user.uid
          };
        } else {
          sangriaAccountUpdate={
            id:`bank-sangria-${closing.unitId}`,
            kind:"bankAccounts",
            tenantId,
            unitId:closing.unitId,
            version:0,
            createdAt:now,
            updatedAt:now,
            createdBy:user.uid,
            updatedBy:user.uid,
            name:sangriaAccountName,
            bank:"Caixa físico de Sangria",
            balance:sangriaAmount,
            balanceDate:str(closing,"date"),
            isSangriaAccount:true,
            reconciled:true,
            notes:`Conta criada automaticamente para controle das sangrias da loja ${unitObj?.name||""}.`
          };
        }
      }

      const conference:RecordData={
        id:`conference-${closing.id}`,
        kind:"cashConferences",
        tenantId,
        unitId:closing.unitId,
        version:0,
        createdAt:now,
        updatedAt:now,
        createdBy:user.uid,
        updatedBy:user.uid,
        date:str(closing,"date"),
        closingId:closing.id,
        operatorName:str(closing,"operatorName"),
        beforeBalancesJson:JSON.stringify(before),
        afterBalancesJson:JSON.stringify(afterNetValues),
        checksJson:JSON.stringify(checks),
        difference:totalDiff,
        status:hasDifference?"Com divergência":"Conferido",
        reviewedBy:userProfile?.displayName||user.email||user.uid,
        notes:notes.trim()||"Conferência aprovada com conciliação bancária."
      };

      const updatedClosing:RecordData={
        ...closing,
        status:hasDifference?"Com divergência":"Conferido",
        cashFound,
        cashDifference:cashDiff,
        creditFound:totalCreditFound,
        creditDifference:creditDiff,
        debitFound:totalDebitFound,
        debitDifference:debitDiff,
        pixFound:totalPixFound,
        pixDifference:pixDiff,
        difference:totalDiff,
        reviewedBankAmountsJson:JSON.stringify(bankVals),
        netBankAmountsJson:JSON.stringify(afterNetValues),
        updatedAt:now,
        updatedBy:user.uid,
        conferenceNotes:notes.trim()
      };

      const recordsToCommit:RecordData[]=[...updates,conference,updatedClosing];
      if(sangriaAccountUpdate){
        recordsToCommit.push(sangriaAccountUpdate);
      }

      await commitRecords(recordsToCommit,data,conference);
      onSaved();
    }catch(e){
      setError(e instanceof Error?e.message:"Não foi possível concluir a conferência.");
    }finally{
      setBusy(false);
    }
  };

  return <Modal title="Conferência financeira do caixa" onClose={onClose} wide>
    <div className="conference-flow">
      <div className="conference-summary">
        <div>
          <span>FECHAMENTO DE CAIXA</span>
          <strong>{str(closing,"date").split("-").reverse().join("/")} · {str(closing,"shift")}</strong>
          <small>Operador: {str(closing,"operatorName")} · Entrada total no sistema: {currency(Number(closing.systemTotal||0))}</small>
        </div>
        {Number(closing.sangriaAmount||0)>0&&(
          <div className="conference-sangria-info">
            <span>SANGRIA REGISTRADA</span>
            <strong>{brl(Number(closing.sangriaAmount))}</strong>
            <small>Status: {str(closing,"sangriaStatus")||"Na loja"} · {str(closing,"sangriaRecipient")||"Responsável não especificado"}</small>
          </div>
        )}
      </div>

      <section className="conference-reconciliation">
        <header className="conference-header-flex">
          <div>
            <h3>Conciliação dos 4 valores (editáveis se necessário)</h3>
            <p>Se o valor físico encontrado diferir do informado pelo operador, ajuste os campos abaixo.</p>
          </div>
        </header>

        <div className="conference-table">
          <div className="head">
            <span>Forma</span>
            <span>Sistema / Esperado</span>
            <span>Encontrado (Conferido)</span>
            <span>Diferença</span>
            <span>Conferido</span>
          </div>

          {/* Cash row (editable) */}
          <div className="line">
            <strong>Dinheiro</strong>
            <span>{brl(cashExpected)}</span>
            <div className="conf-editable-cell">
              <input
                type="number"
                step="0.01"
                min="0"
                value={cashFound/100}
                disabled={review}
                onChange={e=>setCashFound(Math.round(Number(e.target.value)*100))}
              />
            </div>
            <Difference value={cashDiff}/>
            <label>
              <input type="checkbox" checked={checks.cash} disabled={review} onChange={e=>setChecks(c=>({...c,cash:e.target.checked}))}/> OK
            </label>
          </div>

          {/* Credit row */}
          <div className="line">
            <strong>Crédito</strong>
            <span>{brl(systemCredit)}</span>
            <span>{brl(totalCreditFound)}</span>
            <Difference value={creditDiff}/>
            <label>
              <input type="checkbox" checked={checks.credit} disabled={review} onChange={e=>setChecks(c=>({...c,credit:e.target.checked}))}/> OK
            </label>
          </div>

          {/* Debit row */}
          <div className="line">
            <strong>Débito</strong>
            <span>{brl(systemDebit)}</span>
            <span>{brl(totalDebitFound)}</span>
            <Difference value={debitDiff}/>
            <label>
              <input type="checkbox" checked={checks.debit} disabled={review} onChange={e=>setChecks(c=>({...c,debit:e.target.checked}))}/> OK
            </label>
          </div>

          {/* Pix row */}
          <div className="line">
            <strong>PIX</strong>
            <span>{brl(systemPix)}</span>
            <span>{brl(totalPixFound)}</span>
            <Difference value={pixDiff}/>
            <label>
              <input type="checkbox" checked={checks.pix} disabled={review} onChange={e=>setChecks(c=>({...c,pix:e.target.checked}))}/> OK
            </label>
          </div>
        </div>

        <div className={`total-divergence ${totalDiff===0?"ok":"bad"}`}>
          <span>DIVERGÊNCIA TOTAL RECALCULADA</span>
          <strong>{currency(totalDiff)}</strong>
          <small>{totalDiff===0?"Sem divergência":totalDiff>0?"Sobra encontrada":"Falta encontrada"}</small>
        </div>

        {hasDifference&&<label className="conference-notes">Parecer obrigatório da divergência<textarea rows={2} value={notes} disabled={review} onChange={e=>setNotes(e.target.value)} placeholder="Explique detalhadamente a causa da divergência."/></label>}
      </section>

      {/* Breakdown per bank/machine with editable credit, debit, pix and automatic fee discount */}
      <section className="conference-machines-section">
        <h3>Detalhamento por máquina/banco e desconto de taxas</h3>
        <p className="cash-hint-left">Ajuste os valores por máquina se o comprovante físico diferir do digitado. As taxas configuradas são deduzidas automaticamente.</p>

        <div className="conference-bank-cards">
          {bankCalculations.map(c=>(
            <article key={c.bank.id} className="conf-machine-card">
              <header className="conf-machine-head">
                <strong><Landmark size={15}/> {str(c.bank,"name")}</strong>
                <span>Saldo atual: {typeof c.bank.balance==="number"?currency(Number(c.bank.balance)):"R$ 0,00"}</span>
              </header>

              <div className="conf-machine-inputs">
                <label>
                  <span>Crédito (Taxa: {c.creditPct}%)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={review}
                    value={c.vals.credit/100}
                    onChange={e=>{
                      const val=Math.round(Number(e.target.value)*100);
                      setBankVals(b=>{
                        const prev=b[c.bank.id]||{credit:0,debit:0,pix:0};
                        return {...b,[c.bank.id]:{...prev,credit:val}};
                      });
                    }}
                  />
                  {c.creditFee>0&&<small className="fee-cut">- {brl(c.creditFee)} de taxa</small>}
                </label>

                <label>
                  <span>Débito (Taxa: {c.debitPct}%)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={review}
                    value={c.vals.debit/100}
                    onChange={e=>{
                      const val=Math.round(Number(e.target.value)*100);
                      setBankVals(b=>{
                        const prev=b[c.bank.id]||{credit:0,debit:0,pix:0};
                        return {...b,[c.bank.id]:{...prev,debit:val}};
                      });
                    }}
                  />
                  {c.debitFee>0&&<small className="fee-cut">- {brl(c.debitFee)} de taxa</small>}
                </label>

                <label>
                  <span>PIX (Taxa: {c.pixPct}%)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={review}
                    value={c.vals.pix/100}
                    onChange={e=>{
                      const val=Math.round(Number(e.target.value)*100);
                      setBankVals(b=>{
                        const prev=b[c.bank.id]||{credit:0,debit:0,pix:0};
                        return {...b,[c.bank.id]:{...prev,pix:val}};
                      });
                    }}
                  />
                  {c.pixFee>0&&<small className="fee-cut">- {brl(c.pixFee)} de taxa</small>}
                </label>
              </div>

              <footer className="conf-machine-foot">
                <div>
                  <small>Bruto: <b>{brl(c.grossAmount)}</b></small>
                  {c.totalFees>0&&<small className="fee-total">Taxas: -{brl(c.totalFees)}</small>}
                </div>
                <div className="conf-net-highlight">
                  <span>Líquido a creditar:</span>
                  <strong>{brl(c.netAmount)}</strong>
                </div>
              </footer>
            </article>
          ))}
        </div>
      </section>

      {review&&(
        <div className="confirmation-box">
          <CheckCircle2 size={22}/>
          <div>
            <strong>Confirme a aprovação e a liquidação dos saldos</strong>
            <p>Os valores líquidos (com desconto das taxas) serão adicionados às respectivas contas bancárias. {Number(closing.sangriaAmount||0)>0&&`A sangria de ${brl(Number(closing.sangriaAmount))} será registrada na conta Caixa Sangria da unidade.`}</p>
          </div>
        </div>
      )}

      {error&&<p className="mg-error">{error}</p>}

      <footer>
        <button type="button" className="mg-button secondary" onClick={review?()=>setReview(false):onClose}>
          {review?"Voltar e ajustar":"Cancelar"}
        </button>
        <button
          type="button"
          className="mg-button"
          disabled={busy||!banks.length}
          onClick={review?save:()=>{
            if(!allChecked){setError("Confirme Dinheiro, Crédito, Débito e PIX marcando as caixas OK.");return}
            if(hasDifference&&!notes.trim()){setError("Explique a divergência antes de continuar.");return}
            setError("");setReview(true);
          }}
        >
          {busy?"Atualizando bancos…":review?"Confirmar e atualizar bancos":"Revisar e aprovar"}
        </button>
      </footer>
    </div>
  </Modal>;
}

// History tab for motoboy audits and fiscal invoices
function AuditHistoryTab({closings}:{closings:RecordData[]}){
  const {data}=useManagement();
  const [search,setSearch]=useState("");
  const [filterUnit,setFilterUnit]=useState("");
  const [downloading,setDownloading]=useState<string|null>(null);

  const filtered=closings.filter(c=>{
    if(filterUnit&&c.unitId!==filterUnit)return false;
    if(search){
      const text=`${str(c,"operatorName")} ${str(c,"notes")} ${str(c,"date")}`.toLowerCase();
      if(!text.includes(search.toLowerCase()))return false;
    }
    return true;
  });

  const downloadAttachment=async(fileId:string,fileName:string)=>{
    try{
      setDownloading(fileId);
      await downloadFileFromDrive(fileId,fileName);
    }catch(e){
      alert(e instanceof Error?e.message:"Erro ao baixar arquivo do Drive.");
    }finally{
      setDownloading(null);
    }
  };

  const totalMotoboyPaid = filtered.reduce((s, r) => s + closingValue(r, "motoboyPaid"), 0);
  const totalMotoboyDiff = filtered.reduce((s, r) => s + closingValue(r, "motoboyDifference"), 0);
  const totalInvoiceIssued = filtered.reduce((s, r) => s + closingValue(r, "invoiceIssued"), 0);
  const totalInvoiceDiff = filtered.reduce((s, r) => s + closingValue(r, "invoiceDifference"), 0);

  return (
    <section className="cash-audit-history-section">
      <header className="cash-audit-header">
        <div>
          <h2>Histórico de Conferências de Motoboys & Notas Fiscais</h2>
          <p>Auditorias detalhadas registradas em cada fechamento de caixa por unidade.</p>
        </div>
        <div className="cash-audit-filters">
          <select value={filterUnit} onChange={e=>setFilterUnit(e.target.value)}>
            <option value="">Todas as unidades</option>
            {data.units.filter(u=>!u.archived).map(u=><option key={u.id} value={u.id}>{str(u,"name")}</option>)}
          </select>
          <div className="cash-audit-search">
            <Search size={14}/>
            <input placeholder="Buscar por operador ou data..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
        </div>
      </header>

      <div className="cash-audit-kpis">
        <div className="cash-audit-kpi-pill">
          <span>Motoboy Total Pago</span>
          <strong>{brl(totalMotoboyPaid)}</strong>
        </div>
        <div className={`cash-audit-kpi-pill ${totalMotoboyDiff === 0 ? "ok" : "bad"}`}>
          <span>Diferença Motoboys</span>
          <strong>{brl(totalMotoboyDiff)}</strong>
        </div>
        <div className="cash-audit-kpi-pill">
          <span>Notas Emitidas</span>
          <strong>{brl(totalInvoiceIssued)}</strong>
        </div>
        <div className={`cash-audit-kpi-pill ${totalInvoiceDiff === 0 ? "ok" : "bad"}`}>
          <span>Diferença Notas</span>
          <strong>{brl(totalInvoiceDiff)}</strong>
        </div>
      </div>

      <div className="cash-audit-table-wrap">
        <table className="cash-audit-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Unidade / Operador</th>
              <th>Motoboy Sistema</th>
              <th>Motoboy Pago</th>
              <th>Dif. Motoboy</th>
              <th>iFood Vendas</th>
              <th>Máq. Fiscais</th>
              <th>Nota Emitida</th>
              <th>Dif. Notas</th>
              <th>Comprovantes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row=>{
              const unit=data.units.find(u=>u.id===row.unitId);
              const motoboyDiff=closingValue(row,"motoboyDifference");
              const invoiceDiff=closingValue(row,"invoiceDifference");
              const attachments=parseAttachments(row);

              return (
                <tr key={row.id}>
                  <td>
                    <strong>{str(row,"date").split("-").reverse().join("/")}</strong>
                    <small>{str(row,"shift")}</small>
                  </td>
                  <td>
                    <strong>{unit?.name||"Unidade"}</strong>
                    <small>{str(row,"operatorName")}</small>
                  </td>
                  <td>{brl(closingValue(row,"motoboySystem"))}</td>
                  <td>{brl(closingValue(row,"motoboyPaid"))}</td>
                  <td>
                    <Difference value={motoboyDiff}/>
                  </td>
                  <td>{brl(closingValue(row,"ifoodAudit"))}</td>
                  <td>{brl(closingValue(row,"fiscalMachines"))}</td>
                  <td>{brl(closingValue(row,"invoiceIssued"))}</td>
                  <td>
                    <Difference value={invoiceDiff}/>
                  </td>
                  <td>
                    {attachments.length>0?(
                      <div className="audit-attachments-list">
                        {attachments.map(att=>(
                          <button
                            key={att.fileId}
                            className="audit-att-btn"
                            disabled={downloading===att.fileId}
                            onClick={()=>downloadAttachment(att.fileId,att.fileName)}
                            title={`Baixar ${att.fileName}`}
                          >
                            <Download size={12}/> {(att.fileName || "Comprovante").slice(0,18)}...
                          </button>
                        ))}
                      </div>
                    ):(
                      <span className="no-attachments">Nenhum</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!filtered.length&&(
              <tr>
                <td colSpan={10} className="empty-table-msg">
                  Nenhum fechamento com auditoria encontrado para os filtros selecionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Tab to configure fee percentages per bank / card machine
function BankRatesTab(){
  const {data}=useManagement();
  const {user}=useAuth();
  const [unitFilter,setUnitFilter]=useState("");
  const [rates,setRates]=useState<Record<string,{credit:string;debit:string;pix:string}>>(()=>{
    return Object.fromEntries(data.bankAccounts.filter(b=>!b.archived).map(b=>[
      b.id,
      {
        credit:String(b.creditFeePct??0),
        debit:String(b.debitFeePct??0),
        pix:String(b.pixFeePct??0)
      }
    ]));
  });
  const [savingId,setSavingId]=useState<string|null>(null);
  const [successMsg,setSuccessMsg]=useState("");

  const accounts=data.bankAccounts.filter(b=>!b.archived&&(unitFilter===""||b.unitId===unitFilter));

  const saveRatesForBank=async(bank:RecordData)=>{
    if(!user)return;
    setSavingId(bank.id);
    setSuccessMsg("");
    try{
      const current=rates[bank.id]||{credit:"0",debit:"0",pix:"0"};
      const updated:RecordData={
        ...bank,
        creditFeePct:Number(current.credit)||0,
        debitFeePct:Number(current.debit)||0,
        pixFeePct:Number(current.pix)||0,
        updatedAt:new Date().toISOString(),
        updatedBy:user.uid
      };
      await saveManagement(updated,data);
      setSuccessMsg(`Taxas salvas com sucesso para "${str(bank,"name")}"!`);
      setTimeout(()=>setSuccessMsg(""),4000);
    }catch(e){
      alert(e instanceof Error?e.message:"Erro ao salvar taxas do banco.");
    }finally{
      setSavingId(null);
    }
  };

  return (
    <section className="cash-rates-section">
      <header className="cash-rates-header">
        <div>
          <h2>Cadastro de Taxas por Banco / Máquina</h2>
          <p>Defina as alíquotas percentuais de Crédito, Débito e PIX para cada máquina. Ao conferir o caixa, os valores serão deduzidos automaticamente antes de atualizar o saldo do banco.</p>
        </div>
        <select value={unitFilter} onChange={e=>setUnitFilter(e.target.value)}>
          <option value="">Todas as unidades</option>
          {data.units.filter(u=>!u.archived).map(u=><option key={u.id} value={u.id}>{str(u,"name")}</option>)}
        </select>
      </header>

      {successMsg&&<div className="cash-rates-success">{successMsg}</div>}

      <div className="bank-rates-grid">
        {accounts.map(bank=>{
          const unit=data.units.find(u=>u.id===bank.unitId);
          const current=rates[bank.id]||{credit:"0",debit:"0",pix:"0"};
          const isBusy=savingId===bank.id;

          return (
            <article key={bank.id} className="bank-rate-card">
              <header>
                <Landmark size={18}/>
                <div>
                  <strong>{str(bank,"name")}</strong>
                  <small>{unit?.name||"Geral"} · {str(bank,"bank")||"Conta"}</small>
                </div>
              </header>

              <div className="bank-rate-inputs">
                <label>
                  <span>Taxa Crédito (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={current.credit}
                    onChange={e=>setRates(r=>{
                      const prev=r[bank.id]||{credit:"0",debit:"0",pix:"0"};
                      return {...r,[bank.id]:{...prev,credit:e.target.value}};
                    })}
                    placeholder="Ex.: 2.89"
                  />
                </label>

                <label>
                  <span>Taxa Débito (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={current.debit}
                    onChange={e=>setRates(r=>{
                      const prev=r[bank.id]||{credit:"0",debit:"0",pix:"0"};
                      return {...r,[bank.id]:{...prev,debit:e.target.value}};
                    })}
                    placeholder="Ex.: 1.15"
                  />
                </label>

                <label>
                  <span>Taxa PIX (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={current.pix}
                    onChange={e=>setRates(r=>{
                      const prev=r[bank.id]||{credit:"0",debit:"0",pix:"0"};
                      return {...r,[bank.id]:{...prev,pix:e.target.value}};
                    })}
                    placeholder="Ex.: 0.00"
                  />
                </label>
              </div>

              <footer>
                <button
                  type="button"
                  className="workspace-primary rate-save-btn"
                  disabled={isBusy}
                  onClick={()=>saveRatesForBank(bank)}
                >
                  {isBusy?"Salvando...":"Salvar taxas"}
                </button>
              </footer>
            </article>
          );
        })}
        {!accounts.length&&(
          <div className="people-empty">
            <Landmark size={28}/>
            <strong>Nenhum banco ou máquina encontrado.</strong>
          </div>
        )}
      </div>
    </section>
  );
}

function Money({name,label,disabled=false}:{name:string;label:string;disabled?:boolean}){return <label>{label}<input name={name} type="number" step="0.01" min="0" defaultValue="0" disabled={disabled}/></label>}
function Difference({value}:{value:number}){return <span className={`difference-pill ${value===0?"ok":value>0?"surplus":"shortage"}`}>{value===0?"Confere":`${value>0?"Sobra":"Falta"} ${brl(Math.abs(value))}`}</span>}
function Result({label,systemValue,found,difference}:{label:string;systemValue:number;found:number;difference:number}){return <article><strong>{label}</strong><span>Esperado <b>{brl(systemValue)}</b></span><span>Encontrado <b>{brl(found)}</b></span><Difference value={difference}/></article>}
function Metric({icon:Icon,tone,label,value}:{icon:typeof ClipboardCheck;tone:string;label:string;value:string}){return <div className={`workspace-metric ${tone}`}><span><Icon size={18}/></span><div><small>{label}</small><strong className={value.length>8?"compact":""}>{value}</strong></div></div>}

