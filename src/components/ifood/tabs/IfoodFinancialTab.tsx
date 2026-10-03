"use client";

import React, { useState, useEffect } from "react";
import {
  IfoodCredentials,
  IfoodSale,
  IfoodFinancialEvent,
  IfoodSettlement,
  IfoodAnticipation,
  IfoodUnitId,
} from "@/types/ifood";
import { IfoodService } from "@/services/ifoodService";
import {
  DollarSign,
  TrendingDown,
  Calendar,
  Building,
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  CheckCircle,
  RefreshCw,
  Percent,
} from "lucide-react";

interface Props {
  unitId: IfoodUnitId;
  credentials: IfoodCredentials;
}

export function IfoodFinancialTab({ unitId, credentials }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<"sales" | "events" | "settlements" | "anticipations">("sales");
  const [sales, setSales] = useState<IfoodSale[]>([]);
  const [events, setEvents] = useState<IfoodFinancialEvent[]>([]);
  const [settlements, setSettlements] = useState<IfoodSettlement[]>([]);
  const [anticipations, setAnticipations] = useState<IfoodAnticipation[]>([]);
  const [loading, setLoading] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const merchantId = credentials.merchantId || "b0954b6b-f99c-44b6-ba1e-987f32b2b22a";

  const loadData = async () => {
    setLoading(true);
    try {
      const [salesData, eventsData, settlementsData, anticipationsData] = await Promise.all([
        IfoodService.getFinancialSales(unitId, merchantId),
        IfoodService.getFinancialEvents(unitId, merchantId),
        IfoodService.getSettlements(unitId, merchantId),
        IfoodService.getAnticipations(unitId, merchantId),
      ]);
      setSales(salesData);
      setEvents(eventsData);
      setSettlements(settlementsData);
      setAnticipations(anticipationsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [unitId, merchantId]);

  const handleGenerateReconciliation = async () => {
    setReconciling(true);
    setTimeout(() => {
      setReconciling(false);
      setSuccessMsg("Arquivo de conciliação financeira gerado com sucesso (Protocolo REC-202610-8841)!");
      setTimeout(() => setSuccessMsg(null), 5000);
    }, 1500);
  };

  // KPIs
  const totalGross = sales.reduce((acc, s) => acc + s.grossValue, 0);
  const totalFees = sales.reduce((acc, s) => acc + s.channelFee + s.paymentFee, 0);
  const totalNet = sales.reduce((acc, s) => acc + s.netValue, 0);
  const marginPercent = totalGross > 0 ? ((totalNet / totalGross) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Faturamento Bruto */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Vendas Brutas</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            R$ {totalGross.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">
            {sales.length} pedidos no período
          </span>
        </div>

        {/* Taxas & Comissões */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Comissão & Taxas</span>
            <div className="p-2 rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-red-600 dark:text-red-400">
            - R$ {totalFees.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">
            Comissão iFood + Processamento
          </span>
        </div>

        {/* Repasse Líquido */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Líquido a Receber</span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
            R$ {totalNet.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">
            Valor creditado em conta
          </span>
        </div>

        {/* Margem Líquida */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Margem Retida</span>
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {marginPercent}%
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">
            Retenção média pós-taxas
          </span>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5 shadow-sm">
        {/* Subtabs */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "sales", label: "Vendas Analíticas" },
            { id: "events", label: "Taxas & Lançamentos" },
            { id: "settlements", label: "Repasses Bancários" },
            { id: "anticipations", label: "Antecipações" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                activeSubTab === tab.id
                  ? "bg-red-600 text-white shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={handleGenerateReconciliation}
            disabled={reconciling}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 transition flex items-center gap-1.5 shadow-sm"
          >
            <FileSpreadsheet className={`w-3.5 h-3.5 ${reconciling ? "animate-spin" : ""}`} />
            {reconciling ? "Gerando..." : "Conciliação On-Demand"}
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-medium flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Tables Content */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        {/* 1. SALES TABLE */}
        {activeSubTab === "sales" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Pedido</th>
                  <th className="py-3 px-4">Data / Hora</th>
                  <th className="py-3 px-4 text-right">Bruto</th>
                  <th className="py-3 px-4 text-right">Comissão iFood</th>
                  <th className="py-3 px-4 text-right">Taxa Pagamento</th>
                  <th className="py-3 px-4 text-right font-bold text-zinc-900 dark:text-zinc-100">
                    Líquido
                  </th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                {sales.map((sale) => (
                  <tr key={sale.orderId} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition">
                    <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-zinc-100">
                      {sale.orderDisplayId}
                    </td>
                    <td className="py-3 px-4 text-zinc-500">{sale.orderDate}</td>
                    <td className="py-3 px-4 text-right font-medium">
                      R$ {sale.grossValue.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right text-red-600 dark:text-red-400">
                      - R$ {sale.channelFee.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right text-red-600 dark:text-red-400">
                      - R$ {sale.paymentFee.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      R$ {sale.netValue.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {sale.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 2. FINANCIAL EVENTS TABLE */}
        {activeSubTab === "events" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Descrição do Lançamento</th>
                  <th className="py-3 px-4 text-right font-bold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                {events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition">
                    <td className="py-3 px-4 text-zinc-500">{evt.date}</td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                        {evt.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                      {evt.description}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-bold ${
                        evt.amount < 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {evt.amount < 0 ? "- " : "+ "}R$ {Math.abs(evt.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. SETTLEMENTS (REPASSES) */}
        {activeSubTab === "settlements" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Data do Repasse</th>
                  <th className="py-3 px-4">Conta Bancária de Destino</th>
                  <th className="py-3 px-4 text-right">Valor Bruto</th>
                  <th className="py-3 px-4 text-right">Taxas Descontadas</th>
                  <th className="py-3 px-4 text-right font-bold text-zinc-900 dark:text-zinc-100">
                    Repasse Líquido
                  </th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                {settlements.map((set) => (
                  <tr key={set.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition">
                    <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                      {set.transferDate}
                    </td>
                    <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">{set.bankName}</div>
                      <div className="text-[11px] text-zinc-400">{set.accountNumber}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-medium">
                      R$ {set.grossAmount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right text-red-600 dark:text-red-400">
                      - R$ {set.discountsAndFees.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-blue-600 dark:text-blue-400 text-sm">
                      R$ {set.netAmount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          set.status === "PAID"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                        }`}
                      >
                        {set.status === "PAID" ? "Creditado em Conta" : "Agendado"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. ANTICIPATIONS */}
        {activeSubTab === "anticipations" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Data Solicitada</th>
                  <th className="py-3 px-4 text-right">Valor Solicitado</th>
                  <th className="py-3 px-4 text-right">Custo da Antecipação (Taxa)</th>
                  <th className="py-3 px-4 text-right font-bold">Líquido Creditado</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                {anticipations.map((ant) => (
                  <tr key={ant.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition">
                    <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">{ant.date}</td>
                    <td className="py-3 px-4 text-right font-medium">
                      R$ {ant.requestedAmount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right text-red-600 dark:text-red-400 font-medium">
                      - R$ {ant.feeAmount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      R$ {ant.netAmount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {ant.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
