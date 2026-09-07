"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wallet, CheckSquare, Target, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav({ onOpenMobileMenu }: { onOpenMobileMenu: () => void }) {
  const pathname = usePathname();

  const items = [
    { label: "Início", href: "/", icon: LayoutDashboard },
    { label: "Financeiro", href: "/financeiro", icon: Wallet },
    { label: "Tarefas", href: "/tarefas", icon: CheckSquare },
    { label: "Metas", href: "/metas", icon: Target },
  ];

  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 h-14 bg-white/95 backdrop-blur border-t border-zinc-200 z-30 px-3 flex items-center justify-around dark:bg-zinc-950/95 dark:border-zinc-800">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-md transition-colors",
              isActive
                ? "text-zinc-900 font-semibold dark:text-zinc-50"
                : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="text-[10px]">{item.label}</span>
          </Link>
        );
      })}

      <button
        onClick={onOpenMobileMenu}
        className="flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-md text-zinc-400 hover:text-zinc-600 transition-colors dark:text-zinc-500"
      >
        <Menu className="h-4 w-4" />
        <span className="text-[10px]">Mais</span>
      </button>
    </div>
  );
}
