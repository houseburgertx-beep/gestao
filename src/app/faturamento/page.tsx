"use client";

import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  Plus,
  Calendar,
  DollarSign,
  ArrowUpRight,
  Filter,
} from "lucide-react";
import { store } from "@/services/store";
import { useUnit } from "@/contexts/UnitContext";
import { DailyRevenue } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { QuickCreateModal } from "@/components/layout/QuickCreateModal";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function FaturamentoPage() {
  const { currentUnit, filterByUnit } = useUnit();
  const [revenues, setRevenues] = useState<DailyRevenue[]>([]);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    setRevenues(filterByUnit(store.getRevenues()));
    const handleUpdate = () => {
      setRevenues(filterByUnit(store.getRevenues()));
      setTick((t) => t + 1);
    };
    window.addEventListener("house190_data_updated", handleUpdate);
    return () => window.removeEventListener("house190_data_updated", handleUpdate);
  }, [filterByUnit]);

  // Aggregate Metrics
  const totalNet = revenues.reduce((acc, cur) => acc + cur.netRevenue, 0);
  const totalGross = revenues.reduce((acc, cur) => acc + cur.grossRevenue, 0);
  const totalDiscounts = revenues.reduce((acc, cur) => acc + cur.discounts, 0);

  const todayRev = revenues.find((r) => r.date === "2026-09-07");
  const yesterdayRev = revenues.find((r) => r.date === "2026-09-06");

  // Daily Chart Data
  const chartData = [
    { name: "01/09", Eunápolis: 14200, Teixeira: 12100, Foodpark: 4500 },
    { name: "02/09", Eunápolis: 15100, Teixeira: 13400, Foodpark: 5100 },
    { name: "03/09", Eunápolis: 14800, Teixeira: 12900, Foodpark: 4900 },
    { name: "04/09", Eunápolis: 18200, Teixeira: 15300, Foodpark: 6200 },
    { name: "05/09", Eunápolis: 22100, Teixeira: 18400, Foodpark: 7900 },
    { name: "06/09", Eunápolis: 19800, Teixeira: 16400, Foodpark: 7200 },
    { name: "07/09", Eunápolis: 18450, Teixeira: 15200, Foodpark: 6100 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/60 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Faturamento Diário & Receitas
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Lançamentos de vendas diárias, controle de descontos e acompanhamento de receita líquida
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setIsQuickCreateOpen(true)}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Lançar Venda Diária</span>
        </Button>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-lg border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Faturamento de Hoje
          </div>
          <div className="mt-1 text-xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
            {formatCurrency(todayRev ? todayRev.netRevenue : 39820)}
          </div>
          <div className="mt-0.5 text-[11px] text-emerald-600 font-medium">
            +8,5% vs dia anterior
          </div>
        </div>

        <div className="p-4 rounded-lg border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Faturamento de Ontem
          </div>
          <div className="mt-1 text-xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
            {formatCurrency(yesterdayRev ? yesterdayRev.netRevenue : 42330)}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            Domingo de alta conversão
          </div>
        </div>

        <div className="p-4 rounded-lg border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Média Diária (Setembro)
          </div>
          <div className="mt-1 text-xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
            {formatCurrency(41250)}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            Projeção: {formatCurrency(1237500)}
          </div>
        </div>

        <div className="p-4 rounded-lg border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Total Líquido Acumulado
          </div>
          <div className="mt-1 text-xl font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
            {formatCurrency(totalNet > 0 ? totalNet : 288750)}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            Descontos: {formatCurrency(totalDiscounts > 0 ? totalDiscounts : 4120)}
          </div>
        </div>
      </div>

      {/* Comparison Chart */}
      <div className="rounded-lg border border-zinc-200/80 bg-white p-5 dark:bg-zinc-900 dark:border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Comparativo de Faturamento Diário entre Unidades
            </h3>
            <p className="text-[11px] text-zinc-500">Últimos 7 dias em operação</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-900 dark:bg-zinc-100" />
              <span>Eunápolis</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-500" />
              <span>Teixeira</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
              <span>Foodpark</span>
            </span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
              <XAxis dataKey="name" stroke="#a1a1aa" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis
                stroke="#a1a1aa"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `R$ ${v / 1000}k`}
              />
              <Tooltip
                formatter={(v: any) => formatCurrency(Number(v))}
                contentStyle={{
                  backgroundColor: "#18181b",
                  borderColor: "#27272a",
                  borderRadius: "6px",
                  color: "#f4f4f5",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="Eunápolis" fill="#18181b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Teixeira" fill="#71717a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Foodpark" fill="#d4d4d8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Daily Entries Table */}
      <div className="rounded-lg border border-zinc-200/80 bg-white overflow-hidden shadow-2xs dark:bg-zinc-900 dark:border-zinc-800">
        <div className="px-4 py-3 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between dark:bg-zinc-800/40 dark:border-zinc-800">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            Histórico de Lançamentos Diários
          </h3>
          <span className="text-[11px] text-zinc-500">Pronto para integração via API de PDV</span>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-400 font-semibold uppercase tracking-wider text-[10px] dark:bg-zinc-800/60 dark:border-zinc-800">
            <tr>
              <th className="py-3 px-4">Data</th>
              <th className="py-3 px-4">Unidade</th>
              <th className="py-3 px-4 text-right">Faturamento Bruto</th>
              <th className="py-3 px-4 text-right">Descontos / Estornos</th>
              <th className="py-3 px-4 text-right">Faturamento Líquido</th>
              <th className="py-3 px-4">Observações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {revenues.map((rev) => (
              <tr key={rev.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50">
                <td className="py-3 px-4 tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatDate(rev.date)}
                </td>
                <td className="py-3 px-4 uppercase text-[10px] font-mono text-zinc-500">
                  {rev.unitId}
                </td>
                <td className="py-3 px-4 text-right font-mono text-zinc-700 dark:text-zinc-300">
                  {formatCurrency(rev.grossRevenue)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-zinc-500">
                  {formatCurrency(rev.discounts + rev.cancellations)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">
                  {formatCurrency(rev.netRevenue)}
                </td>
                <td className="py-3 px-4 text-zinc-500">
                  {rev.notes || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <QuickCreateModal
        isOpen={isQuickCreateOpen}
        onClose={() => setIsQuickCreateOpen(false)}
        defaultTab="revenue"
      />
    </div>
  );
}
