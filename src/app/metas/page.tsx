"use client";

import React, { useState, useEffect } from "react";
import { Target, TrendingUp, Calendar, ArrowUpRight, Award, AlertCircle } from "lucide-react";
import { store } from "@/services/store";
import { useUnit } from "@/contexts/UnitContext";
import { UnitGoal } from "@/types";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

export default function MetasPage() {
  const { currentUnit, filterByUnit } = useUnit();
  const [goals, setGoals] = useState<UnitGoal[]>([]);

  useEffect(() => {
    const update = () => setGoals(filterByUnit(store.getGoals()));
    update();
    window.addEventListener("house190_data_updated", update);
    return () => window.removeEventListener("house190_data_updated", update);
  }, [filterByUnit]);

  const totalTarget = goals.reduce((acc, cur) => acc + cur.targetAmount, 0);
  const totalRealized = goals.reduce((acc, cur) => acc + cur.currentRealized, 0);
  const totalPercent = totalTarget > 0 ? (totalRealized / totalTarget) * 100 : 0;
  const remainingTotal = Math.max(0, totalTarget - totalRealized);

  const daysRemainingInMonth = 23; // In September (30 - 7 = 23)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/60 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Metas & Desempenho Operacional
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Acompanhamento mensal de metas de faturamento, médias necessárias e projeção matemática
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Dias Restantes no Mês:</span>
          <span className="px-2.5 py-1 text-xs font-mono font-semibold bg-white border border-zinc-200 rounded text-zinc-900 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100">
            {daysRemainingInMonth} dias
          </span>
        </div>
      </div>

      {/* Consolidated Macro Card */}
      <div className="p-6 rounded-xl border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800 space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
          <div>
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Meta Consolidada do Grupo (Setembro / 2026)
            </span>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-3xl font-bold tracking-tight text-zinc-900 tabular-nums dark:text-zinc-50">
                {formatCurrency(totalRealized)}
              </span>
              <span className="text-sm font-medium text-zinc-500">
                de {formatCurrency(totalTarget)} ({formatPercent(totalPercent)})
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs text-zinc-400 block">Faltam para atingir:</span>
            <span className="text-lg font-mono font-semibold text-zinc-800 dark:text-zinc-200">
              {formatCurrency(remainingTotal)}
            </span>
          </div>
        </div>

        {/* Thin Linear Progress Bar */}
        <div className="space-y-1.5">
          <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden dark:bg-zinc-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                totalPercent >= 100
                  ? "bg-emerald-500"
                  : totalPercent < 25
                  ? "bg-amber-500"
                  : "bg-zinc-900 dark:bg-zinc-100"
              }`}
              style={{ width: `${Math.min(totalPercent, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-zinc-400">
            <span>Início do Mês</span>
            <span>Meta: 100% ({formatCurrency(totalTarget)})</span>
          </div>
        </div>
      </div>

      {/* Individual Units Breakdown */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
          Acompanhamento por Unidade
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map((g) => {
            const percent = (g.currentRealized / g.targetAmount) * 100;
            const remaining = Math.max(0, g.targetAmount - g.currentRealized);
            const dailyNeeded = remaining / daysRemainingInMonth;
            const isAhead = (g.projectedClose || 0) >= g.targetAmount;

            const unitLabels = {
              central: { name: "Central de Produção", desc: "Volume interno transferido" },
              eunapolis: { name: "House 190 Eunápolis", desc: "Operação de salão e delivery" },
              teixeira: { name: "House 190 Teixeira de Freitas", desc: "Operação completa" },
              foodpark: { name: "House Foodpark", desc: "Box gastronômico" },
            };

            const info = unitLabels[g.unitId] || { name: g.unitId, desc: "" };

            return (
              <div
                key={g.id}
                className="p-5 rounded-lg border border-zinc-200/80 bg-white space-y-4 dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {info.name}
                    </h3>
                    <p className="text-[11px] text-zinc-400">{info.desc}</p>
                  </div>
                  <Badge variant={isAhead ? "success" : "warning"}>
                    {isAhead ? "No Ritmo da Meta" : "Abaixo do Ritmo"}
                  </Badge>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-50">
                      {formatCurrency(g.currentRealized)}
                    </span>
                    <span className="text-xs font-mono font-semibold text-zinc-600 dark:text-zinc-300">
                      {formatPercent(percent)}
                    </span>
                  </div>

                  {/* Thin elegant bar */}
                  <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden dark:bg-zinc-800">
                    <div
                      className={`h-full rounded-full ${
                        percent >= 100
                          ? "bg-emerald-500"
                          : !isAhead
                          ? "bg-amber-500"
                          : "bg-zinc-900 dark:bg-zinc-100"
                      }`}
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-400">
                    <span>Meta: {formatCurrency(g.targetAmount)}</span>
                    <span>Faltam: {formatCurrency(remaining)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-xs">
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Média Atual / dia</span>
                    <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200">
                      {formatCurrency(g.currentDailyAverage || 0)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-400 block">Média Necessária</span>
                    <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200">
                      {formatCurrency(dailyNeeded)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-400 block">Projeção Fechamento</span>
                    <span
                      className={`font-mono font-bold ${
                        isAhead
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {formatCurrency(g.projectedClose || 0)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
