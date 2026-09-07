"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  Wallet,
  Building2,
  Receipt,
  TrendingUp,
  Target,
  Users,
  CheckSquare,
  FolderLock,
  FileBarChart,
  User,
  ArrowRight,
  X,
} from "lucide-react";
import { store } from "@/services/store";
import { useUnit } from "@/contexts/UnitContext";
import { formatCurrency, formatDate } from "@/lib/utils";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const { setCurrentUnit } = useUnit();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Open
        }
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = query.toLowerCase().trim();

  // Search Results
  const pages = [
    { title: "Visão Geral (Dashboard)", href: "/", icon: LayoutDashboard },
    { title: "Financeiro & Contas a Pagar", href: "/financeiro", icon: Wallet },
    { title: "Fornecedores & Parceiros", href: "/fornecedores", icon: Building2 },
    { title: "Fiscal & Calendário Tributário", href: "/fiscal", icon: Receipt },
    { title: "Faturamento & Vendas Diárias", href: "/faturamento", icon: TrendingUp },
    { title: "Metas & Projeções", href: "/metas", icon: Target },
    { title: "RH & Colaboradores", href: "/rh", icon: Users },
    { title: "Tarefas & Projetos (Kanban)", href: "/tarefas", icon: CheckSquare },
    { title: "Biblioteca de Documentos", href: "/documentos", icon: FolderLock },
    { title: "Relatórios Gerenciais", href: "/relatorios", icon: FileBarChart },
  ].filter((p) => !q || p.title.toLowerCase().includes(q));

  const suppliers = store
    .getSuppliers()
    .filter((s) => !q || s.legalName.toLowerCase().includes(q) || s.tradeName.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))
    .slice(0, 3);

  const employees = store
    .getEmployees()
    .filter((e) => !q || e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q) || e.department.toLowerCase().includes(q))
    .slice(0, 3);

  const accounts = store
    .getAccounts()
    .filter((a) => !q || a.description.toLowerCase().includes(q) || a.supplierName.toLowerCase().includes(q))
    .slice(0, 3);

  const tasks = store
    .getTasks()
    .filter((t) => !q || t.title.toLowerCase().includes(q) || t.assigneeName.toLowerCase().includes(q))
    .slice(0, 3);

  const docs = store
    .getDocuments()
    .filter((d) => !q || d.title.toLowerCase().includes(q) || d.category.toLowerCase().includes(q))
    .slice(0, 3);

  const navigate = (href: string) => {
    router.push(href);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
      <div
        onClick={onClose}
        className="fixed inset-0 bg-zinc-950/40 backdrop-blur-[2px] transition-opacity"
      />

      <div className="relative w-full max-w-xl rounded-xl bg-white shadow-2xl border border-zinc-200 overflow-hidden z-10 dark:bg-zinc-900 dark:border-zinc-800">
        {/* Search Bar */}
        <div className="flex items-center px-4 border-b border-zinc-100 dark:border-zinc-800">
          <Search className="h-4 w-4 text-zinc-400 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Pesquisar contas, fornecedores, colaboradores, tarefas..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-12 bg-transparent text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none dark:text-zinc-50"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-zinc-400 hover:text-zinc-600 p-1">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-block ml-2 px-1.5 py-0.5 text-[10px] font-mono font-medium text-zinc-400 bg-zinc-100 rounded dark:bg-zinc-800">
            ESC
          </kbd>
        </div>

        {/* Results Body */}
        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-3">
          {/* Páginas */}
          {pages.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                Navegação
              </div>
              <div className="space-y-0.5">
                {pages.slice(0, 4).map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.href}
                      onClick={() => navigate(p.href)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-colors text-left dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-zinc-400" />
                        <span>{p.title}</span>
                      </div>
                      <ArrowRight className="h-3 w-3 text-zinc-400" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fornecedores */}
          {suppliers.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                Fornecedores
              </div>
              <div className="space-y-0.5">
                {suppliers.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/fornecedores?id=${s.id}`)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-colors text-left dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <div>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {s.tradeName}
                      </span>{" "}
                      <span className="text-zinc-400 text-[11px]">({s.category})</span>
                    </div>
                    <span className="text-[11px] text-zinc-400">{s.cnpjCpf}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Contas a Pagar */}
          {accounts.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                Contas a Pagar
              </div>
              <div className="space-y-0.5">
                {accounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/financeiro?id=${a.id}`)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-colors text-left dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <div className="truncate max-w-[320px]">
                      <span className="font-medium">{a.description}</span>
                      <span className="text-zinc-400 ml-1.5 text-[11px]">• {a.supplierName}</span>
                    </div>
                    <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
                      {formatCurrency(a.finalAmount)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Colaboradores */}
          {employees.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                Colaboradores (RH)
              </div>
              <div className="space-y-0.5">
                {employees.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => navigate(`/rh?id=${e.id}`)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-colors text-left dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-zinc-400" />
                      <span className="font-medium">{e.name}</span>
                      <span className="text-zinc-400 text-[11px]">• {e.role}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tarefas */}
          {tasks.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                Tarefas
              </div>
              <div className="space-y-0.5">
                {tasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => navigate(`/tarefas?id=${t.id}`)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-colors text-left dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <div className="truncate max-w-[340px]">
                      <span className="font-medium">{t.title}</span>
                    </div>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      {formatDate(t.dueDate)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {pages.length === 0 && suppliers.length === 0 && accounts.length === 0 && (
            <div className="py-8 text-center text-xs text-zinc-400">
              Nenhum resultado encontrado para &quot;{query}&quot;.
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between text-[11px] text-zinc-400 dark:bg-zinc-900/60 dark:border-zinc-800">
          <span>Use as setas para navegar e Enter para selecionar</span>
          <span>HOUSE 190</span>
        </div>
      </div>
    </div>
  );
}
