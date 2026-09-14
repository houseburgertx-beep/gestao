"use client";
import React, {useState} from 'react';
import Link from 'next/link';
import {useManagement} from '@/contexts/ManagementContext';
import {useAuth} from '@/contexts/AuthContext';
import {store} from '@/services/store';
import {scopeUnits} from '@/domain/management/engine';
import {withTakeat} from '@/domain/management/takeat';
import {currency, str, monthEnd, addDays} from '@/domain/management/model';
import {persistTakeatReports} from '@/services/takeatManagementService';
import type {UnitId} from '@/types';
export function TakeatConnection() {
 const {data,filters,allowedUnit,tenantId}=useManagement(); const {userProfile}=useAuth();
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const units=scopeUnits(data,{...filters,unitId:allowedUnit==='all'?filters.unitId:allowedUnit}).filter(u=>['teixeira','eunapolis','foodpark'].includes(u.id));
 const transformed=withTakeat(data,filters);
 const sync=async()=>{
  setBusy(true);setMessage('Consultando Takeat…');
  const results:string[]=[];
  try{
   const end=filters.end<filters.today?filters.end:filters.today;
   const periods:string[]=[];
   if(filters.start.endsWith('-01') && filters.end===monthEnd(filters.start)) periods.push(filters.start.slice(0,7));
   else {for(let d=filters.start;d<=end && periods.length<32;d=addDays(d,1)) periods.push(d);}
   if(periods.length>31) throw new Error('Selecione um mês ou um intervalo de até 31 dias para atualizar.');
   for(const u of units) for(const period of periods){
    setMessage(`Atualizando ${str(u,'name')} · ${period}`);
    const result=await store.syncTakeatUnit(u.id as Exclude<UnitId,'all'>,period,userProfile?.role==='manager'?'gestor':'admin',allowedUnit);
    if(!result.success){results.push(`${str(u,'name')}: ${result.error}`);break;}
    await persistTakeatReports(store.getTakeatRevenues().filter(r=>r.unitId===u.id),tenantId,allowedUnit);
   }
   setMessage(results.length?results.join(' • '):'Faturamento atualizado e compartilhado com os painéis, metas, DRE e comparativos.');
  }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível atualizar.');}finally{setBusy(false);}
 };
 return <section className="mg-panel">
  <div className="mg-toolbar"><div><h2>Vendas das lojas · Takeat</h2><p className="mg-method">A mesma origem alimenta todas as telas. Faturamento não representa recebimento bancário.</p></div><Link className="mg-button secondary" href="/integracoes/takeat">Conexão Takeat</Link><button className="mg-button" onClick={sync} disabled={busy||!units.length||!['admin','accountant','manager'].includes(userProfile?.role||'')}>{busy?'Atualizando…':'Atualizar vendas'}</button></div>
  <div className="mg-grid">{units.map(u=>{
   const rows=transformed.revenues.filter(r=>r.unitId===u.id && r.source==='takeat' && (!filters.channel||r.channel===filters.channel));
   const total=rows.length?rows.reduce((s,r)=>s+Number(r.gross||0),0):null;
   const last=rows.map(r=>str(r,'syncedAt')).sort().at(-1);
   const through=rows.map(r=>str(r,'periodEnd')).sort().at(-1);
   return <div className="mg-kpi" key={u.id}><span className="mg-label">{str(u,'name')}</span><strong>{currency(total)}</strong><small>{through?`Dados importados até ${through.split('-').reverse().join('/')}`:'Sem relatório para o período selecionado'}</small>{last&&<small>Sincronizado em {new Date(last).toLocaleString('pt-BR')}</small>}</div>;
  })}</div>
  <p className="mg-method">Relatórios mensais alimentam o acumulado do mês. Para semanas ou dias, selecione o intervalo e atualize as vendas. Descontos, impostos, custos e saldo bancário dependem de suas próprias fontes.</p>
  {message&&<p role="status" className="mg-status-message">{message}</p>}
 </section>;
}
