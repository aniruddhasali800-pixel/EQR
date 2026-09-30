/**
 * Notification System
 * Handles Exam broadcasts and Unit Test announcements.
 */

export type AppNotification = {
  id: string;
  recipientRole?: string;
  recipientId?: string;
  senderName: string;
  senderRole: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

const NOTIF_KEY = "cerp_notifications";

export function getNotifications(): AppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function broadcastExamNotification(
  title: string,
  message: string,
  senderName = "Admin / Faculty",
) {
  const notifications = getNotifications();
  const newNotif: AppNotification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    senderName,
    senderRole: "Admin / Faculty",
    title,
    message,
    createdAt: new Date().toISOString(),
    read: false,
  };

  notifications.unshift(newNotif);
  if (typeof window !== "undefined") {
    localStorage.setItem(NOTIF_KEY, JSON.stringify(notifications));
  }
  return newNotif;
}
