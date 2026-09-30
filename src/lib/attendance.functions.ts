/**
 * Attendance server functions.
 *
 * These run on the Node server, so a student scanning on a phone and a teacher watching the
 * projector read and write the same store. The previous implementation ran entirely in the
 * scanning browser's localStorage, which is why a successful scan never reached the teacher's
 * attendance sheet.
 *
 * Server-only modules are imported dynamically: this file ships to the browser bundle, and a
 * top-level import of `attendance-store.server.ts` would drag `node:fs` into the client.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseStudentToken, verifyToken } from "@/lib/qr-token";
import { APP_BUILD_ID } from "@/lib/build-info";
import type {
  AttendanceRecord,
  AttendanceSession,
  AttendanceSource,
  ClassRoster,
  MarkOutcome,
  ReportRow,
  RosterStudent,
  StudentMark,
} from "./attendance-types";

const store = () => import("@/lib/attendance-store.server");

const studentInput = {
  studentId: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  rollNumber: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().max(160).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
};

/** What the scanner knows about the person being marked. Everything is optional because a
 *  teacher scanning a roll-number slip often only has the roll; the server fills the rest. */
const scannedIdentity = z.object({
  id: z.string().trim().max(120).optional(),
  name: z.string().trim().max(120).optional(),
  rollNumber: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().max(160).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});

type Identity = z.infer<typeof scannedIdentity>;

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Turns arbitrary scanned text (roll number, PRN, barcode) into a stable identifier. */
function rollIdentity(raw: string): { id: string; rollNumber: string; guessedName: string } {
  const cleaned = raw
    .trim()
    .replace(/^CERP_STUDENT\|/i, "")
    .replace(/^CERP1\|/i, "")
    .replace(/[^A-Za-z0-9/_-]+/g, " ")
    .trim();
  const upper = cleaned.toUpperCase().replace(/\s+/g, " ");
  const looksLikeName = /[A-Za-z]/.test(cleaned) && cleaned.includes(" ") && !/\d/.test(cleaned);
  return {
    id: `roll:${upper.replace(/\s+/g, "-")}`,
    rollNumber: upper,
    guessedName: looksLikeName ? titleCase(cleaned) : "",
  };
}

export const openAttendanceSession = createServerFn({ method: "POST" })
  .validator(
    z.object({
      classSectionId: z.string().trim().min(1).max(120),
      className: z.string().trim().max(160).nullable().optional(),
      subjectId: z.string().trim().max(120).nullable().optional(),
      subjectName: z.string().trim().max(160).nullable().optional(),
      subjectCode: z.string().trim().max(60).nullable().optional(),
      teacherId: z.string().trim().min(1).max(120),
      teacherName: z.string().trim().min(1).max(160),
      crName: z.string().trim().max(160).nullable().optional(),
    }),
  )
  .handler(async ({ data }): Promise<AttendanceSession | null> => {
    return store().then((s) =>
      s.openSession({
        classSectionId: data.classSectionId,
        className: data.className ?? null,
        subjectId: data.subjectId ?? null,
        subjectName: data.subjectName ?? null,
        subjectCode: data.subjectCode ?? null,
        teacherId: data.teacherId,
        teacherName: data.teacherName,
        crName: data.crName ?? null,
      }),
    );
  });

/** Lets a teacher reload the page mid-lecture without orphaning the live QR session. */
export const getActiveSessionForTeacher = createServerFn({ method: "POST" })
  .validator(z.object({ teacherId: z.string().trim().min(1).max(120) }))
  .handler(async ({ data }): Promise<AttendanceSession | null> => {
    const s = await store();
    const session = await s.getActiveSessionForTeacher(data.teacherId);
    return session;
  });

/**
 * Whether the server still accepts scans for this exact session, plus the server's build id: a
 * tab opened before a deploy has no other way to notice, and on the teacher's projector that
 * means a QR every student in the room fails to mark.
 */
export const getSessionStatus = createServerFn({ method: "POST" })
  .validator(z.object({ sessionId: z.string().trim().min(1).max(120) }))
  .handler(async ({ data }): Promise<{ exists: boolean; isActive: boolean; buildId: string }> => {
    const s = await store();
    const session = await s.getSession(data.sessionId);
    return {
      exists: Boolean(session),
      isActive: session?.isActive ?? false,
      buildId: APP_BUILD_ID,
    };
  });

/** Only this teacher's own sessions, so a shared server does not expose other classes. */
export const listRecentSessions = createServerFn({ method: "POST" })
  .validator(
    z.object({
      teacherId: z.string().trim().min(1).max(120),
      limit: z.number().int().min(1).max(50).optional(),
    }),
  )
  .handler(async ({ data }): Promise<AttendanceSession[]> => {
    const s = await store();
    return s.listRecentSessions(data.teacherId, data.limit ?? 12);
  });

export const markAttendance = createServerFn({ method: "POST" })
  .validator(
    z.object({
      /** Raw QR payload. Omitted for manual entry, where sessionId must be supplied. */
      token: z.string().trim().min(1).max(500).optional(),
      sessionId: z.string().trim().min(1).max(120).optional(),
      student: scannedIdentity.default({}),
      /**
       * `teacher_scan` and `manual` are how a teacher approves a student whose code could not
       * be read; they skip the rotating-signature check but still require a live session.
       */
      source: z.enum(["live_qr", "teacher_scan", "manual"]).default("live_qr"),
    }),
  )
  .handler(async ({ data }): Promise<MarkOutcome> => {
    const s = await store();
    const token = data.token?.trim() ?? "";
    const studentToken = token ? parseStudentToken(token) : null;
    const sessionHint = token ? extractSessionId(token) : null;
    const source: AttendanceSource = studentToken ? "teacher_scan" : data.source;

    // A rotating lecture QR only counts once its signature checks out against that session's
    // secret — this is what stops a photographed or stale screen from marking attendance.
    let sessionId = sessionHint ?? data.sessionId?.trim() ?? "";
    if (source === "live_qr") {
      if (!sessionHint)
        return failure("invalid_token", "This is not a Campus ERP attendance QR code.");
      const signalled = await s.getSession(sessionHint);
      if (!signalled) return unknownSession(sessionHint);
      const verification = await verifyToken(signalled.secret, token);
      if (!verification.ok) {
        return failure(
          verification.code === "expired" ? "expired_token" : "invalid_token",
          verification.reason,
        );
      }
      sessionId = verification.sessionId;
    }

    if (!sessionId) {
      return failure(
        "invalid_token",
        "No live session on this device — start the QR session before approving manually.",
      );
    }

    const session = await s.getSession(sessionId);
    if (!session) return unknownSession(sessionId);
    if (!session.isActive) {
      return failure(
        "session_ended",
        "The teacher already stopped this session, so it can no longer accept scans.",
      );
    }

    let identity: RosterStudent = {
      studentId: data.student.id ?? "",
      name: data.student.name ?? "",
      rollNumber: data.student.rollNumber ?? null,
      email: data.student.email ?? null,
      phone: data.student.phone ?? null,
    };

    if (source === "live_qr") {
      if (!identity.studentId || !identity.name) {
        return failure(
          "missing_identity",
          "Sign in first — the scan needs your account to know whose attendance this is.",
        );
      }
    } else if (studentToken) {
      // A personal code names the student it belongs to. The scanner's own profile must not
      // leak into the row, or a teacher approval would print the teacher's name on the sheet.
      const isSelf = studentToken.userId === identity.studentId;
      identity = {
        studentId: studentToken.userId,
        name: isSelf ? identity.name : "",
        rollNumber: isSelf ? identity.rollNumber : null,
        email: isSelf ? identity.email : null,
        phone: isSelf ? identity.phone : null,
      };
    } else if (sessionHint !== null) {
      // The rotating class QR proves the lecture is live but identifies no student, so it can
      // only ever mark the person who scanned it — a teacher's own name, or a roll number built
      // out of the session id. Approval needs a code that names somebody.
      return failure(
        "missing_identity",
        "That is the class QR, which names no student. Scan the student's own code or type their roll number.",
      );
    } else {
      // Typed or scanned roll number / PRN / barcode: make a stable id so repeats stay idempotent.
      const typed = token || identity.rollNumber || "";
      if (!typed && !(identity.studentId && identity.name)) {
        return failure(
          "missing_identity",
          "Scan the student's personal code or type their roll number first.",
        );
      }
      const rolled = rollIdentity(typed);
      identity = {
        studentId: identity.studentId || rolled.id,
        name: identity.name || rolled.guessedName,
        rollNumber: identity.rollNumber || rolled.rollNumber,
        email: identity.email,
        phone: identity.phone,
      };
    }

    // Teacher approvals and manual entries often carry only a roll, so complete the identity
    // from the class roster before writing the row the report will use.
    const roster = await s.getRoster(session.classSectionId);
    const match = roster?.students.find(
      (student) =>
        (!identity.rollNumber && student.studentId === identity.studentId) ||
        (identity.rollNumber &&
          student.rollNumber?.toUpperCase() === identity.rollNumber.toUpperCase()),
    );
    if (match) {
      identity = {
        studentId: match.studentId,
        name: identity.name || match.name,
        rollNumber: identity.rollNumber || match.rollNumber || null,
        email: identity.email ?? match.email ?? null,
        phone: identity.phone ?? match.phone ?? null,
      };
    }
    if (!identity.name) {
      identity = {
        ...identity,
        name: identity.rollNumber ? `Student ${identity.rollNumber}` : "Scanned student",
      };
    }

    const result = await s.markRecord({
      sessionId,
      studentId: identity.studentId,
      studentName: identity.name,
      rollNumber: identity.rollNumber,
      email: identity.email,
      phone: identity.phone,
      status: source === "live_qr" ? "Present" : "Approved",
      source,
    });

    if (!result) {
      return failure(
        "storage_error",
        "The attendance record could not be written to the server. Try again.",
      );
    }

    const totalPresent = await s.countPresent(sessionId);
    return {
      ok: true,
      alreadyMarked: result.alreadyMarked,
      record: result.record,
      totalPresent,
    };
  });

function unknownSession(sessionId = ""): MarkOutcome {
  // `sess_<epoch ms>` was the id format of the build that kept sessions in the teacher's own
  // browser. A QR carrying it can never match a server session, and the person scanning it
  // cannot fix that — the stale device has to reload, so say so instead of a dead end.
  if (/^sess_\d{10,}/i.test(sessionId)) {
    return failure(
      "unknown_session",
      "That QR was drawn by an out-of-date copy of the app that kept the session on the teacher's own device. Reload the teacher's screen — a hard refresh, or close and reopen the installed app — start the session again, then scan.",
    );
  }
  return failure(
    "unknown_session",
    "This attendance session is not on the server. Start it again from the teacher's device.",
  );
}

function failure(
  code:
    | "invalid_token"
    | "unknown_session"
    | "session_ended"
    | "missing_identity"
    | "storage_error"
    | "expired_token",
  reason: string,
): MarkOutcome {
  return { ok: false, code, reason };
}

/** A token whose signature failed still names the session, so we can look up its secret. */
function extractSessionId(token: string): string | null {
  const parts = token.split("|");
  return parts.length === 4 && parts[0] === "CERP1" ? (parts[1] ?? null) : null;
}

export const listAttendance = createServerFn({ method: "POST" })
  .validator(z.object({ sessionId: z.string().trim().min(1).max(120) }))
  .handler(async ({ data }): Promise<AttendanceRecord[]> => {
    const s = await store();
    return s.listRecords(data.sessionId);
  });

/** Lets a student confirm their own mark actually reached the server. */
export const listStudentMarks = createServerFn({ method: "POST" })
  .validator(
    z.object({
      studentId: z.string().trim().min(1).max(120),
      rollNumber: z.string().trim().max(60).nullable().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
  )
  .handler(async ({ data }): Promise<StudentMark[]> => {
    const s = await store();
    return s.listMarksForStudent(data.studentId, data.rollNumber ?? null, data.limit ?? 12);
  });

export const endAttendanceSession = createServerFn({ method: "POST" })
  .validator(
    z.object({
      sessionId: z.string().trim().min(1).max(120),
      crName: z.string().trim().max(160).nullable().optional(),
    }),
  )
  .handler(async ({ data }): Promise<AttendanceSession | null> => {
    const s = await store();
    return s.endSession(data.sessionId, { crName: data.crName ?? null });
  });

export const saveClassRoster = createServerFn({ method: "POST" })
  .validator(
    z.object({
      classSectionId: z.string().trim().min(1).max(120),
      students: z.array(z.object(studentInput)).max(500),
    }),
  )
  .handler(async ({ data }): Promise<ClassRoster | null> => {
    const s = await store();
    return s.saveRoster(
      data.classSectionId,
      data.students.map((student) => ({
        studentId: student.studentId,
        name: student.name,
        rollNumber: student.rollNumber ?? null,
        email: student.email ?? null,
        phone: student.phone ?? null,
      })),
    );
  });

export const getClassRoster = createServerFn({ method: "POST" })
  .validator(z.object({ classSectionId: z.string().trim().min(1).max(120) }))
  .handler(async ({ data }): Promise<ClassRoster | null> => {
    const s = await store();
    return s.getRoster(data.classSectionId);
  });

export type AttendanceReport = {
  session: AttendanceSession;
  rows: ReportRow[];
  presentCount: number;
  absentCount: number;
  totalCount: number;
};

/**
 * Assembles the document: every rostered student as Present/Absent plus anyone who scanned
 * but was not on the roster. Always read fresh so a report never reflects a stale cache.
 */
export const buildAttendanceReport = createServerFn({ method: "POST" })
  .validator(z.object({ sessionId: z.string().trim().min(1).max(120) }))
  .handler(async ({ data }): Promise<AttendanceReport | null> => {
    const s = await store();
    const session = await s.getSession(data.sessionId);
    if (!session) return null;
    const [records, roster] = await Promise.all([
      s.listRecords(data.sessionId),
      s.getRoster(session.classSectionId),
    ]);
    const rows = s.buildReportRows(roster?.students ?? [], records);
    const presentCount = rows.filter((row) => row.status === "Present").length;
    return {
      session,
      rows,
      presentCount,
      absentCount: rows.length - presentCount,
      totalCount: rows.length,
    };
  });
