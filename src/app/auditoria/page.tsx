"use client";

import React, { useState, useEffect } from "react";
import { ShieldCheck, Search, Filter, Clock, User, FileText } from "lucide-react";
import { store } from "@/services/store";
import { ActivityLog } from "@/types";
import { formatDateTime } from "@/lib/utils";

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [, setTick] = useState(0);

  useEffect(() => {
    setLogs(store.getLogs());
    const handleUpdate = () => {
      setLogs(store.getLogs());
      setTick((t) => t + 1);
    };
    window.addEventListener("house190_data_updated", handleUpdate);
    return () => window.removeEventListener("house190_data_updated", handleUpdate);
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.userName.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      log.details.toLowerCase().includes(q) ||
      log.entityType.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/60 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Trilha de Auditoria & Histórico Imutável
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Registro cronológico protegido contra alterações de todas as operações financeiras, cadastrais e de aprovação
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-100 text-zinc-700 text-xs font-medium dark:bg-zinc-800 dark:text-zinc-300">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>Auditoria Ativa (Append-Only)</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Pesquisar por usuário, ação ou detalhe..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8.5 pl-8.5 pr-3 text-xs rounded-md border border-zinc-200 bg-white placeholder-zinc-400 focus:outline-none dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
          />
        </div>
        <span className="text-xs text-zinc-500">
          Total de <strong className="text-zinc-800 dark:text-zinc-200">{filteredLogs.length}</strong> eventos registrados
        </span>
      </div>

      {/* Logs Table */}
      <div className="rounded-lg border border-zinc-200/80 bg-white overflow-hidden shadow-2xs dark:bg-zinc-900 dark:border-zinc-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-400 font-semibold uppercase tracking-wider text-[10px] dark:bg-zinc-800/60 dark:border-zinc-800">
            <tr>
              <th className="py-3 px-4">Data e Hora</th>
              <th className="py-3 px-4">Usuário</th>
              <th className="py-3 px-4">Ação</th>
              <th className="py-3 px-4">Entidade</th>
              <th className="py-3 px-4">Detalhes da Modificação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filteredLogs.map((log) => (
              <tr key={log.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50">
                <td className="py-3 px-4 tabular-nums text-zinc-500 whitespace-nowrap">
                  {formatDateTime(log.timestamp)}
                </td>
                <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-zinc-100">
                  {log.userName}
                </td>
                <td className="py-3 px-4">
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {log.action}
                  </span>
                </td>
                <td className="py-3 px-4 text-zinc-500 font-mono text-[11px]">
                  {log.entityType} ({log.entityId})
                </td>
                <td className="py-3 px-4 text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {log.details}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
