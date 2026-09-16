"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar,
  Building2,
  Filter,
} from "lucide-react";
import {
  dateToday,
  monthEnd,
  str,
  RecordData,
} from "@/domain/management/model";
import type { Filters } from "@/domain/management/engine";

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const MONTH_SHORT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const CHANNELS = [
  "Balcão",
  "Salão",
  "Delivery Próprio",
  "iFood",
  "Takeat",
  "WhatsApp",
  "Eventos",
];

interface ManagementPeriodFilterProps {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  units: RecordData[];
  allowedUnit: string;
  view: string;
  change: (key: keyof Filters, value: string) => void;
}

export function ManagementPeriodFilter({
  filters,
  setFilters,
  units,
  allowedUnit,
  view,
  change,
}: ManagementPeriodFilterProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const today = filters.today || dateToday();
  const currentMonthStart = today.slice(0, 7) + "-01";
  const isCurrentMonth =
    filters.start === currentMonthStart &&
    filters.end === monthEnd(currentMonthStart);

  // Extract year and month index from current filter start
  const filterYear = parseInt(filters.start.slice(0, 4), 10) || parseInt(today.slice(0, 4), 10);
  const filterMonthIdx = (parseInt(filters.start.slice(5, 7), 10) || 1) - 1;

  // Working year inside popover picker
  const [popoverYear, setPopoverYear] = useState(filterYear);

  useEffect(() => {
    setPopoverYear(filterYear);
  }, [filterYear, isPickerOpen]);

  // Click outside to close popover
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsPickerOpen(false);
      }
    }
    if (isPickerOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isPickerOpen]);

  // Quick navigation: Next / Prev Month
  const stepMonth = (delta: number) => {
    let year = filterYear;
    let month = filterMonthIdx + 1 + delta;
    if (month < 1) {
      month = 12;
      year--;
    } else if (month > 12) {
      month = 1;
      year++;
    }
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const start = `${monthStr}-01`;
    const end = monthEnd(start);
    setFilters((f) => ({ ...f, start, end }));
  };

  // Select a specific month
  const selectMonth = (year: number, monthIndex: number) => {
    const monthStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    const start = `${monthStr}-01`;
    const end = monthEnd(start);
    setFilters((f) => ({ ...f, start, end }));
    setIsPickerOpen(false);
  };

  // Select a preset period
  const selectPreset = (preset: "today" | "current_month" | "next_month" | "prev_month" | "year" | "all") => {
    if (preset === "today") {
      setFilters((f) => ({ ...f, start: today, end: today }));
    } else if (preset === "current_month") {
      const start = today.slice(0, 7) + "-01";
      setFilters((f) => ({ ...f, start, end: monthEnd(today) }));
    } else if (preset === "next_month") {
      let y = parseInt(today.slice(0, 4), 10);
      let m = parseInt(today.slice(5, 7), 10) + 1;
      if (m > 12) {
        m = 1;
        y++;
      }
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      setFilters((f) => ({ ...f, start, end: monthEnd(start) }));
    } else if (preset === "prev_month") {
      let y = parseInt(today.slice(0, 4), 10);
      let m = parseInt(today.slice(5, 7), 10) - 1;
      if (m < 1) {
        m = 12;
        y--;
      }
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      setFilters((f) => ({ ...f, start, end: monthEnd(start) }));
    } else if (preset === "year") {
      const y = today.slice(0, 4);
      setFilters((f) => ({ ...f, start: `${y}-01-01`, end: `${y}-12-31` }));
    } else if (preset === "all") {
      setFilters((f) => ({ ...f, start: "2024-01-01", end: "2030-12-31" }));
    }
    setIsPickerOpen(false);
  };

  // Human label for display on the pill
  const getPeriodLabel = () => {
    if (filters.start === "2024-01-01" && filters.end === "2030-12-31") {
      return "Todas as datas";
    }
    if (filters.start === today && filters.end === today) {
      return "Hoje";
    }
    if (
      filters.start.slice(0, 4) === filters.end.slice(0, 4) &&
      filters.start.slice(5, 10) === "01-01" &&
      filters.end.slice(5, 10) === "12-31"
    ) {
      return `Ano ${filters.start.slice(0, 4)}`;
    }
    if (
      filters.start.slice(0, 7) === filters.end.slice(0, 7) &&
      filters.start.slice(8, 10) === "01" &&
      filters.end === monthEnd(filters.start)
    ) {
      return `${MONTH_NAMES[filterMonthIdx]} ${filterYear}`;
    }
    // Custom range
    const fStart = filters.start.split("-").reverse().slice(0, 2).join("/");
    const fEnd = filters.end.split("-").reverse().slice(0, 2).join("/");
    return `${fStart} a ${fEnd}`;
  };

  return (
    <div className="mg-header-filters">
      {/* Unit Selector Pill */}
      {view !== "data" && units.length > 0 && (
        <div className="mg-pill-select" title="Filtrar por unidade">
          <Building2 size={13} className="mg-pill-icon" />
          <select
            value={allowedUnit === "all" ? filters.unitId : allowedUnit}
            disabled={allowedUnit !== "all"}
            onChange={(e) => change("unitId", e.target.value)}
            aria-label="Selecionar unidade"
          >
            <option value="">Consolidado do grupo</option>
            {units
              .filter(
                (r) =>
                  !r.archived &&
                  (!filters.companyId || r.companyId === filters.companyId) &&
                  (!filters.brandId || r.brandId === filters.brandId),
              )
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {str(r, "name")}
                </option>
              ))}
          </select>
          <ChevronDown size={12} className="mg-pill-arrow" />
        </div>
      )}

      {/* Channel Selector Pill (if view supports it) */}
      {view !== "payables" && view !== "data" && (
        <div className="mg-pill-select" title="Filtrar por canal">
          <Filter size={12} className="mg-pill-icon" />
          <select
            value={filters.channel}
            onChange={(e) => change("channel", e.target.value)}
            aria-label="Selecionar canal de vendas"
          >
            <option value="">Todos os canais</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="mg-pill-arrow" />
        </div>
      )}

      {/* Minimalist Date Stepper & Popover */}
      {view !== "data" && (
        <div className="mg-period-navigator" ref={popoverRef}>
          <button
            type="button"
            className="mg-period-nav-btn"
            onClick={() => stepMonth(-1)}
            title="Mês anterior"
            aria-label="Mês anterior"
          >
            <ChevronLeft size={14} />
          </button>

          <button
            type="button"
            className={`mg-period-label-btn ${isPickerOpen ? "is-open" : ""}`}
            onClick={() => setIsPickerOpen(!isPickerOpen)}
            title="Clique para escolher o período"
            aria-label="Escolher mês e período"
          >
            <Calendar size={13} className="mg-period-cal-icon" />
            <span className="mg-period-text">{getPeriodLabel()}</span>
            <ChevronDown size={12} className="mg-period-arrow" />
          </button>

          <button
            type="button"
            className="mg-period-nav-btn"
            onClick={() => stepMonth(1)}
            title="Próximo mês"
            aria-label="Próximo mês"
          >
            <ChevronRight size={14} />
          </button>

          {/* Quick jump back to Current Month if navigated away */}
          {!isCurrentMonth && (
            <button
              type="button"
              className="mg-period-reset-btn"
              onClick={() => selectPreset("current_month")}
              title="Voltar para o mês atual"
            >
              Mês atual
            </button>
          )}

          {/* Popover */}
          {isPickerOpen && (
            <div className="mg-period-popover">
              {/* Year Navigation */}
              <div className="mg-popover-header">
                <button
                  type="button"
                  onClick={() => setPopoverYear((y) => y - 1)}
                  className="mg-year-btn"
                  title="Ano anterior"
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="mg-popover-year">{popoverYear}</span>
                <button
                  type="button"
                  onClick={() => setPopoverYear((y) => y + 1)}
                  className="mg-year-btn"
                  title="Próximo ano"
                >
                  <ChevronRight size={13} />
                </button>
              </div>

              {/* Months Grid */}
              <div className="mg-popover-months">
                {MONTH_SHORT.map((name, idx) => {
                  const isSelected =
                    filterYear === popoverYear && filterMonthIdx === idx;
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`mg-month-tile ${isSelected ? "is-selected" : ""}`}
                      onClick={() => selectMonth(popoverYear, idx)}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>

              {/* Quick Presets */}
              <div className="mg-popover-presets">
                <button
                  type="button"
                  onClick={() => selectPreset("current_month")}
                >
                  Este mês
                </button>
                <button
                  type="button"
                  onClick={() => selectPreset("next_month")}
                >
                  Próximo mês
                </button>
                <button
                  type="button"
                  onClick={() => selectPreset("prev_month")}
                >
                  Mês passado
                </button>
                <button
                  type="button"
                  onClick={() => selectPreset("year")}
                >
                  Ano {popoverYear}
                </button>
                <button
                  type="button"
                  onClick={() => selectPreset("all")}
                >
                  Tudo (sem filtro)
                </button>
              </div>

              {/* Custom Range Drawer */}
              <div className="mg-popover-custom">
                <button
                  type="button"
                  className="mg-custom-toggle"
                  onClick={() => setCustomRangeOpen(!customRangeOpen)}
                >
                  {customRangeOpen ? "− Ocultar datas específicas" : "+ Escolher datas específicas"}
                </button>
                {customRangeOpen && (
                  <div className="mg-custom-inputs">
                    <label>
                      De
                      <input
                        type="date"
                        value={filters.start}
                        max={filters.end}
                        onChange={(e) => change("start", e.target.value)}
                      />
                    </label>
                    <label>
                      Até
                      <input
                        type="date"
                        value={filters.end}
                        min={filters.start}
                        onChange={(e) => change("end", e.target.value)}
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
