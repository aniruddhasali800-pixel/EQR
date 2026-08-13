import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseStudentToken, parseToken } from "@/lib/qr-token";
import { localStore } from "@/lib/local-store";
import { saveAttendanceRecord } from "@/integrations/appwrite/service";
import { supabase } from "@/integrations/supabase/client";

const markSchema = z.object({
  token: z.string().min(1).max(500),
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
 * Clean sanitization helper for converting raw scanned tokens into readable names/IDs.
 */
function sanitizeIdentifier(raw: string): string {
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);
}

/**
 * Universal Client & Server Attendance Processor.
 * Detects student identity automatically from scanned QR codes, barcodes, or text,
 * saves to localStore, Supabase, and Appwrite cloud storage.
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

  // Automatically detect active session if not provided
  const activeSessions = localStore.getSessions().filter((s) => s.is_active);
  const activeSession = activeSessions[activeSessions.length - 1];

  let targetSessionId = sessionId || activeSession?.id || "sess_local_active";
  let targetStudentId = "";
  let isStaffApproval = false;

  if (studentToken) {
    // Teacher or CR scanning a student's personal approval QR code
    isStaffApproval = true;
    targetStudentId = studentToken.userId;
    if (sessionId) {
      targetSessionId = sessionId;
    } else if (activeSession) {
      targetSessionId = activeSession.id;
    }
  } else if (sessionToken) {
    // Student scanning a live lecture QR code
    targetSessionId = sessionToken.sessionId;
    targetStudentId = userId || `student_${Date.now()}`;
  } else {
    // Arbitrary text, student ID, roll number, or custom barcode scanned by camera
    const cleanTag = sanitizeIdentifier(trimmed);
    targetStudentId = cleanTag ? `stu_${cleanTag}` : userId || `student_${Date.now()}`;
    if (activeSession) {
      targetSessionId = activeSession.id;
    }
  }

  // 1. Instant local store record saving
  const record = localStore.addOrUpdateRecord(
    targetSessionId,
    targetStudentId,
    "Approved (Auto-Scanned)",
  );

  // Also bind to active session ID if different
  if (activeSession && activeSession.id !== targetSessionId) {
    localStore.addOrUpdateRecord(activeSession.id, targetStudentId, "Approved (Auto-Scanned)");
  }

  // Also bind to sess_local_active for universal fallback visibility
  if (targetSessionId !== "sess_local_active") {
    localStore.addOrUpdateRecord("sess_local_active", targetStudentId, "Approved (Auto-Scanned)");
  }

  // 2. Resolve or automatically build student profile metadata
  const profiles = localStore.getProfiles();
  const details = localStore.getStudentDetails();

  let profile = profiles.find((p) => p.id === targetStudentId);
  if (!profile) {
    const rawClean = trimmed.replace(/^CERP_STUDENT\||^CERP1\|/, "").trim();
    const isName = rawClean.includes(" ") && !rawClean.includes("|");
    const firstName = isName ? rawClean.split(" ")[0]! : "Student";
    const lastName = isName
      ? rawClean.split(" ").slice(1).join(" ")
      : sanitizeIdentifier(rawClean) || "Scanned";

    profile = {
      id: targetStudentId,
      first_name: firstName,
      last_name: lastName,
      email: `${sanitizeIdentifier(rawClean).toLowerCase() || "student"}@campus.edu`,
      phone: "+91 98765 43210",
      role: "student",
    };
    localStore.saveProfile(profile);
  }

  let detail = details.find((d) => d.user_id === targetStudentId);
  if (!detail) {
    const rawClean = trimmed.replace(/^CERP_STUDENT\||^CERP1\|/, "").trim();
    detail = {
      user_id: targetStudentId,
      roll_number:
        rawClean.length < 20 && /^[a-zA-Z0-9-]+$/.test(rawClean)
          ? rawClean.toUpperCase()
          : `CS-2024-${Math.floor(100 + Math.random() * 900)}`,
      section: "A",
      semester: 4,
    };
    localStore.saveStudentDetail(detail);
  }

  const studentName = `${profile.first_name} ${profile.last_name}`.trim();

  // 3. Save to Supabase (best-effort, non-blocking)
  try {
    void supabase.from("attendance_records").insert({
      session_id: targetSessionId,
      student_id: targetStudentId,
      status: "approved",
    });
  } catch {
    // Offline fallback
  }

  // 4. Save to Appwrite Cloud Storage & Database (asynchronous, non-blocking)
  void saveAttendanceRecord({
    sessionId: targetSessionId,
    studentId: targetStudentId,
    studentName,
    rollNumber: detail.roll_number,
    markedAt: record.marked_at,
    status: "Auto-Approved",
  }).catch((err) => console.warn("[Appwrite Sync]", err));

  // 5. Notify all open UI tabs/components to update present student lists instantly
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("cerp_attendance_updated", {
        detail: { sessionId: targetSessionId, studentId: targetStudentId },
      }),
    );
  }

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
