"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  FileText,
  Clock,
  ArrowUpRight,
  ExternalLink,
} from "lucide-react";
import { store } from "@/services/store";
import { Supplier } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { QuickCreateModal } from "@/components/layout/QuickCreateModal";

function FornecedoresContent() {
  const searchParams = useSearchParams();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    setSuppliers(store.getSuppliers());
    const handleUpdate = () => {
      setSuppliers(store.getSuppliers());
      setTick((t) => t + 1);
    };
    window.addEventListener("house190_data_updated", handleUpdate);
    return () => window.removeEventListener("house190_data_updated", handleUpdate);
  }, []);

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) setSelectedSupplierId(id);
  }, [searchParams]);

  const accounts = store.getAccounts();

  const filteredSuppliers = suppliers.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.tradeName.toLowerCase().includes(q) ||
      s.legalName.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      s.cnpjCpf.includes(q)
    );
  });

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);
  const supplierAccounts = selectedSupplier
    ? accounts.filter((a) => a.supplierId === selectedSupplier.id || a.supplierName === selectedSupplier.tradeName)
    : [];

  const totalPaid = supplierAccounts
    .filter((a) => a.status === "paid")
    .reduce((acc, cur) => acc + cur.finalAmount, 0);

  const totalPending = supplierAccounts
    .filter((a) => a.status !== "paid" && a.status !== "canceled")
    .reduce((acc, cur) => acc + cur.finalAmount, 0);

  const totalOverdue = supplierAccounts
    .filter((a) => a.status === "overdue")
    .reduce((acc, cur) => acc + cur.finalAmount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/60 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Fornecedores & Parceiros
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Cadastro unificado de credores, histórico financeiro, contratos e dados bancários
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setIsQuickCreateOpen(true)}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Cadastrar Fornecedor</span>
        </Button>
      </div>

      {/* Search & Stats */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Pesquisar por nome, CNPJ ou categoria..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8.5 pl-8.5 pr-3 text-xs rounded-md border border-zinc-200 bg-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div className="text-xs text-zinc-500">
          Total de <strong className="text-zinc-800 dark:text-zinc-200">{filteredSuppliers.length}</strong> fornecedores cadastrados
        </div>
      </div>

      {/* Suppliers Grid / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSuppliers.map((s) => {
          const supAccs = accounts.filter(
            (a) => a.supplierId === s.id || a.supplierName === s.tradeName
          );
          const supPending = supAccs
            .filter((a) => a.status !== "paid" && a.status !== "canceled")
            .reduce((acc, cur) => acc + cur.finalAmount, 0);

          return (
            <div
              key={s.id}
              onClick={() => setSelectedSupplierId(s.id)}
              className="p-5 rounded-lg border border-zinc-200/80 bg-white hover:border-zinc-300 cursor-pointer transition-all space-y-3 dark:bg-zinc-900 dark:border-zinc-800 dark:hover:border-zinc-700 shadow-2xs"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {s.tradeName}
                  </h3>
                  <span className="text-[11px] font-mono text-zinc-400">
                    {s.cnpjCpf}
                  </span>
                </div>
                <Badge variant="secondary">{s.category}</Badge>
              </div>

              <div className="text-xs text-zinc-500 space-y-1">
                <div className="flex items-center gap-1.5 truncate">
                  <Phone className="h-3 w-3 text-zinc-400 shrink-0" />
                  <span>{s.phone}</span>
                </div>
                <div className="flex items-center gap-1.5 truncate">
                  <Mail className="h-3 w-3 text-zinc-400 shrink-0" />
                  <span>{s.email}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <span className="text-[11px] text-zinc-400">A Pagar</span>
                <span className="text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatCurrency(supPending)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Supplier Profile Drawer */}
      <Drawer
        isOpen={!!selectedSupplier}
        onClose={() => setSelectedSupplierId(null)}
        title={selectedSupplier?.tradeName || "Perfil do Fornecedor"}
        subtitle={`CNPJ/CPF: ${selectedSupplier?.cnpjCpf} • Categoria: ${selectedSupplier?.category}`}
        width="lg"
      >
        {selectedSupplier && (
          <div className="space-y-6">
            {/* KPI Cards for Supplier */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-100 dark:bg-zinc-800/40 dark:border-zinc-800">
                <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                  Total Pago
                </span>
                <div className="mt-1 text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(totalPaid)}
                </div>
              </div>

              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-100 dark:bg-zinc-800/40 dark:border-zinc-800">
                <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                  Pendente
                </span>
                <div className="mt-1 text-sm font-mono font-bold text-zinc-900 dark:text-zinc-100">
                  {formatCurrency(totalPending)}
                </div>
              </div>

              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-100 dark:bg-zinc-800/40 dark:border-zinc-800">
                <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                  Vencido
                </span>
                <div className="mt-1 text-sm font-mono font-bold text-rose-600 dark:text-rose-400">
                  {formatCurrency(totalOverdue)}
                </div>
              </div>
            </div>

            {/* Corporate Data */}
            <div className="p-4 rounded-lg border border-zinc-200/80 bg-white space-y-3 dark:bg-zinc-900 dark:border-zinc-800 text-xs">
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs">
                Dados Cadastrais & Bancários
              </h4>

              <div className="grid grid-cols-2 gap-3 text-zinc-600 dark:text-zinc-300">
                <div>
                  <span className="text-[10px] text-zinc-400 block font-medium">Razão Social</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {selectedSupplier.legalName}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 block font-medium">Endereço</span>
                  <span>{selectedSupplier.address}</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 block font-medium">Chave PIX</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100 font-semibold">
                    {selectedSupplier.pixKey || "Não cadastrado"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 block font-medium">Conta Bancária</span>
                  <span>
                    {selectedSupplier.bankData
                      ? `${selectedSupplier.bankData.bank} | Ag: ${selectedSupplier.bankData.agency} | CC: ${selectedSupplier.bankData.account}`
                      : "Não cadastrado"}
                  </span>
                </div>
              </div>

              {selectedSupplier.notes && (
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-500">
                  <strong>Observações:</strong> {selectedSupplier.notes}
                </div>
              )}
            </div>

            {/* Recent Accounts / Releases */}
            <div>
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs mb-2">
                Últimos Lançamentos Financeiros
              </h4>

              <div className="rounded-md border border-zinc-200/80 overflow-hidden dark:border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 text-[10px] text-zinc-400 uppercase border-b border-zinc-100 dark:bg-zinc-800/60 dark:border-zinc-800">
                    <tr>
                      <th className="py-2 px-3">Vencimento</th>
                      <th className="py-2 px-3">Descrição</th>
                      <th className="py-2 px-3 text-right">Valor</th>
                      <th className="py-2 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {supplierAccounts.map((acc) => (
                      <tr key={acc.id}>
                        <td className="py-2 px-3 tabular-nums">{formatDate(acc.dueDate)}</td>
                        <td className="py-2 px-3">{acc.description}</td>
                        <td className="py-2 px-3 text-right font-mono font-medium">
                          {formatCurrency(acc.finalAmount)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <StatusBadge status={acc.status} />
                        </td>
                      </tr>
                    ))}

                    {supplierAccounts.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-zinc-400">
                          Nenhum lançamento vinculado a este fornecedor.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      <QuickCreateModal
        isOpen={isQuickCreateOpen}
        onClose={() => setIsQuickCreateOpen(false)}
        defaultTab="supplier"
      />
    </div>
  );
}

export default function FornecedoresPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-xs text-zinc-400">Carregando Fornecedores...</div>}>
      <FornecedoresContent />
    </React.Suspense>
  );
}
