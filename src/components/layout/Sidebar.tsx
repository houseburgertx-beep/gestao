"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
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
  ShieldCheck,
  Building,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnit } from "@/contexts/UnitContext";
import { useAuth } from "@/contexts/AuthContext";

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { title: "Visão Geral", href: "/", icon: LayoutDashboard },
  { title: "Financeiro", href: "/financeiro", icon: Wallet },
  { title: "Fornecedores", href: "/fornecedores", icon: Building2 },
  { title: "Fiscal & Impostos", href: "/fiscal", icon: Receipt },
  { title: "Faturamento", href: "/faturamento", icon: TrendingUp },
  { title: "Metas", href: "/metas", icon: Target },
  { title: "RH & Pessoas", href: "/rh", icon: Users },
  { title: "Tarefas & Projetos", href: "/tarefas", icon: CheckSquare },
  { title: "Documentos", href: "/documentos", icon: FolderLock },
  { title: "Relatórios", href: "/relatorios", icon: FileBarChart },
  { title: "Auditoria & Logs", href: "/auditoria", icon: ShieldCheck },
];

export function Sidebar() {
  const pathname = usePathname();
  const { activeUnitData } = useUnit();
  const { user, userProfile } = useAuth();

  return (
    <aside className="hidden lg:flex w-64 flex-col fixed inset-y-0 left-0 bg-white border-r border-zinc-200/80 dark:bg-zinc-950 dark:border-zinc-800 z-30 select-none">
      {/* Brand Header */}
      <div className="h-14 flex items-center justify-between px-5 border-b border-zinc-100 dark:border-zinc-900">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-md bg-zinc-900 flex items-center justify-center text-white font-bold text-xs tracking-tighter dark:bg-zinc-100 dark:text-zinc-900">
            190
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold tracking-wider text-zinc-900 dark:text-zinc-50 uppercase">
              HOUSE 190
            </span>
            <span className="text-[10px] text-zinc-400 font-medium tracking-tight">
              Gestão Integrada
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
          Menu Principal
        </div>
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors",
                isActive
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/70 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-900"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={cn(
                    "h-4 w-4 stroke-[1.6]",
                    isActive
                      ? "text-current"
                      : "text-zinc-400 group-hover:text-zinc-600 dark:text-zinc-500"
                  )}
                />
                <span>{item.title}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-200 text-zinc-800 font-semibold dark:bg-zinc-800 dark:text-zinc-200">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Footer Profile & Unit Context */}
      <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="flex items-center gap-2 text-[11px] text-zinc-500 mb-2">
          <Building className="h-3.5 w-3.5 text-zinc-400" />
          <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">
            {activeUnitData.name}
          </span>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-zinc-200/50 dark:border-zinc-800/50">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-zinc-200 flex items-center justify-center text-[10px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {userProfile?.displayName?.substring(0, 2).toUpperCase() || "US"}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 leading-tight">
                {userProfile?.displayName || user?.email || "Usuário"}
              </span>
              <span className="text-[10px] text-zinc-400">
                {userProfile?.role === "admin" ? "Diretoria & Gestão" : userProfile?.role || "Acesso Firebase"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
