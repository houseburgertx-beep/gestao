import { auth } from "@/lib/firebase";
import { HOUSE190_EMAIL_URL, HOUSE190_WORKER_URL } from "@/config/worker";
import type { AppNotification } from "@/types";

const EMAIL_WORKER_URL = HOUSE190_EMAIL_URL;

export type CashNotifyEvent = {
  eventKind: "cash_closing" | "cash_returned" | "cash_conference";
  unitId: string;
  unitName: string;
  operatorName: string;
  date: string;
  difference: number;
  revenueTotal?: number;
  countedTotal?: number;
  shift?: string;
  closingId?: string;
  returnReason?: string;
  reviewedBy?: string;
};

export async function notifyCashEventViaFolgas(payload: CashNotifyEvent): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const token = await user.getIdToken();
    await fetch(`${HOUSE190_WORKER_URL}/cash-event-relay`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.warn("Relay de notificacao WhatsApp/Folgas indisponivel:", err);
  }
}

export async function sendNotificationEmail(
  eventId: string,
  notification: Omit<AppNotification, "id">
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Faça login para enviar a notificação por e-mail.");

  try {
    const token = await user.getIdToken();
    const response = await fetch(EMAIL_WORKER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventId,
        kind: notification.eventKind || notification.type,
        unitId: notification.unitId,
        title: notification.title,
        message: notification.message,
        details: notification.details,
        link: notification.link,
        severity: notification.severity,
      }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.message || `Falha no envio de e-mail (${response.status}).`);
    }
  } catch (error) {
    console.warn("Serviço de e-mail temporariamente indisponível.", error);
    throw error;
  }
}

export async function synchronizeEmailDirectory(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const response = await fetch(EMAIL_WORKER_URL.replace("/email","/directory"), {method:"POST",headers:{Authorization:`Bearer ${await user.getIdToken()}`,"Content-Type":"application/json"},body:"{}"});
  if (!response.ok) throw new Error("Não foi possível sincronizar os destinatários de e-mail.");
}
