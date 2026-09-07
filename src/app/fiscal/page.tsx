"use client";

import React, { useState, useEffect } from "react";
import {
  Receipt,
  Calendar as CalendarIcon,
  Plus,
  Search,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Building,
} from "lucide-react";
import { store } from "@/services/store";
import { useUnit } from "@/contexts/UnitContext";
import { TaxRecord } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { QuickCreateModal } from "@/components/layout/QuickCreateModal";

export default function FiscalPage() {
  const { filterByUnit } = useUnit();
  const [taxes, setTaxes] = useState<TaxRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"lista" | "calendario" | "parcelamentos">("lista");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTax, setSelectedTax] = useState<TaxRecord | null>(null);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    setTaxes(filterByUnit(store.getTaxes()));
    const handleUpdate = () => {
      setTaxes(filterByUnit(store.getTaxes()));
      setTick((t) => t + 1);
    };
    window.addEventListener("house190_data_updated", handleUpdate);
    return () => window.removeEventListener("house190_data_updated", handleUpdate);
  }, [filterByUnit]);

  const upcomingTaxes = taxes.filter((t) => t.status === "upcoming" || t.status === "pending_payment");
  const upcomingTotal = upcomingTaxes.reduce((acc, cur) => acc + cur.amount, 0);

  const paidTaxes = taxes.filter((t) => t.status === "paid");
  const paidTotal = paidTaxes.reduce((acc, cur) => acc + cur.amount, 0);

  const overdueTaxes = taxes.filter((t) => t.status === "overdue");
  const overdueTotal = overdueTaxes.reduce((acc, cur) => acc + cur.amount, 0);

  const filteredTaxes = taxes.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.taxType.toLowerCase().includes(q) ||
      t.competence.includes(q) ||
      t.companyCnpj.includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/60 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Fiscal & Impostos
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Controle de tributos, guias municipais, estaduais, federais e calendário fiscal
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setIsQuickCreateOpen(true)}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Lançar Guia Fiscal</span>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Tributos a Vencer (Setembro)
          </div>
          <div className="mt-1 text-xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
            {formatCurrency(upcomingTotal)}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {upcomingTaxes.length} guias aguardando pagamento
          </div>
        </div>

        <div className="p-4 rounded-lg border border-emerald-200/60 bg-emerald-50/20 dark:bg-emerald-950/20 dark:border-emerald-900/40">
          <div className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">
            Tributos Pagos no Mês
          </div>
          <div className="mt-1 text-xl font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
            {formatCurrency(paidTotal)}
          </div>
          <div className="mt-0.5 text-[11px] text-emerald-600/80">
            {paidTaxes.length} guias quitadas
          </div>
        </div>

        <div className="p-4 rounded-lg border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Em Atraso / Parcelados
          </div>
          <div className="mt-1 text-xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
            {formatCurrency(overdueTotal)}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {overdueTaxes.length} guias pendentes de renegociação
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 gap-6">
        <button
          onClick={() => setActiveTab("lista")}
          className={`pb-3 text-xs font-medium border-b-2 transition-colors ${
            activeTab === "lista"
              ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
              : "border-transparent text-zinc-400 hover:text-zinc-700"
          }`}
        >
          Lista de Guias Fiscais
        </button>
        <button
          onClick={() => setActiveTab("calendario")}
          className={`pb-3 text-xs font-medium border-b-2 transition-colors ${
            activeTab === "calendario"
              ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
              : "border-transparent text-zinc-400 hover:text-zinc-700"
          }`}
        >
          Calendário Fiscal Mensal
        </button>
      </div>

      {/* TAB: Lista */}
      {activeTab === "lista" && (
        <div className="space-y-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Filtrar por tributo (DAS, ICMS...) ou competência..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8.5 pl-8.5 pr-3 text-xs rounded-md border border-zinc-200 bg-white placeholder-zinc-400 focus:outline-none dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div className="rounded-lg border border-zinc-200/80 bg-white overflow-hidden shadow-2xs dark:bg-zinc-900 dark:border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-400 font-semibold uppercase tracking-wider text-[10px] dark:bg-zinc-800/60 dark:border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Tributo</th>
                  <th className="py-3 px-4">Unidade / Empresa</th>
                  <th className="py-3 px-4">Competência</th>
                  <th className="py-3 px-4">Vencimento</th>
                  <th className="py-3 px-4 text-right">Valor da Guia</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredTaxes.map((tax) => (
                  <tr
                    key={tax.id}
                    onClick={() => setSelectedTax(tax)}
                    className="hover:bg-zinc-50/50 cursor-pointer dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <td className="py-3 px-4 font-bold text-zinc-900 dark:text-zinc-100">
                      {tax.taxType}
                    </td>
                    <td className="py-3 px-4">
                      <span className="uppercase text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {tax.unitId}
                      </span>
                      <span className="text-zinc-400 ml-2 text-[11px] font-mono">
                        {tax.companyCnpj}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                      {tax.competence}
                    </td>
                    <td className="py-3 px-4 tabular-nums font-medium">
                      {formatDate(tax.dueDate)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                      {formatCurrency(tax.amount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <StatusBadge status={tax.status} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTax(tax);
                        }}
                        className="h-7 text-xs"
                      >
                        Ver Guia
                      </Button>
                    </td>
                  </tr>
                ))}

                {filteredTaxes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-zinc-400">
                      Nenhuma guia fiscal encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Calendário Fiscal */}
      {activeTab === "calendario" && (
        <div className="p-5 rounded-lg border border-zinc-200/80 bg-white space-y-4 dark:bg-zinc-900 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Vencimentos Fiscais de Setembro / 2026
            </h3>
            <span className="text-xs text-zinc-500">Padrão Federal, Estadual e Municipal</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              { day: "Dia 07", name: "FGTS Digital", desc: "Folha mensal (Central & Lojas)", date: "07/09/2026", status: "pending_payment" },
              { day: "Dia 10", name: "ISS Municipal", desc: "Tributação sobre serviços", date: "10/09/2026", status: "upcoming" },
              { day: "Dia 20", name: "DAS Simples Nacional", desc: "Guia única das filiais", date: "20/09/2026", status: "upcoming" },
              { day: "Dia 25", name: "ICMS Antecipado", desc: "SEFAZ Bahia", date: "25/09/2026", status: "upcoming" },
            ].map((ev) => (
              <div
                key={ev.day}
                className="p-4 rounded-md border border-zinc-200/60 bg-zinc-50/50 space-y-2 dark:bg-zinc-800/30 dark:border-zinc-800"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{ev.day}</span>
                  <StatusBadge status={ev.status} />
                </div>
                <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{ev.name}</div>
                <div className="text-[11px] text-zinc-400 leading-tight">{ev.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tax Details Drawer */}
      <Drawer
        isOpen={!!selectedTax}
        onClose={() => setSelectedTax(null)}
        title={selectedTax ? `Guia ${selectedTax.taxType} - ${selectedTax.competence}` : ""}
        subtitle={`Unidade: ${selectedTax?.unitId.toUpperCase()} • Vencimento: ${formatDate(selectedTax?.dueDate || "")}`}
        width="md"
      >
        {selectedTax && (
          <div className="space-y-5 text-xs">
            <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 space-y-3">
              <div className="flex justify-between items-baseline">
                <span className="text-zinc-400">Valor da Guia:</span>
                <span className="text-lg font-mono font-bold text-zinc-900 dark:text-zinc-100">
                  {formatCurrency(selectedTax.amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">CNPJ Pagador:</span>
                <span className="font-mono text-zinc-700 dark:text-zinc-300">
                  {selectedTax.companyCnpj}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Status:</span>
                <StatusBadge status={selectedTax.status} />
              </div>
            </div>

            {selectedTax.barcode && (
              <div>
                <span className="text-[10px] text-zinc-400 uppercase font-semibold block mb-1">
                  Linha Digitável / Código de Barras
                </span>
                <div className="p-2.5 bg-zinc-100 rounded font-mono text-[11px] text-zinc-800 select-all break-all dark:bg-zinc-800 dark:text-zinc-200">
                  {selectedTax.barcode}
                </div>
              </div>
            )}

            {selectedTax.notes && (
              <div>
                <span className="text-[10px] text-zinc-400 uppercase font-semibold block mb-1">
                  Instruções da Contabilidade
                </span>
                <div className="p-3 bg-zinc-50 rounded border border-zinc-100 text-zinc-600 dark:bg-zinc-800/40 dark:border-zinc-800 dark:text-zinc-300">
                  {selectedTax.notes}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <QuickCreateModal
        isOpen={isQuickCreateOpen}
        onClose={() => setIsQuickCreateOpen(false)}
        defaultTab="tax"
      />
    </div>
  );
}
