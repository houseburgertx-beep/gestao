"use client";
import { AlertTriangle, Calculator, CheckCircle2, ClipboardCheck, Plus, Wallet } from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { currency, dateToday, str } from "@/domain/management/model";
import { RecordTable } from "@/components/management/RecordTable";
import "@/components/management/management.css";

export function CashWorkspace({ mode }: { mode: "closing" | "conference" }) {
  const { data, filters } = useManagement(); const kind=mode==="closing"?"cashClosings":"cashConferences"; const rows=data[kind].filter(r=>!r.archived); const today=dateToday(); const todayRows=rows.filter(r=>str(r,"date")===today);
  const differences=mode==="closing"?todayRows.map(r=>Number(r.countedCash||0)-(Number(r.openingAmount||0)+Number(r.cashSales||0)-Number(r.withdrawals||0))):todayRows.map(r=>Number(r.difference||0));
  const difference=differences.reduce((s,v)=>s+v,0);
  return <div className="workspace-shell cash-workspace"><header className="workspace-header"><div><span className="workspace-eyebrow">CONTROLE DIÁRIO</span><h1>{mode==="closing"?"Fechamento de caixa":"Conferência de caixa"}</h1><p>{mode==="closing"?"Operadores registram os valores do turno e eventuais ocorrências.":"O financeiro confere o caixa informado e identifica divergências."}</p></div><button className="workspace-primary" onClick={()=>window.dispatchEvent(new CustomEvent(`open-${kind}-form`))}><Plus size={16}/> Novo registro</button></header>
  <section className="workspace-metrics"><Metric icon={Wallet} tone="purple" label="Registros de hoje" value={String(todayRows.length)}/><Metric icon={Calculator} tone="blue" label="Diferença do dia" value={currency(difference)}/><Metric icon={AlertTriangle} tone="red" label="Com divergência" value={String(differences.filter(v=>v!==0).length)}/><Metric icon={CheckCircle2} tone="green" label="Sem diferença" value={String(differences.filter(v=>v===0).length)}/></section>
  <RecordTable kind={kind} filters={filters}/></div>;
}
function Metric({icon:Icon,tone,label,value}:{icon:typeof ClipboardCheck;tone:string;label:string;value:string}){return <div className={`workspace-metric ${tone}`}><span><Icon size={18}/></span><div><small>{label}</small><strong className={value.length>8?"compact":""}>{value}</strong></div></div>}
