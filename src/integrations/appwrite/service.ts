/**
 * Appwrite Service Layer
 * High-level methods for saving attendance data and uploading reports to Appwrite.
 */

import {
  getAppwriteConfig,
  isAppwriteConfigured,
  createDocument,
  uploadFile,
  checkAppwriteHealth,
} from "./client";

export type AppwriteSessionData = {
  sessionId: string;
  teacherName: string;
  crName: string;
  subjectName: string;
  className: string;
  startedAt: string;
  endedAt: string;
  totalPresent: number;
};

export type AppwriteRecordData = {
  sessionId: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  markedAt: string;
  status: string;
};

/**
 * Save an attendance session summary to Appwrite Database.
 */
export async function saveAttendanceSession(data: AppwriteSessionData): Promise<boolean> {
  if (!isAppwriteConfigured()) {
    console.info("[Appwrite] Not configured — session saved locally only.");
    return false;
  }

  const config = getAppwriteConfig();
  const result = await createDocument(
    config.databaseId,
    config.sessionsCollectionId,
    data.sessionId,
    {
      teacher_name: data.teacherName,
      cr_name: data.crName,
      subject_name: data.subjectName,
      class_name: data.className,
      started_at: data.startedAt,
      ended_at: data.endedAt,
      total_present: data.totalPresent,
    },
  );

  return result !== null;
}

/**
 * Save an attendance record to Appwrite Database.
 */
export async function saveAttendanceRecord(data: AppwriteRecordData): Promise<boolean> {
  if (!isAppwriteConfigured()) return false;

  const config = getAppwriteConfig();
  const docId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const result = await createDocument(config.databaseId, config.attendanceCollectionId, docId, {
    session_id: data.sessionId,
    student_id: data.studentId,
    student_name: data.studentName,
    roll_number: data.rollNumber,
    marked_at: data.markedAt,
    status: data.status,
  });

  return result !== null;
}

/**
 * Upload an attendance report file (Excel or Word) to Appwrite Storage.
 * Returns the download URL or null if upload failed.
 */
export async function uploadAttendanceReport(
  file: File,
  metadata?: { sessionId?: string | undefined; type?: string | undefined },
): Promise<string | null> {
  if (!isAppwriteConfigured()) {
    console.info("[Appwrite] Not configured — report saved to device only.");
    return null;
  }

  const config = getAppwriteConfig();
  const fileId = `report_${metadata?.sessionId || Date.now()}_${metadata?.type || "doc"}_${Math.random().toString(36).slice(2, 6)}`;

  const result = await uploadFile(config.storageBucketId, fileId, file);
  return result?.url ?? null;
}

/**
 * Get the current Appwrite connection status.
 */
export async function getAppwriteStatus(): Promise<{
  configured: boolean;
  connected: boolean;
}> {
  const configured = isAppwriteConfigured();
  if (!configured) return { configured: false, connected: false };
  const connected = await checkAppwriteHealth();
  return { configured, connected };
}
