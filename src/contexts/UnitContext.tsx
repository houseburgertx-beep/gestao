"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { UnitId, Unit } from "@/types";
import { useManagement } from "./ManagementContext";
import { UNITS } from "@/data/mockData";

interface UnitContextType {
  currentUnit: UnitId;
  setCurrentUnit: (unit: UnitId) => void;
  units: Unit[];
  activeUnitData: Unit;
  filterByUnit: <T extends { unitId?: UnitId | Exclude<UnitId, "all"> }>(items: T[]) => T[];
}

const UnitContext = createContext<UnitContextType | undefined>(undefined);

const STORAGE_KEY = "house190_active_unit";

export function UnitProvider({ children }: { children: React.ReactNode }) {
  const { filters, setFilters, allowedUnit } = useManagement();
  const [currentUnit, setCurrentUnitState] = useState<UnitId>("all");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (allowedUnit !== "all") {
      setCurrentUnitState(allowedUnit as UnitId);
      setFilters((f) => ({ ...f, unitId: allowedUnit }));
      return;
    }
    const saved = localStorage.getItem(STORAGE_KEY) as UnitId | null;
    if (saved && UNITS.some((u) => u.id === saved)) {
      setCurrentUnitState(saved);
      setFilters((f) => ({ ...f, unitId: saved === "all" ? "" : saved }));
    }
  }, [allowedUnit, setFilters]);

  useEffect(() => {
    if (allowedUnit !== "all") {
      if (currentUnit !== allowedUnit) {
        setCurrentUnitState(allowedUnit as UnitId);
      }
      return;
    }
    const selected = filters.unitId || "all";
    if (selected !== currentUnit && UNITS.some((u) => u.id === selected)) {
      setCurrentUnitState(selected as UnitId);
    }
  }, [filters.unitId, allowedUnit, currentUnit]);

  const setCurrentUnit = (unit: UnitId) => {
    const target = allowedUnit === "all" ? unit : (allowedUnit as UnitId);
    setFilters((f) => ({ ...f, unitId: target === "all" ? "" : target }));
    setCurrentUnitState(target);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, target);
    }
  };

  const availableUnits = allowedUnit === "all"
    ? UNITS
    : UNITS.filter((u) => u.id === allowedUnit);

  const activeUnitData = UNITS.find((u) => u.id === currentUnit) || availableUnits[0] || UNITS[0];

  const filterByUnit = <T extends { unitId?: UnitId | Exclude<UnitId, "all"> }>(items: T[]): T[] => {
    const effectiveUnit = allowedUnit !== "all" ? allowedUnit : currentUnit;
    if (effectiveUnit === "all") return items;
    return items.filter((item) => !item.unitId || item.unitId === "all" || item.unitId === effectiveUnit);
  };

  return (
    <UnitContext.Provider
      value={{
        currentUnit,
        setCurrentUnit,
        units: availableUnits,
        activeUnitData,
        filterByUnit,
      }}
    >
      {children}
    </UnitContext.Provider>
  );
}

export function useUnit() {
  const context = useContext(UnitContext);
  if (!context) {
    throw new Error("useUnit must be used within a UnitProvider");
  }
  return context;
}
