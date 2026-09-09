"use client";

import React, { useState } from "react";
import "./globals.css";
import { UnitProvider } from "@/contexts/UnitContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { Drawer } from "@/components/ui/Drawer";
import { AuthModal } from "@/components/layout/AuthModal";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
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
} from "lucide-react";

function ProtectedShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, loading } = useAuth();

  const menuItems = [
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa] dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-9 w-9 rounded-lg bg-zinc-900 text-white flex items-center justify-center text-xs font-bold dark:bg-zinc-100 dark:text-zinc-900">190</div>
          <p className="text-xs text-zinc-500">Conectando ao Firebase...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#fafafa] dark:bg-zinc-950">
        <AuthModal isOpen required onClose={() => {}} />
      </div>
    );
  }

  return (
    <UnitProvider>
            {/* Desktop Fixed Sidebar */}
            <Sidebar />

          {/* Main Content Area */}
          <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
            <Header onMobileMenuToggle={() => setMobileMenuOpen(true)} />

            <main className="flex-1 p-4 lg:p-7 max-w-7xl w-full mx-auto pb-20 lg:pb-12">
              {children}
            </main>

            {/* Mobile Bottom Bar */}
            <BottomNav onOpenMobileMenu={() => setMobileMenuOpen(true)} />
          </div>

          {/* Mobile All-modules Drawer */}
          <Drawer
            isOpen={mobileMenuOpen}
            onClose={() => setMobileMenuOpen(false)}
            title="Módulos House 190"
            subtitle="Navegue entre as áreas de gestão"
            width="sm"
          >
            <div className="space-y-1 -mx-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <Icon className="h-4 w-4 text-zinc-400" />
                    <span>{item.title}</span>
                  </Link>
                );
              })}
            </div>
          </Drawer>
    </UnitProvider>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="h-full">
      <head>
        <title>HOUSE 190 — Painel de Gestão Integrada</title>
        <meta
          name="description"
          content="Central de comando empresarial e gestão integrada da House 190"
        />
        <link rel="manifest" href="/gestao/manifest.json" />
        <meta name="theme-color" content="#09090b" />
        <link rel="icon" href="/gestao/icon.svg" type="image/svg+xml" />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-[#fafafa] dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
        <AuthProvider>
          <ProtectedShell>{children}</ProtectedShell>
        </AuthProvider>
      </body>
    </html>
  );
}
