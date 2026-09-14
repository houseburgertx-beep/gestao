"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import {
  Database,
  DEFINITIONS,
  emptyDatabase,
  dateToday,
  monthEnd,
} from "@/domain/management/model";
import { subscribeManagement } from "@/services/managementService";
import type { Filters } from "@/domain/management/engine";
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
  const allowedUnit =
    userProfile?.role === "admin" || userProfile?.role === "accountant"
      ? "all"
      : userProfile?.unitId || "";
  useEffect(() => {
    setData(emptyDatabase());
    setErrors({});
    setPending(Object.keys(DEFINITIONS));
    if (!user || !userProfile || !allowedUnit) return;
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
  }, [user?.uid, userProfile?.role, tenantId, allowedUnit, revision]);
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
