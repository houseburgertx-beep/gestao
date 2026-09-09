import { auth } from "@/lib/firebase";
import type { AppNotification } from "@/types";

const EMAIL_WORKER_URL =
  "https://house190-email-notifications.house-folgas-notifications.workers.dev/notifications/email";

export async function sendNotificationEmail(
  eventId: string,
  notification: Omit<AppNotification, "id">
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

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
        title: notification.title,
        message: notification.message,
        link: notification.link,
        severity: notification.severity,
      }),
    });

    if (!response.ok) {
      console.warn("O e-mail da notificação não pôde ser enviado.");
    }
  } catch (error) {
    console.warn("Serviço de e-mail temporariamente indisponível.", error);
  }
}
