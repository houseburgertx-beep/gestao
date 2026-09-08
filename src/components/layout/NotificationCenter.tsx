"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Drawer } from "@/components/ui/Drawer";
import { Badge } from "@/components/ui/Badge";
import { store } from "@/services/store";
import { formatDateTime } from "@/lib/utils";
import { Bell, Check, ExternalLink } from "lucide-react";
import {
  subscribeNotifications,
  markNotificationAsReadInFirestore,
  markAllNotificationsAsReadInFirestore,
} from "@/services/firestoreService";
import { AppNotification } from "@/types";

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    // Initial from store
    const local = store.getNotifications();
    if (local.length > 0) setNotifications(local);

    // Live subscription
    const unsub = subscribeNotifications((cloudList) => {
      if (cloudList.length > 0) {
        setNotifications(cloudList);
      } else {
        setNotifications(store.getNotifications());
      }
    });
    return () => unsub();
  }, []);

  const unread = notifications.filter((n) => !n.read);

  const handleMarkAllRead = async () => {
    unread.forEach((n) => store.markNotificationRead(n.id));
    await markAllNotificationsAsReadInFirestore();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleMarkSingleRead = async (id: string) => {
    store.markNotificationRead(id);
    await markNotificationAsReadInFirestore(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Central de Notificações"
      subtitle={`${unread.length} pendências não lidas`}
      width="md"
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-xs text-zinc-400">Notificações House 190</span>
          {unread.length > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100 flex items-center gap-1"
            >
              <Check className="h-3 w-3" />
              Marcar todas como lidas
            </button>
          )}
        </div>
      }
    >
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800 -mx-6">
        {notifications.map((n) => {
          const severityColors = {
            danger: "border-l-rose-500 bg-rose-50/20 dark:bg-rose-950/20",
            warning: "border-l-amber-500 bg-amber-50/20 dark:bg-amber-950/20",
            info: "border-l-sky-500 bg-sky-50/20 dark:bg-sky-950/20",
            success: "border-l-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20",
          };

          return (
            <div
              key={n.id}
              className={`p-4 border-l-4 transition-colors ${
                severityColors[n.severity]
              } ${n.read ? "opacity-75" : "opacity-100"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {n.title}
                </span>
                <span className="text-[10px] text-zinc-400 shrink-0">
                  {formatDateTime(n.timestamp)}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {n.message}
              </p>
              {n.link && (
                <div className="mt-2 flex justify-end">
                  <Link
                    href={n.link}
                    onClick={() => {
                      handleMarkSingleRead(n.id);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700 dark:text-zinc-100"
                  >
                    <span>Ver detalhe</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </div>
          );
        })}

        {notifications.length === 0 && (
          <div className="py-12 text-center text-xs text-zinc-400">
            Nenhuma notificação registrada.
          </div>
        )}
      </div>
    </Drawer>
  );
}
