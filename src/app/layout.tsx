"use client";

import React, { useEffect, useState } from "react";
import {homeForRole, navigationForRole, roleCanAccess, normalizePath, normalizeRole} from "@/components/layout/managementNavigation";
import { usePathname, useRouter } from "next/navigation";
import "./globals.css";
import "@/components/management/management.css";
import { ManagementProvider } from "@/contexts/ManagementContext";
import { UnitProvider } from "@/contexts/UnitContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { EmployeeDeadlineAlerts } from "@/components/layout/EmployeeDeadlineAlerts";
import { EmailDirectorySync } from "@/components/layout/EmailDirectorySync";
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
  LogOut,
} from "lucide-react";

function ProtectedShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, userProfile, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const effectiveRole = normalizeRole(userProfile?.role);
  const menuItems = navigationForRole(effectiveRole);
  const canAccess = roleCanAccess(effectiveRole, pathname);

  useEffect(() => {
    if (!user || !userProfile) return;
    const current = normalizePath(pathname);
    const target = normalizePath(homeForRole(effectiveRole));
    if (!canAccess && current !== target) {
      router.replace(target);
    }
  }, [user, userProfile, effectiveRole, canAccess, pathname, router]);

  if (loading || (user && !userProfile)) {
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

  if (!canAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa] dark:bg-zinc-950 p-4">
        <div className="max-w-sm w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-lg border border-zinc-200 dark:border-zinc-800 p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Área Restrita</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
              Seu perfil de acesso ({effectiveRole}) é direcionado para a sua área de trabalho autorizada.
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => router.replace(homeForRole(effectiveRole))}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold transition-colors"
            >
              Ir para minha área autorizada
            </button>
            <button
              onClick={() => logout()}
              className="w-full py-2 px-4 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 text-xs font-medium transition-colors"
            >
              Trocar de conta (Sair)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ManagementProvider><UnitProvider>
            <EmployeeDeadlineAlerts />
            <EmailDirectorySync />
            {/* Desktop Fixed Sidebar */}
            <Sidebar />

          {/* Main Content Area */}
          <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
            <Header onMobileMenuToggle={() => setMobileMenuOpen(true)} />

            <main className="flex-1 p-4 lg:p-7 max-w-[1600px] w-full mx-auto pb-20 lg:pb-12">
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
            <div className="flex flex-col h-full -mx-2">
              {/* User Profile Card */}
              {user && (
                <div className="p-3 mb-3 rounded-xl bg-gradient-to-br from-indigo-50/80 to-purple-50/80 dark:from-zinc-800/80 dark:to-zinc-800/40 border border-indigo-100 dark:border-zinc-700/60 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-[#554abc] to-[#7163dc] text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
                    {userProfile?.displayName ? userProfile.displayName.substring(0, 2).toUpperCase() : "US"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                      {userProfile?.displayName || user.email || "Usuário Conectado"}
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 capitalize">
                      {effectiveRole === "operator" ? "Operador de Caixa" : effectiveRole === "manager" ? "Gerente de Loja" : effectiveRole === "accountant" ? "Financeiro" : "Diretoria"}
                    </p>
                  </div>
                </div>
              )}

              {/* Module Links */}
              <div className="space-y-1 flex-1">
                <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-3 mb-2">
                  Áreas Disponíveis
                </p>
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const current = normalizePath(pathname);
                  const isCurrentActive = item.href === "/" ? current === "/" : current.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                        isCurrentActive
                          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                          : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`h-4 w-4 ${isCurrentActive ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400"}`} />
                        <span>{item.title}</span>
                      </div>
                      {isCurrentActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                      )}
                    </Link>
                  );
                })}
              </div>

              {/* Bottom Logout Button */}
              {user && (
                <div className="pt-4 mt-4 border-t border-zinc-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      logout();
                    }}
                    className="flex items-center justify-center gap-2 w-full py-2.5 px-3 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 dark:text-rose-400 rounded-xl transition"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sair da conta</span>
                  </button>
                </div>
              )}
            </div>
          </Drawer>
    </UnitProvider></ManagementProvider>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="h-full" suppressHydrationWarning>
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
      <body
        className="min-h-full flex flex-col font-sans bg-[#fafafa] dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50"
        suppressHydrationWarning
      >
        <AuthProvider>
          <ProtectedShell>{children}</ProtectedShell>
        </AuthProvider>
      </body>
    </html>
  );
}
