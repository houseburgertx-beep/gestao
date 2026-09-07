"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Building } from "lucide-react";
import { useUnit } from "@/contexts/UnitContext";
import { UnitId } from "@/types";
import { cn } from "@/lib/utils";

export function UnitSelector() {
  const { currentUnit, setCurrentUnit, units, activeUnitData } = useUnit();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-200/80 bg-white hover:bg-zinc-50 text-xs font-medium text-zinc-800 transition-colors shadow-sm dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        <Building className="h-3.5 w-3.5 text-zinc-500" />
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          {activeUnitData.shortName}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-zinc-400 ml-1" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-72 rounded-lg border border-zinc-200 bg-white shadow-lg py-1 z-50 dark:bg-zinc-900 dark:border-zinc-800">
          <div className="px-3 py-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800">
            Selecionar Unidade Ativa
          </div>
          {units.map((u) => {
            const isSelected = u.id === currentUnit;
            return (
              <button
                key={u.id}
                onClick={() => {
                  setCurrentUnit(u.id);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors",
                  isSelected
                    ? "bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                )}
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block px-1 py-0.5 rounded text-[9px] font-mono bg-zinc-200/70 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {u.code}
                    </span>
                    <span>{u.name}</span>
                  </div>
                  {u.address && (
                    <span className="text-[10px] text-zinc-400 pl-6 truncate max-w-[220px]">
                      {u.address}
                    </span>
                  )}
                </div>
                {isSelected && <Check className="h-3.5 w-3.5 text-zinc-900 dark:text-zinc-100" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
