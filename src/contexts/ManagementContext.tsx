"use client";
import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import {
  Database,
  DEFINITIONS,
  emptyDatabase,
  dateToday,
  monthEnd,
  cents,
} from "@/domain/management/model";
import { flushManagementQueue, saveManagement, subscribeManagement } from "@/services/managementService";
import { store } from "@/services/store";
import { persistTakeatReports, subscribeTakeatReports } from "@/services/takeatManagementService";
import type { RecordData } from "@/domain/management/model";
import type { Filters } from "@/domain/management/engine";
import { normalizeRole } from "@/components/layout/managementNavigation";
import { useAuth } from "./AuthContext";
interface State {
  data: Database;
  errors: Record<string, string>;
  loading: boolean;
  tenantId: string;
  allowedUnit: string;
  reload: () => void;
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
}
const defaultFilters = (): Filters => {
  const today = dateToday();
  return {
    start: today.slice(0, 7) + "-01",
    end: monthEnd(today),
    today,
    unitId: "",
    companyId: "",
    brandId: "",
    group: "",
    channel: "",
  };
};
const Context = createContext<State>({
  data: emptyDatabase(),
  errors: {},
  loading: true,
  tenantId: "",
  allowedUnit: "all",
  reload: () => {},
  filters: defaultFilters(),
  setFilters: () => {},
});
export function ManagementProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, userProfile } = useAuth();
  const [filters, setFilters] = useState(defaultFilters);
  const [preferencesReady, setPreferencesReady] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("gestao_filter_preferences") || "null",
      );
      if (
        saved &&
        /^\d{4}-\d{2}-\d{2}$/.test(saved.start) &&
        /^\d{4}-\d{2}-\d{2}$/.test(saved.end) &&
        saved.start <= saved.end
      )
        setFilters({ ...defaultFilters(), ...saved, today: dateToday() });
    } catch {}
    setPreferencesReady(true);
    const timer = setInterval(
      () =>
        setFilters((f) =>
          f.today === dateToday() ? f : { ...f, today: dateToday() },
        ),
      30000,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (preferencesReady)
      localStorage.setItem(
        "gestao_filter_preferences",
        JSON.stringify(filters),
      );
  }, [filters, preferencesReady]);
  const [data, setData] = useState(emptyDatabase);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(Object.keys(DEFINITIONS));
  const [revision, setRevision] = useState(0);
  const tenantId =
    (userProfile as typeof userProfile & { tenantId?: string })?.tenantId ||
    "house190";
  const normRole = normalizeRole(userProfile?.role);
  const isFinanceOrAdmin = normRole === "admin" || normRole === "accountant";
  const allowedUnit = isFinanceOrAdmin ? "all" : (userProfile?.unitId || "all");
  useEffect(() => {
    setData(emptyDatabase());
    setErrors({});
    setPending(Object.keys(DEFINITIONS));
    if (!user || !userProfile) return;
    return subscribeManagement(
      tenantId,
      allowedUnit,
      (kind, rows) => {
        setData((previous) => ({ ...previous, [kind]: rows }));
        setErrors((previous) => {
          const next = { ...previous };
          delete next[kind];
          return next;
        });
        setPending((p) => p.filter((k) => k !== kind));
      },
      (kind) => {
        setErrors((previous) => ({
          ...previous,
          [kind]:
            "Não foi possível ler esta base. Verifique conexão e autorização.",
        }));
        setPending((p) => p.filter((k) => k !== kind));
      },
    );
  }, [user?.uid, userProfile?.role, userProfile?.unitId, tenantId, allowedUnit, revision]);
  useEffect(() => {
    if (!user || pending.length) return;
    const syncPending = () => {
      flushManagementQueue(data).then((saved) => { if (saved) setRevision((value) => value + 1); }).catch(() => {});
    };
    const timer = window.setTimeout(syncPending, 1500);
    const interval = window.setInterval(syncPending, 15 * 60 * 1000);
    window.addEventListener("online", syncPending);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("online", syncPending);
    };
  }, [user?.uid, pending.length, revision]);
  useEffect(() => {
    if(!user || !userProfile || !allowedUnit) return;
    let stopped=false;
    let cloud: RecordData[]=[];
    const refresh=()=>{
      const local=(tenantId==='house190'?store.getTakeatRevenues():[]).filter(r=>allowedUnit==='all'||r.unitId===allowedUnit);
      const map=new Map(cloud.map(r=>[`${r.unitId}_${r.date}`,r]));
      for(const r of local) {
        const key=`${r.unitId}_${r.date}`;
        if(!map.has(key)||String(map.get(key)?.syncedAt)<r.syncedAt) map.set(key,{...r,kind:'takeatReports',tenantId} as unknown as RecordData);
      }
      setData(d=>({...d,takeatReports:Array.from(map.values())}));
      if(userProfile.role==='admin'||userProfile.role==='manager'||userProfile.role==='accountant') persistTakeatReports(local,tenantId,allowedUnit).catch(()=>{
        if(!stopped) setErrors(e=>({...e,takeat:'Faturamento disponível neste dispositivo; não foi possível salvar a cópia compartilhada. Tente atualizar.'}));
      });
    };
    const unsub=subscribeTakeatReports(tenantId,allowedUnit,rows=>{
      cloud=rows; refresh();
      setErrors(e=>{const next={...e};delete next.takeat;return next;});
    },()=>setErrors(e=>({...e,takeat:'Não foi possível consultar a integração Takeat.'})));
    refresh();
    window.addEventListener('house190_data_updated',refresh);
    window.addEventListener('storage',refresh);
    return ()=>{stopped=true;unsub();window.removeEventListener('house190_data_updated',refresh);window.removeEventListener('storage',refresh);};
  },[user?.uid, userProfile?.role,tenantId,allowedUnit,revision]);
  const migratingGoals=useRef(new Set<string>());
  useEffect(()=>{
    if(!user || userProfile?.role!=='admin' || pending.length || tenantId!=='house190') return;
    for(const g of store.getStoredGoals()) {
      const start=`${g.year}-${String(g.month).padStart(2,'0')}-01`;
      if(!data.units.some(u=>u.id===g.unitId) || !Number.isFinite(g.targetAmount) || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(start)) continue;
      const id=`existing-goal-${g.unitId}-${start.slice(0,7)}`;
      if(migratingGoals.current.has(id)||data.goals.some(r=>r.unitId===g.unitId&&r.start===start)) continue;
      migratingGoals.current.add(id);
      const now=new Date().toISOString();
      const record:RecordData={id,kind:'goals',tenantId,unitId:g.unitId,version:0,createdAt:now,updatedAt:now,createdBy:user.uid,updatedBy:user.uid,description:'Meta cadastrada da loja',frequency:'Mensal',start,end:monthEnd(start),channel:'',target:cents(g.targetAmount),source:'existing-goal'};
      if(Number.isFinite(g.superTargetAmount)) record.superTarget=cents(g.superTargetAmount!);
      saveManagement(record,data).catch(()=>setErrors(e=>({...e,goalsMigration:'Uma meta existente precisa de revisão em Cadastros. Nenhuma meta foi substituída.'})));
    }
  },[user?.uid,userProfile?.role,pending.length,data.units,data.goals,tenantId]);
  return (
    <Context.Provider
      value={{
        data,
        errors,
        loading: pending.length > 0,
        tenantId,
        allowedUnit,
        filters,
        setFilters,
        reload: () => setRevision((v) => v + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useManagement = () => useContext(Context);
