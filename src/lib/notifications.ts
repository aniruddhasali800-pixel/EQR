/**
 * Notification System
 * Handles CR attendance update notifications to Teachers & Admins.
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

export function notifyTeacherFromCR(crName: string, studentName: string, subjectName: string, newStatus: string) {
  const notifications = getNotifications();
  const newNotif: AppNotification = {
    id: `notif_${Date.now()}`,
    senderName: crName,
    senderRole: "CR",
    title: "CR Attendance Update",
    message: `CR ${crName} changed attendance for ${studentName} to "${newStatus}" in ${subjectName}.`,
    createdAt: new Date().toISOString(),
    read: false,
  };

  notifications.unshift(newNotif);
  if (typeof window !== "undefined") {
    localStorage.setItem(NOTIF_KEY, JSON.stringify(notifications));
  }
  return newNotif;
}
