"use client";

import React, { useState } from "react";
import {
  FileBarChart,
  Download,
  Calendar,
  Filter,
  ArrowUpRight,
  TrendingUp,
  DollarSign,
  Users,
} from "lucide-react";
import { useUnit } from "@/contexts/UnitContext";
import { store } from "@/services/store";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

export default function RelatoriosPage() {
  const { currentUnit } = useUnit();
  const [reportType, setReportType] = useState<"financeiro" | "faturamento" | "fiscal" | "rh">("financeiro");

  const accounts = store.getAccounts();
  const goals = store.getGoals();
  const employees = store.getEmployees();

  const handleExportCSV = () => {
    let rows = "";
    if (reportType === "financeiro") {
      rows = "ID;Descrição;Fornecedor;Unidade;Vencimento;Valor;Status\n" +
        accounts.map((a) => `${a.id};${a.description};${a.supplierName};${a.unitId};${a.dueDate};${a.finalAmount};${a.status}`).join("\n");
    } else {
      rows = "ID;Unidade;Meta;Realizado\n" +
        goals.map((g) => `${g.id};${g.unitId};${g.targetAmount};${g.currentRealized}`).join("\n");
    }

    const blob = new Blob([rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `relatorio_house190_${reportType}_setembro_2026.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/60 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Relatórios Gerenciais & Exportações
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            DRE gerencial, relatórios consolidados de despesas e exportações em CSV para contabilidade
          </p>
        </div>
        <Button size="sm" onClick={handleExportCSV} className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          <span>Exportar Relatório (CSV)</span>
        </Button>
      </div>

      {/* Report Types Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 gap-6">
        {[
          { key: "financeiro", label: "DRE & Contas a Pagar" },
          { key: "faturamento", label: "Faturamento & Metas" },
          { key: "fiscal", label: "Apuração Fiscal" },
          { key: "rh", label: "RH & Encargos" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setReportType(t.key as any)}
            className={`pb-3 text-xs font-medium border-b-2 transition-colors ${
              reportType === t.key
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* DRE Summary Table */}
      {reportType === "financeiro" && (
        <div className="rounded-lg border border-zinc-200/80 bg-white p-5 space-y-4 dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Demonstrativo Gerencial Consolidado (Setembro / 2026)
              </h3>
              <p className="text-[11px] text-zinc-500">Apuração preliminar em regime de competência</p>
            </div>
            <span className="text-xs font-mono font-medium px-2 py-0.5 bg-zinc-100 rounded text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              Setembro / 2026
            </span>
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
            <div className="py-2.5 flex justify-between items-center font-bold text-zinc-900 dark:text-zinc-100">
              <span>(+) Receita Bruta de Vendas</span>
              <span className="font-mono">{formatCurrency(319700)}</span>
            </div>
            <div className="py-2 flex justify-between items-center text-zinc-500 pl-4">
              <span>(-) Descontos e Cancelamentos</span>
              <span className="font-mono">({formatCurrency(4890)})</span>
            </div>
            <div className="py-2.5 flex justify-between items-center font-semibold text-zinc-800 dark:text-zinc-200">
              <span>(=) Receita Operacional Líquida</span>
              <span className="font-mono">{formatCurrency(314810)}</span>
            </div>
            <div className="py-2 flex justify-between items-center text-zinc-500 pl-4">
              <span>(-) CMV (Matéria-prima: Carnes, Pães, Laticínios)</span>
              <span className="font-mono">({formatCurrency(108500)})</span>
            </div>
            <div className="py-2 flex justify-between items-center text-zinc-500 pl-4">
              <span>(-) Embalagens & Descartáveis</span>
              <span className="font-mono">({formatCurrency(17000)})</span>
            </div>
            <div className="py-2.5 flex justify-between items-center font-semibold text-zinc-800 dark:text-zinc-200">
              <span>(=) Lucro Bruto Operacional (60,1%)</span>
              <span className="font-mono">{formatCurrency(189310)}</span>
            </div>
            <div className="py-2 flex justify-between items-center text-zinc-500 pl-4">
              <span>(-) Despesas com Pessoal & Folha</span>
              <span className="font-mono">({formatCurrency(42500)})</span>
            </div>
            <div className="py-2 flex justify-between items-center text-zinc-500 pl-4">
              <span>(-) Ocupação & Utilidades (Energia, Água, Condomínio)</span>
              <span className="font-mono">({formatCurrency(14300)})</span>
            </div>
            <div className="py-2 flex justify-between items-center text-zinc-500 pl-4">
              <span>(-) Marketing & Performance</span>
              <span className="font-mono">({formatCurrency(8400)})</span>
            </div>
            <div className="py-3 flex justify-between items-center font-bold text-sm text-emerald-700 dark:text-emerald-400 pt-3 border-t-2 border-zinc-200 dark:border-zinc-700">
              <span>(=) Resultado Operacional Preliminar (EBITDA)</span>
              <span className="font-mono text-base">{formatCurrency(124110)}</span>
            </div>
          </div>
        </div>
      )}

      {reportType !== "financeiro" && (
        <div className="p-8 rounded-lg border border-zinc-200/80 bg-white text-center text-xs text-zinc-500 dark:bg-zinc-900 dark:border-zinc-800">
          Relatório gerado automaticamente a partir dos lançamentos da base. Clique no botão superior &quot;Exportar Relatório (CSV)&quot; para baixar a planilha integral.
        </div>
      )}
    </div>
  );
}
