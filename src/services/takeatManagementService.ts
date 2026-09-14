"use client";
import { collection, doc, onSnapshot, query, where, runTransaction } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type { RecordData } from '@/domain/management/model';
import type { TakeatRevenueRecord } from '@/types/takeat';

export function subscribeTakeatReports(tenantId:string, unitId:string, next:(rows:RecordData[])=>void, error:()=>void) {
 const filters=[where('tenantId','==',tenantId)];
 if(unitId!=='all') filters.push(where('unitId','==',unitId));
 return onSnapshot(query(collection(db,'takeat_reports'),...filters),s=>next(s.docs.map(d=>d.data() as RecordData)),error);
}
export async function persistTakeatReports(records:TakeatRevenueRecord[], tenantId:string, allowedUnit:string) {
 const uid=auth.currentUser?.uid;
 if(!uid) return;
 for(const record of records) {
  if(record.source!=='takeat' || !['teixeira','eunapolis','foodpark'].includes(record.unitId) || (allowedUnit!=='all' && record.unitId!==allowedUnit) || !/^\d{4}-\d{2}(-\d{2})?$/.test(record.date) || !Number.isFinite(record.totalRevenue) || !Number.isFinite(Date.parse(record.syncedAt))) continue;
  const id=`${tenantId}_${record.unitId}_${record.date}`;
  const ref=doc(db,'takeat_reports',id);
  await runTransaction(db,async tx=>{
   const previous=await tx.get(ref);
   if(previous.exists() && previous.data().syncedAt>=record.syncedAt) return;
   // Explicit allowlist: never persist Takeat credentials or arbitrary local fields.
   const values:Record<string,unknown>={id,kind:'takeatReports',tenantId,unitId:record.unitId,date:record.date,source:'takeat',syncedAt:record.syncedAt,totalRevenue:record.totalRevenue,updatedBy:uid};
   for(const key of ['salao','delivery','ifood','rawBalcony','rawTable','rawDelivery','rawIfood'] as const) if(Number.isFinite(record[key])) values[key]=record[key];
   tx.set(ref,values);
  });
 }
}
