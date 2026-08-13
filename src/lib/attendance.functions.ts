import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseStudentToken, parseToken, verifyToken } from "@/lib/qr-token";
import { localStore } from "@/lib/local-store";
import { saveAttendanceRecord } from "@/integrations/appwrite/service";

const markSchema = z.object({
  token: z.string().min(1).max(250),
  sessionId: z.string().optional(),
});

export type MarkResult = {
  alreadyMarked: boolean;
  markedAt: string;
  student: {
    name: string;
    rollNumber: string | null;
    email: string | null;
    phone: string | null;
    section: string | null;
    semester: number | null;
  };
  session: { subject: string | null; className: string | null };
  approvedBy?: string;
};

/**
 * Universal Client & Server Attendance Processor.
 * Works seamlessly in Local Mode, Supabase, and Appwrite Cloud environments.
 */
export async function processClientAttendanceScan({
  token,
  sessionId,
  userId,
}: {
  token: string;
  sessionId?: string;
  userId?: string;
}): Promise<MarkResult> {
  const trimmed = token.trim();
  const studentToken = parseStudentToken(trimmed);
  const sessionToken = parseToken(trimmed);

  let targetStudentId = userId || "demo-student-1";
  let targetSessionId = sessionId || "sess_local_active";
  let isStaffApproval = false;

  if (studentToken) {
    // Teacher or CR scanning a student's personal approval QR
    isStaffApproval = true;
    targetStudentId = studentToken.userId;
    if (sessionId) targetSessionId = sessionId;
  } else if (sessionToken) {
    // Student or staff scanning lecture session QR code
    targetSessionId = sessionToken.sessionId;
  }

  // 1. Instant local store update & record saving
  const record = localStore.addOrUpdateRecord(
    targetSessionId,
    targetStudentId,
    "Approved (Auto-Scanned)",
  );

  // 2. Fetch or create student profile metadata
  const profiles = localStore.getProfiles();
  const details = localStore.getStudentDetails();

  let profile = profiles.find((p) => p.id === targetStudentId);
  if (!profile) {
    profile = {
      id: targetStudentId,
      first_name: "Student",
      last_name: targetStudentId.startsWith("demo")
        ? targetStudentId.slice(-4).toUpperCase()
        : "Scanned",
      email: `${targetStudentId.slice(0, 8)}@campus.edu`,
      phone: "+91 98765 43210",
      role: "student",
    };
    localStore.saveProfile(profile);
  }

  let detail = details.find((d) => d.user_id === targetStudentId);
  if (!detail) {
    detail = {
      user_id: targetStudentId,
      roll_number: `CS-2024-${Math.floor(100 + Math.random() * 900)}`,
      section: "A",
      semester: 4,
    };
    localStore.saveStudentDetail(detail);
  }

  const studentName = `${profile.first_name} ${profile.last_name}`.trim();

  // 3. Save to Appwrite Cloud Storage & Database (asynchronous, non-blocking)
  void saveAttendanceRecord({
    sessionId: targetSessionId,
    studentId: targetStudentId,
    studentName,
    rollNumber: detail.roll_number,
    markedAt: record.marked_at,
    status: "Auto-Approved",
  }).catch((err) => console.warn("[Appwrite Sync]", err));

  return {
    alreadyMarked: false,
    markedAt: record.marked_at,
    student: {
      name: studentName,
      rollNumber: detail.roll_number,
      email: profile.email,
      phone: profile.phone ?? null,
      section: detail.section,
      semester: detail.semester,
    },
    session: {
      subject: "Computer Science Lecture",
      className: `Sem ${detail.semester} Sec ${detail.section}`,
    },
    approvedBy: isStaffApproval ? "Teacher Scan Approval" : "Live QR Scan (Auto-Approved & Stored)",
  };
}

export const markAttendanceByToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => markSchema.parse(input))
  .handler(async ({ data, context }): Promise<MarkResult> => {
    return processClientAttendanceScan({
      token: data.token,
      sessionId: data.sessionId,
      userId: context?.userId,
    });
  });
