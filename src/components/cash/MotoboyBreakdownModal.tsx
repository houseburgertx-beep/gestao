"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, RotateCw, X } from "lucide-react";
import {
  fetchTakeatMotoboySummary,
  TakeatMotoboyBreakdownItem,
  TakeatMotoboySummary,
} from "@/services/takeatService";
import { brl, formatShortDate, parseMotoboyBreakdown } from "./cashHelpers";

export function MotoboyBreakdownModal({
  unitId,
  unitName,
  date,
  summary: initialSummary = null,
  savedBreakdownJson,
  onSynced,
  onClose,
}: {
  unitId: string;
  unitName: string;
  date: string;
  summary?: TakeatMotoboySummary | null;
  savedBreakdownJson?: unknown;
  onSynced?: (summary: TakeatMotoboySummary) => void;
  onClose: () => void;
}) {
  const [liveSummary, setLiveSummary] = useState<TakeatMotoboySummary | null>(initialSummary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const savedRows = useMemo(() => parseMotoboyBreakdown(savedBreakdownJson), [savedBreakdownJson]);

  const loadFromTakeat = async () => {
    if (!unitId || unitId === "all" || unitId === "central" || !date) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTakeatMotoboySummary(unitId, date);
      setLiveSummary(res);
      if (onSynced) onSynced(res);
    } catch (err: any) {
      setError(err?.message || "Não foi possível consultar a Takeat.");
    } finally {
      setLoading(false);
    }
  };

  // Se abriu sem dados ao vivo (ex.: histórico ou conferência), busca da Takeat automaticamente
  useEffect(() => {
    if (!liveSummary && unitId && unitId !== "all" && unitId !== "central" && date) {
      loadFromTakeat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, date]);

  // Fechar com Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows: TakeatMotoboyBreakdownItem[] = useMemo(() => {
    if (liveSummary) return liveSummary.motoboys;
    return savedRows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: "",
      deliveriesCount: r.deliveriesCount,
      totalTax: r.totalTax,
      totalOrdersValue: 0,
      totalKm: r.totalKm || 0,
      dailyRate: 0,
      kmRate: 0,
    }));
  }, [liveSummary, savedRows]);

  const totalDeliveries = useMemo(
    () => rows.reduce((sum, r) => sum + r.deliveriesCount, 0),
    [rows]
  );
  const totalTaxCents = useMemo(
    () => Math.round(rows.reduce((sum, r) => sum + r.totalTax, 0) * 100),
    [rows]
  );

  const formatTimeBahia = (iso: string) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleTimeString("pt-BR", {
        timeZone: "America/Bahia",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Detalhamento de motoboys"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[20px] border border-zinc-200 bg-white text-zinc-900 shadow-xl sm:rounded-[16px] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
        {/* Cabeçalho limpo */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Motoboys no turno
            </h3>
            <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {unitName} · {formatShortDate(date)}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {unitId && unitId !== "all" && unitId !== "central" && (
              <button
                type="button"
                onClick={loadFromTakeat}
                disabled={loading}
                title="Atualizar dados da Takeat"
                aria-label="Atualizar dados da Takeat"
                className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <RotateCw size={13} className={loading ? "animate-spin" : ""} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        {/* Corpo rolável */}
        <div className="flex-1 overflow-y-auto">
          {loading && rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-xs text-zinc-500">
              <Loader2 size={18} className="animate-spin text-zinc-400" />
              <span>Consultando entregas na Takeat...</span>
            </div>
          ) : error && rows.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs text-rose-600 dark:text-rose-400">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-12 text-center text-xs text-zinc-500">
              Nenhuma entrega com motoboy registrada na Takeat para esta data.
            </div>
          ) : (
            <div>
              {/* Cabeçalho das colunas */}
              <div className="grid grid-cols-12 border-b border-zinc-100 bg-zinc-50/80 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950/60">
                <span className="col-span-6">Motoboy</span>
                <span className="col-span-3 text-right">Entregas</span>
                <span className="col-span-3 text-right">Valor</span>
              </div>

              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {rows.map((m) => {
                  const hasTrips = Array.isArray(m.deliveries) && m.deliveries.length > 0;
                  const isExpanded = expandedId === m.id;
                  return (
                    <div key={`${m.id}-${m.name}`}>
                      <button
                        type="button"
                        disabled={!hasTrips}
                        onClick={() => hasTrips && setExpandedId(isExpanded ? null : m.id)}
                        className={`grid w-full grid-cols-12 items-center px-5 py-3 text-left transition ${
                          hasTrips
                            ? "cursor-pointer hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40"
                            : "cursor-default"
                        }`}
                      >
                        <div className="col-span-6 flex min-w-0 items-center gap-2 pr-2">
                          {hasTrips && (
                            <span className="shrink-0 text-zinc-400">
                              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </span>
                          )}
                          <span className="truncate text-sm font-medium capitalize text-zinc-900 dark:text-zinc-100">
                            {m.name}
                          </span>
                        </div>
                        <span className="col-span-3 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                          {m.deliveriesCount}
                        </span>
                        <span className="col-span-3 text-right text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                          {brl(Math.round(m.totalTax * 100))}
                        </span>
                      </button>

                      {/* Lista expansível de entregas individuais deste motoboy */}
                      {isExpanded && m.deliveries && m.deliveries.length > 0 && (
                        <div className="border-t border-zinc-100 bg-zinc-50/70 px-5 py-2 dark:border-zinc-800 dark:bg-zinc-950/50">
                          <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/80">
                            {m.deliveries.map((trip) => (
                              <div
                                key={trip.id}
                                className="flex items-center justify-between gap-3 py-1.5 text-[11px]"
                              >
                                <div className="min-w-0 flex-1 text-zinc-600 dark:text-zinc-400">
                                  <span className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
                                    {formatTimeBahia(trip.createdAt)}
                                  </span>
                                  {trip.neighborhood && (
                                    <span className="ml-2 truncate">{trip.neighborhood}</span>
                                  )}
                                  {trip.buyerName && (
                                    <span className="ml-1.5 text-zinc-400">
                                      · {trip.buyerName}
                                    </span>
                                  )}
                                </div>
                                <span className="shrink-0 font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
                                  {brl(Math.round(trip.deliveryTaxPrice * 100))}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com total geral */}
        {rows.length > 0 && (
          <footer className="grid shrink-0 grid-cols-12 items-center border-t border-zinc-200 bg-zinc-50 px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))] dark:border-zinc-800 dark:bg-zinc-950">
            <span className="col-span-6 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              Total geral ({rows.length} {rows.length === 1 ? "motoboy" : "motoboys"})
            </span>
            <span className="col-span-3 text-right text-xs font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
              {totalDeliveries}
            </span>
            <span className="col-span-3 text-right text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {brl(totalTaxCents)}
            </span>
          </footer>
        )}
      </div>
    </div>
  );
}
