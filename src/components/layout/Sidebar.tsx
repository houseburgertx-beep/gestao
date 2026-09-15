"use client";

import React from "react";
import {navigationForRole} from "./managementNavigation";
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

export function Sidebar() {
  const pathname = usePathname();
  const { activeUnitData } = useUnit();
  const { user, userProfile } = useAuth();
  const NAV_ITEMS: NavItem[] = navigationForRole(userProfile?.role);

  return (
    <aside className="hidden lg:flex w-64 flex-col fixed inset-y-0 left-0 bg-[#17162f] border-r border-[#29264d] z-30 select-none text-white">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-white/10">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#7b6df0] to-[#5147bc] flex items-center justify-center text-white font-bold text-xs tracking-tighter shadow-lg shadow-purple-950/30">
            190
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold tracking-wider text-white uppercase">
              HOUSE 190
            </span>
            <span className="text-[10px] text-[#aaa5cf] font-medium tracking-tight">
              Financeiro & Operações
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-semibold text-[#77729d] uppercase tracking-wider">
          Áreas principais
        </div>
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/" || pathname.startsWith("/contas-a-pagar")
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors",
                isActive
                  ? "bg-gradient-to-r from-[#6658d3] to-[#7567dd] text-white shadow-md shadow-purple-950/20"
                  : "text-[#aaa6c8] hover:text-white hover:bg-white/[.07]"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={cn(
                    "h-4 w-4 stroke-[1.6]",
                    isActive
                      ? "text-current"
                      : "text-[#77729d]"
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
      <div className="border-t border-white/10 px-4 py-4 bg-white/[.025]">
        <div className="flex items-center gap-2 text-[11px] text-[#8883aa] mb-2">
          <Building className="h-3.5 w-3.5 text-[#77729d]" />
          <span className="truncate font-medium text-[#c5c1dd]">
            {activeUnitData.name}
          </span>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-white/[.07]">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-[#39365e] flex items-center justify-center text-[10px] font-semibold text-white">
              {userProfile?.displayName?.substring(0, 2).toUpperCase() || "US"}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-[#e5e2f2] leading-tight">
                {userProfile?.displayName || user?.email || "Usuário"}
              </span>
              <span className="text-[10px] text-[#77729d]">
                {userProfile?.role === "admin" ? "Diretoria & Gestão" : userProfile?.role === "accountant" ? "Financeiro" : userProfile?.role === "manager" ? "Gerente da unidade" : userProfile?.role === "operator" ? "Operador de caixa" : "Acesso Firebase"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
