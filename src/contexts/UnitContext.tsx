"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { UnitId, Unit } from "@/types";
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
  const [currentUnit, setCurrentUnitState] = useState<UnitId>("all");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem(STORAGE_KEY) as UnitId | null;
    if (saved && UNITS.some((u) => u.id === saved)) {
      setCurrentUnitState(saved);
    }
  }, []);

  const setCurrentUnit = (unit: UnitId) => {
    setCurrentUnitState(unit);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, unit);
    }
  };

  const activeUnitData = UNITS.find((u) => u.id === currentUnit) || UNITS[0];

  const filterByUnit = <T extends { unitId?: UnitId | Exclude<UnitId, "all"> }>(items: T[]): T[] => {
    if (currentUnit === "all") return items;
    return items.filter((item) => !item.unitId || item.unitId === "all" || item.unitId === currentUnit);
  };

  return (
    <UnitContext.Provider
      value={{
        currentUnit,
        setCurrentUnit,
        units: UNITS,
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
