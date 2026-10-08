"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, Plus, Bell, Menu, User as UserIcon, Users } from "lucide-react";
import { UnitSelector } from "@/components/layout/UnitSelector";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { QuickCreateModal } from "@/components/layout/QuickCreateModal";
import { NotificationCenter } from "@/components/layout/NotificationCenter";
import { AuthModal } from "@/components/layout/AuthModal";
import { UserManagementModal } from "@/components/users/UserManagementModal";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeNotifications } from "@/services/firestoreService";
import { normalizeRole } from "@/components/layout/managementNavigation";
import { AppNotification } from "@/types";

export function Header({ onMobileMenuToggle }: { onMobileMenuToggle?: () => void }) {
  const { user, userProfile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const cleanPath = (pathname || "").replace(/^\/gestao/, "") || "/";
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const seenNotificationIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    const openUserMgmt = () => setIsUserManagementOpen(true);
    window.addEventListener("open-user-management", openUserMgmt);
    return () => window.removeEventListener("open-user-management", openUserMgmt);
  }, []);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setIsCommandOpen(true);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    const unsub = subscribeNotifications(user.uid, (list) => {
      setNotifications(list);

      if (seenNotificationIds.current === null) {
        seenNotificationIds.current = new Set(list.map((notification) => notification.id));
        return;
      }

      const newNotification = list.find(
        (notification) => !notification.read && !seenNotificationIds.current?.has(notification.id)
      );
      list.forEach((notification) => seenNotificationIds.current?.add(notification.id));

      if (newNotification && typeof window !== "undefined" && window.Notification?.permission === "granted") {
        try {
          new window.Notification(newNotification.title, {
            body: newNotification.message,
            icon: "/icon.svg",
          });
        } catch {}
      }
    });
    return () => unsub();
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const primaryActionLabel = cleanPath.startsWith("/tarefas")
    ? "Nova tarefa"
      : cleanPath.startsWith("/rh")
      ? "Novo colaborador"
      : cleanPath.startsWith("/fechamento-caixa")
        ? "Novo fechamento"
      : cleanPath.startsWith("/auditoria-caixa")
        ? "Atualizar auditoria"
      : cleanPath.startsWith("/conferencia-caixa")
        ? "Nova conferência"
      : cleanPath.startsWith("/fornecedores")
        ? "Novo fornecedor"
      : cleanPath.startsWith("/documentos")
        ? "Novo documento"
      : cleanPath.startsWith("/nfe-recebida")
        ? "Sincronizar notas"
      : cleanPath.startsWith("/faturamento") || cleanPath.startsWith("/integracoes/takeat")
        ? "Atualizar vendas"
      : "Nova conta";
  const openNewRecord = () => {
    if (cleanPath.startsWith("/nfe-recebida")) {
      window.dispatchEvent(new CustomEvent("sync-takeat-nfe"));
      return;
    }
    if (cleanPath.startsWith("/tarefas")) {
      window.dispatchEvent(new CustomEvent("open-task-form"));
      return;
    }
    if (cleanPath.startsWith("/rh")) {
      window.dispatchEvent(new CustomEvent("open-employee-form"));
      return;
    }
    if (cleanPath.startsWith("/fechamento-caixa")) { window.dispatchEvent(new CustomEvent("open-cashClosings-form")); return; }
    if (cleanPath.startsWith("/auditoria-caixa")) { window.dispatchEvent(new CustomEvent("refresh-cash-audit")); return; }
    if (cleanPath.startsWith("/conferencia-caixa")) { window.dispatchEvent(new CustomEvent("open-cashConferences-form")); return; }
    if (cleanPath.startsWith("/fornecedores")) {
      window.dispatchEvent(new CustomEvent("open-supplier-form"));
      return;
    }
    if (cleanPath.startsWith("/documentos")) {
      window.dispatchEvent(new CustomEvent("open-document-form"));
      return;
    }
    if (cleanPath.startsWith("/faturamento") || cleanPath.startsWith("/integracoes/takeat")) {
      window.dispatchEvent(new CustomEvent("sync-takeat-sales"));
      return;
    }
    if (cleanPath === "/" || cleanPath.startsWith("/contas-a-pagar")) {
      window.dispatchEvent(new CustomEvent("open-payable-form"));
      return;
    }
    router.push("/contas-a-pagar/?novo=1");
  };

  return (
    <>
      <header className="sticky top-0 z-20 h-16 w-full bg-white/80 backdrop-blur-[14px] border-b border-slate-200/60 px-4 lg:px-7 flex items-center justify-between shadow-[0_4px_20px_rgba(40,45,70,0.03)]">
        {/* Left Section: Unit Selector & Mobile Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMobileMenuToggle}
            className="lg:hidden p-2 rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900 transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          <UnitSelector />
        </div>

        {/* Center / Search: Command Palette Trigger */}
        <div className="flex-1 max-w-md mx-4 hidden md:block">
          <button
            onClick={() => setIsCommandOpen(true)}
            className="w-full h-9 px-4 rounded-full border border-slate-200/80 bg-slate-100/60 hover:bg-white hover:border-slate-300 text-xs text-slate-500 flex items-center justify-between transition-all shadow-[0_2px_8px_rgba(40,45,70,0.02)]"
          >
            <div className="flex items-center gap-2.5">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <span>Pesquisar em toda a House 190...</span>
            </div>
            <kbd className="px-2 py-0.5 text-[10px] font-mono font-medium text-slate-400 bg-white border border-slate-200 rounded-full shadow-2xs">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right Section: Quick Actions, Notifications & Profile */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Mobile Search Button */}
          <button
            onClick={() => setIsCommandOpen(true)}
            className="md:hidden p-2 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* + Novo Button */}
          <Button
            size="sm"
            onClick={openNewRecord}
            className="h-9 px-4 text-xs gap-1.5 !rounded-full !bg-gradient-to-r !from-[#554abc] !to-[#7163dc] !text-white shadow-[0_8px_20px_rgba(85,74,188,0.22)] hover:shadow-[0_10px_24px_rgba(85,74,188,0.32)] hover:-translate-y-0.5 transition-all duration-200"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{primaryActionLabel}</span>
          </Button>

          {/* Notifications */}
          <button
            onClick={() => setIsNotificationOpen(true)}
            className="relative p-2 rounded-full text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-900"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white ring-2 ring-white dark:ring-zinc-950">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Profile Badge / Auth Trigger */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-200 dark:border-zinc-800">
            {user && ["admin", "accountant"].includes(normalizeRole(userProfile?.role)) && (
              <button
                onClick={() => setIsUserManagementOpen(true)}
                title="Gerenciar Usuários"
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-purple-700 dark:hover:text-purple-300 transition"
              >
                <Users className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                <span className="hidden sm:inline font-semibold">Usuários</span>
              </button>
            )}
            {user ? (
              <button
                onClick={() => setIsAuthOpen(true)}
                title={user.email || "Usuário Conectado"}
                className="flex items-center gap-2 p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
              >
                <div className="relative">
                  <div className="h-7 w-7 rounded-full bg-zinc-900 text-white flex items-center justify-center text-[10px] font-semibold dark:bg-zinc-100 dark:text-zinc-900">
                    {userProfile?.displayName ? userProfile.displayName.substring(0, 2).toUpperCase() : "AD"}
                  </div>
                  <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-950" />
                </div>
                <span className="hidden md:inline text-xs font-medium text-zinc-700 dark:text-zinc-300 max-w-[100px] truncate">
                  {userProfile?.displayName || "Admin"}
                </span>
              </button>
            ) : (
              <button
                onClick={() => setIsAuthOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-md transition-colors dark:text-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                <UserIcon className="h-3.5 w-3.5" />
                <span>Entrar</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Modals & Drawers */}
      <CommandPalette
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
      />
      <QuickCreateModal
        isOpen={isQuickCreateOpen}
        onClose={() => setIsQuickCreateOpen(false)}
      />
      <NotificationCenter
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        notifications={notifications}
        onNotificationsChange={setNotifications}
      />
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />
      <UserManagementModal
        isOpen={isUserManagementOpen}
        onClose={() => setIsUserManagementOpen(false)}
      />
    </>
  );
}
