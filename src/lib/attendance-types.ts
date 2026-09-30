/**
 * Shared attendance shapes. Imported by client bundles, so this module must stay
 * free of any server-only code (no fs, no service role keys).
 */

export type AttendanceSource = "live_qr" | "teacher_scan" | "manual";

export type AttendanceRecord = {
  sessionId: string;
  studentId: string;
  studentName: string;
  rollNumber: string | null;
  email: string | null;
  phone: string | null;
  markedAt: string;
  status: string;
  source: AttendanceSource;
};

export type AttendanceSession = {
  id: string;
  /** HMAC key for the rotating QR. Never leaves the server except to the hosting teacher. */
  secret: string;
  classSectionId: string;
  className: string | null;
  subjectId: string | null;
  subjectName: string | null;
  subjectCode: string | null;
  teacherId: string;
  teacherName: string;
  crName: string | null;
  isActive: boolean;
  startedAt: string;
  endedAt: string | null;
};

export type RosterStudent = {
  studentId: string;
  name: string;
  rollNumber: string | null;
  email: string | null;
  phone: string | null;
};

export type ClassRoster = {
  classSectionId: string;
  students: RosterStudent[];
  updatedAt: string;
};

/** One entry of a student's own attendance history, joined with the session it belongs to. */
export type StudentMark = {
  sessionId: string;
  markedAt: string;
  status: string;
  source: AttendanceSource;
  subjectName: string | null;
  className: string | null;
  startedAt: string;
  sessionActive: boolean;
};

/** One row of the final report: every enrolled student, present or absent. */
export type ReportRow = {
  name: string;
  roll: string;
  email: string;
  phone: string;
  markedAt: string | null;
  status: "Present" | "Absent";
};

export type MarkOutcome =
  | {
      ok: true;
      alreadyMarked: boolean;
      record: AttendanceRecord;
      totalPresent: number;
    }
  | {
      ok: false;
      code:
        | "invalid_token"
        | "expired_token"
        | "unknown_session"
        | "session_ended"
        | "missing_identity"
        | "storage_error";
      reason: string;
    };
