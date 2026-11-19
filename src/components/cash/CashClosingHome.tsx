"use client";

import React, { useMemo, useState } from "react";
import {
  Eye,
  Paperclip,
  Plus,
  RotateCcw,
  Share2,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { currency, RecordData, str } from "@/domain/management/model";
import {
  brl,
  formatShortDate,
  generateCleanWhatsAppClosingText,
  parseAttachments,
} from "./cashHelpers";

export interface CashClosingHomeProps {
  closings: RecordData[];
  units: RecordData[];
  availableUnits: Array<{ id: string; name: string }>;
  selectedUnit: string;
  onSelectUnit: (unitId: string) => void;
  showUnitFilter: boolean;
  todayCount: number;
  todayDifference: number;
  pendingCount: number;
  reviewedCount: number;
  message: string;
  onDismissMessage: () => void;
  isConferred: (row: RecordData) => boolean;
  getEffectiveStatus: (row: RecordData) => string;
  onNewClosing: () => void;
  onEditClosing: (row: RecordData) => void;
  onViewClosing: (row: RecordData) => void;
  onDeleteClosing: (row: RecordData) => Promise<void>;
}

type StatusFilter = "all" | "pending" | "reviewed" | "returned";

export function CashClosingHome({
  closings,
  units,
  availableUnits,
  selectedUnit,
  onSelectUnit,
  showUnitFilter,
  todayCount,
  todayDifference,
  pendingCount,
  reviewedCount,
  message,
  onDismissMessage,
  isConferred,
  getEffectiveStatus,
  onNewClosing,
  onEditClosing,
  onViewClosing,
  onDeleteClosing,
}: CashClosingHomeProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const counts = useMemo(() => {
    let pend = 0;
    let rev = 0;
    let ret = 0;
    closings.forEach((r) => {
      const st = getEffectiveStatus(r);
      if (st === "Devolvido ao operador") ret++;
      else if (isConferred(r)) rev++;
      else pend++;
    });
    return { all: closings.length, pending: pend, reviewed: rev, returned: ret };
  }, [closings, getEffectiveStatus, isConferred]);

  const filtered = useMemo(() => {
    return closings.filter((row) => {
      const st = getEffectiveStatus(row);
      if (statusFilter === "returned") return st === "Devolvido ao operador";
      if (statusFilter === "reviewed") return isConferred(row);
      if (statusFilter === "pending") return !isConferred(row) && st !== "Devolvido ao operador";
      return true;
    });
  }, [closings, statusFilter, getEffectiveStatus, isConferred]);

  const grouped = useMemo(() => {
    if (selectedUnit !== "all") {
      const uObj = availableUnits.find((u) => u.id === selectedUnit);
      return [
        {
          unitId: selectedUnit,
          unitName: uObj?.name || selectedUnit,
          items: filtered,
        },
      ];
    }
    const map = new Map<string, RecordData[]>();
    filtered.forEach((row) => {
      const uid = row.unitId || "outros";
      if (!map.has(uid)) map.set(uid, []);
      map.get(uid)!.push(row);
    });
    return Array.from(map.entries()).map(([uid, items]) => {
      const uObj = availableUnits.find((u) => u.id === uid);
      return {
        unitId: uid,
        unitName: uObj ? uObj.name : uid,
        items,
      };
    });
  }, [filtered, selectedUnit, availableUnits]);

  const handleDeleteClick = async (row: RecordData) => {
    setDeletingId(row.id);
    try {
      await onDeleteClosing(row);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 pb-24 sm:px-6 lg:pb-10">
      {/* Cabeçalho minimalista */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Operação diária
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Fechamento de caixa
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Registre o fechamento do turno passo a passo e acompanhe a conferência.
          </p>
        </div>

        <button
          type="button"
          onClick={onNewClosing}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 active:scale-[0.99] sm:h-10 sm:w-auto dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <Plus size={16} />
          <span>Novo fechamento</span>
        </button>
      </header>

      {/* Mensagem de feedback discreta */}
      {message && (
        <div className="flex items-center justify-between gap-3 rounded-[16px] border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          <span>{message}</span>
          <button
            type="button"
            onClick={onDismissMessage}
            className="rounded p-0.5 opacity-70 transition hover:opacity-100"
            aria-label="Dispensar aviso"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Faixa de indicadores neutra (1 card limpo em vez de 4 caixas coloridas) */}
      <section className="grid grid-cols-2 divide-y divide-zinc-100 overflow-hidden rounded-[16px] border border-zinc-200/90 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:grid-cols-4 sm:divide-x sm:divide-y-0 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="p-4">
          <span className="text-[11px] font-medium text-zinc-500">Registros de hoje</span>
          <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {todayCount}
          </p>
        </div>
        <div className="border-l border-zinc-100 p-4 sm:border-l-0 dark:border-zinc-800">
          <span className="text-[11px] font-medium text-zinc-500">Diferença do dia</span>
          <p
            className={`mt-1 text-xl font-semibold tabular-nums ${
              todayDifference === 0
                ? "text-emerald-700 dark:text-emerald-400"
                : todayDifference > 0
                ? "text-amber-700 dark:text-amber-400"
                : "text-rose-700 dark:text-rose-400"
            }`}
          >
            {brl(todayDifference)}
          </p>
        </div>
        <div className="p-4">
          <span className="text-[11px] font-medium text-zinc-500">Aguardando financeiro</span>
          <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {pendingCount}
          </p>
        </div>
        <div className="border-l border-zinc-100 p-4 sm:border-l-0 dark:border-zinc-800">
          <span className="text-[11px] font-medium text-zinc-500">Conferidos</span>
          <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {reviewedCount}
          </p>
        </div>
      </section>

      {/* Filtros limpos (Unidade e Status) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Filtro de status */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {[
            { id: "all" as const, label: "Todos", count: counts.all },
            { id: "pending" as const, label: "Aguardando", count: counts.pending },
            { id: "reviewed" as const, label: "Conferidos", count: counts.reviewed },
            ...(counts.returned > 0
              ? [{ id: "returned" as const, label: "Devolvidos", count: counts.returned }]
              : []),
          ].map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`tabular-nums ${
                    active ? "opacity-75" : "text-zinc-400 dark:text-zinc-500"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Seletor de unidade para perfis multi-loja */}
        {showUnitFilter && availableUnits.length > 1 && (
          <select
            value={selectedUnit}
            onChange={(e) => onSelectUnit(e.target.value)}
            aria-label="Filtrar unidade"
            className="h-9 rounded-[10px] border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <option value="all">Todas as unidades</option>
            {availableUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Lista de histórico */}
      <section className="overflow-hidden rounded-[16px] border border-zinc-200/90 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3.5 sm:px-5 dark:border-zinc-800">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Histórico de fechamentos
          </h2>
          <span className="text-xs font-medium tabular-nums text-zinc-400">
            {filtered.length} {filtered.length === 1 ? "registro" : "registros"}
          </span>
        </div>

        {filtered.length > 0 ? (
          <div>
            {grouped.map((group) => (
              <div key={group.unitId}>
                {selectedUnit === "all" && grouped.length > 1 && (
                  <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/80 px-4 py-2 text-xs sm:px-5 dark:border-zinc-800 dark:bg-zinc-950/60">
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                      {group.unitName}
                    </span>
                    <span className="tabular-nums text-zinc-400">
                      {group.items.length} {group.items.length === 1 ? "caixa" : "caixas"}
                    </span>
                  </div>
                )}

                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {group.items.map((row) => {
                    const uObj = units.find((u) => u.id === row.unitId);
                    const unitName = (uObj ? str(uObj, "name") : "") || String(row.unitId || "Unidade");
                    const rowConferred = isConferred(row);
                    const effectiveStatus = getEffectiveStatus(row);
                    const isReturned = effectiveStatus === "Devolvido ao operador";
                    const diffVal = Number(row.difference || 0);
                    const attCount = parseAttachments(row).length;
                    const sangriaVal = Number(row.sangriaAmount || 0);

                    return (
                      <article
                        key={row.id}
                        className="flex flex-col gap-3.5 px-4 py-4 transition hover:bg-zinc-50/60 sm:px-5 md:flex-row md:items-center md:justify-between dark:hover:bg-zinc-800/30"
                      >
                        {/* Info principal */}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {formatShortDate(str(row, "date"))}
                            </strong>
                            <span className="text-xs text-zinc-400">·</span>
                            <span className="truncate text-xs font-medium text-zinc-600 dark:text-zinc-300">
                              {unitName}
                            </span>

                            {/* Selo de status discreto */}
                            <span
                              className={`inline-flex items-center rounded-[7px] border px-2 py-0.5 text-[11px] font-medium ${
                                rowConferred
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-400"
                                  : isReturned
                                  ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300"
                                  : "border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                              }`}
                            >
                              {rowConferred ? "Conferido" : isReturned ? "Devolvido" : "Aguardando"}
                            </span>
                          </div>

                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Turno {str(row, "shift") || "Único"} · {str(row, "operatorName") || "Sem operador"}
                            {sangriaVal > 0 && (
                              <>
                                {" "}
                                · Sangria <span className="tabular-nums">{brl(sangriaVal)}</span>
                              </>
                            )}
                            {attCount > 0 && (
                              <span className="ml-2 inline-flex items-center gap-1 text-zinc-400">
                                <Paperclip size={11} /> {attCount}
                              </span>
                            )}
                          </p>

                          {str(row, "returnReason") && (
                            <p className="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                              <Undo2 size={12} className="shrink-0" />
                              <span>Motivo da devolução: {str(row, "returnReason")}</span>
                            </p>
                          )}
                        </div>

                        {/* Valores */}
                        <div className="flex items-center justify-between gap-6 border-t border-zinc-100 pt-3 md:border-t-0 md:pt-0 dark:border-zinc-800">
                          <div className="flex items-center gap-5">
                            <div>
                              <span className="block text-[11px] text-zinc-400">PDV</span>
                              <strong className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                                {currency(Number(row.systemTotal || 0))}
                              </strong>
                            </div>
                            <div>
                              <span className="block text-[11px] text-zinc-400">Diferença</span>
                              <strong
                                className={`text-sm font-semibold tabular-nums ${
                                  diffVal === 0
                                    ? "text-emerald-700 dark:text-emerald-400"
                                    : diffVal > 0
                                    ? "text-amber-700 dark:text-amber-400"
                                    : "text-rose-700 dark:text-rose-400"
                                }`}
                              >
                                {diffVal === 0 ? "R$ 0,00" : currency(diffVal)}
                              </strong>
                            </div>
                          </div>

                          {/* Ações limpas */}
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => onViewClosing(row)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                              <Eye size={13} />
                              <span>Detalhes</span>
                            </button>

                            <button
                              type="button"
                              title="Enviar resumo no WhatsApp"
                              onClick={() => {
                                const text = generateCleanWhatsAppClosingText(row, unitName);
                                window.open(
                                  `https://wa.me/?text=${encodeURIComponent(text)}`,
                                  "_blank"
                                );
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                              aria-label="Compartilhar no WhatsApp"
                            >
                              <Share2 size={13} />
                            </button>

                            {!rowConferred && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onEditClosing(row)}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                >
                                  <RotateCcw size={12} />
                                  <span>{isReturned ? "Corrigir" : "Reabrir"}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingId === row.id}
                                  onClick={() => handleDeleteClick(row)}
                                  title="Excluir fechamento"
                                  aria-label="Excluir fechamento"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-zinc-200 bg-white text-zinc-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-rose-900 dark:hover:bg-rose-950/40"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Nenhum fechamento encontrado
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Inicie um novo fechamento para registrar o turno atual.
            </p>
            <button
              type="button"
              onClick={onNewClosing}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-zinc-900 px-3.5 text-xs font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
            >
              <Plus size={14} />
              <span>Novo fechamento</span>
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
