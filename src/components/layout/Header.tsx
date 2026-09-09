"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, Plus, Bell, Menu, User as UserIcon } from "lucide-react";
import { UnitSelector } from "@/components/layout/UnitSelector";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { QuickCreateModal } from "@/components/layout/QuickCreateModal";
import { NotificationCenter } from "@/components/layout/NotificationCenter";
import { AuthModal } from "@/components/layout/AuthModal";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeNotifications } from "@/services/firestoreService";
import { AppNotification } from "@/types";

export function Header({ onMobileMenuToggle }: { onMobileMenuToggle?: () => void }) {
  const { user, userProfile } = useAuth();
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const seenNotificationIds = useRef<Set<string> | null>(null);

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
        new window.Notification(newNotification.title, {
          body: newNotification.message,
          icon: "/gestao/icon.svg",
        });
      }
    });
    return () => unsub();
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <>
      <header className="sticky top-0 z-20 h-14 w-full bg-white/95 backdrop-blur border-b border-zinc-200/80 px-4 lg:px-6 flex items-center justify-between dark:bg-zinc-950/95 dark:border-zinc-800">
        {/* Left Section: Unit Selector & Mobile Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMobileMenuToggle}
            className="lg:hidden p-1.5 rounded-md text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            <Menu className="h-5 w-5" />
          </button>
          <UnitSelector />
        </div>

        {/* Center / Search: Command Palette Trigger */}
        <div className="flex-1 max-w-md mx-4 hidden md:block">
          <button
            onClick={() => setIsCommandOpen(true)}
            className="w-full h-8.5 px-3 rounded-md border border-zinc-200/80 bg-zinc-50/70 hover:bg-zinc-100/70 text-xs text-zinc-400 flex items-center justify-between transition-colors dark:bg-zinc-900/60 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <div className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-zinc-400" />
              <span>Pesquisar em toda a House 190...</span>
            </div>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-medium text-zinc-400 bg-white border border-zinc-200 rounded shadow-2xs dark:bg-zinc-800 dark:border-zinc-700">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right Section: Quick Actions, Notifications & Profile */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Mobile Search Button */}
          <button
            onClick={() => setIsCommandOpen(true)}
            className="md:hidden p-2 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* + Novo Button */}
          <Button
            size="sm"
            onClick={() => setIsQuickCreateOpen(true)}
            className="h-8 px-2.5 sm:px-3 text-xs gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Novo</span>
          </Button>

          {/* Notifications */}
          <button
            onClick={() => setIsNotificationOpen(true)}
            className="relative p-2 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-900"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white ring-2 ring-white dark:ring-zinc-950">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Profile Badge / Auth Trigger */}
          <div className="flex items-center pl-2 border-l border-zinc-200 dark:border-zinc-800">
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
    </>
  );
}
