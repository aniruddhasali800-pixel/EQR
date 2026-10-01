/**
 * Supabase backend for the attendance store.
 *
 * This is the source of truth on any host whose filesystem is not durable. A serverless deploy
 * (Vercel) runs the Node server from a read-only code directory and gives every instance its own
 * throwaway /tmp, so a JSON file there can only ever be one instance's private cache — while the
 * entire purpose of this store is that the teacher's projector and thirty phones reach the same
 * record, and they are never routed to the same instance. See attendance-store.server.ts for how
 * a backend is chosen.
 *
 * The tables come from supabase/migrations/20260930090000_attendance_mirror_tables.sql, and every
 * query uses the service role key: RLS keeps those tables out of reach of the browser keys, so
 * a publishable key configured without a secret one cannot back the store.
 */

import type {
  AttendanceRecord,
  AttendanceSession,
  AttendanceSource,
  ClassRoster,
  RosterStudent,
  StudentMark,
} from "./attendance-types";
import type { MarkInput, NewSessionInput } from "./attendance-store.server";

export const SESSIONS_TABLE = "erp_attendance_sessions";
export const RECORDS_TABLE = "erp_attendance_records";
export const ROSTERS_TABLE = "erp_attendance_roster";

const MIGRATION = "supabase/migrations/20260930090000_attendance_mirror_tables.sql";

export function firstEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value && !value.includes("placeholder")) return value;
  }
  return undefined;
}

/**
 * Both halves are required. `anon`/`authenticated` have no grants on these tables at all, so a
 * publishable key here would fail every query in a way that looks like an app bug.
 */
export function supabaseSettings(): { url: string; key: string } | null {
  const url = firstEnv("SUPABASE_URL", "SUPABASE_PROJECT_URL", "VITE_SUPABASE_URL");
  const key = firstEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SECRET",
  );
  if (!url || !key) return null;
  return { url, key };
}

export function missingSupabaseEnv(): string {
  const url = firstEnv("SUPABASE_URL", "SUPABASE_PROJECT_URL", "VITE_SUPABASE_URL");
  return url
    ? "the server has SUPABASE_URL but no SUPABASE_SERVICE_ROLE_KEY"
    : "the server has no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY configured";
}

type QueryError = { message: string; code?: string; details?: string; hint?: string } | null;

type QueryResult = { data: unknown; error: QueryError; count: number | null };

type Builder = {
  select: (columns?: string, options?: { head?: boolean; count?: "exact" }) => Builder;
  insert: (values: Record<string, unknown>) => Builder;
  upsert: (
    values: Record<string, unknown>,
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) => Builder;
  update: (values: Record<string, unknown>) => Builder;
  eq: (column: string, value: unknown) => Builder;
  ilike: (column: string, pattern: string) => Builder;
  in: (column: string, values: readonly unknown[]) => Builder;
  order: (column: string, options?: { ascending?: boolean }) => Builder;
  limit: (count: number) => Builder;
  maybeSingle: () => Builder;
  then: <R>(onfulfilled: (value: QueryResult) => R | PromiseLike<R>) => Promise<R>;
};

type TableAccess = { from: (table: string) => Omit<Builder, "then"> };

let clientPromise: Promise<TableAccess | null> | undefined;

async function db(): Promise<TableAccess | null> {
  if (!supabaseSettings()) return null;
  if (!clientPromise) {
    clientPromise = import("@/integrations/supabase/client.server")
      .then((m) => m.supabaseAdmin as unknown as TableAccess)
      .catch((err: unknown) => {
        note("client", err instanceof Error ? err.message : String(err));
        return null;
      });
  }
  return clientPromise;
}

let lastFailure = "";

function note(where: string, message: string): void {
  lastFailure = `${where}: ${message}`;
  console.error(`[attendance store] supabase ${where}: ${message}`);
}

/** Turns a Postgres failure into something an operator can act on without reading logs. */
function explain(error: NonNullable<QueryError>): string {
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /erp_attendance_|does not exist|schema cache/i.test(error.message)
  ) {
    return `Supabase is configured but its attendance tables are missing. Apply ${MIGRATION} in the Supabase SQL editor.`;
  }
  if (error.code === "42501" || /permission denied/i.test(error.message)) {
    return `Supabase refused the query (${error.message}). The key in SUPABASE_SERVICE_ROLE_KEY must be the secret/service-role one.`;
  }
  return `Supabase query failed: ${error.message}`;
}

function fail(where: string, error: NonNullable<QueryError>): null {
  note(where, explain(error));
  return null;
}

// --- row shapes -------------------------------------------------------------

type SessionRow = {
  id: string;
  secret: string | null;
  class_section_id: string;
  class_name: string | null;
  subject_id: string | null;
  subject_name: string | null;
  subject_code: string | null;
  teacher_id: string;
  teacher_name: string;
  cr_name: string | null;
  is_active: boolean;
  started_at: string;
  ended_at: string | null;
};

type RecordRow = {
  session_id: string;
  student_id: string;
  student_name: string;
  roll_number: string | null;
  email: string | null;
  phone: string | null;
  marked_at: string;
  status: string;
  source: string;
};

type RosterRow = {
  class_section_id: string;
  students: RosterStudent[] | null;
  updated_at: string;
};

export function sessionRow(s: AttendanceSession): Record<string, unknown> {
  return {
    id: s.id,
    secret: s.secret,
    class_section_id: s.classSectionId,
    class_name: s.className,
    subject_id: s.subjectId,
    subject_name: s.subjectName,
    subject_code: s.subjectCode,
    teacher_id: s.teacherId,
    teacher_name: s.teacherName,
    cr_name: s.crName,
    is_active: s.isActive,
    started_at: s.startedAt,
    ended_at: s.endedAt,
  };
}

export function recordRow(r: AttendanceRecord): Record<string, unknown> {
  return {
    session_id: r.sessionId,
    student_id: r.studentId,
    student_name: r.studentName,
    roll_number: r.rollNumber,
    email: r.email,
    phone: r.phone,
    marked_at: r.markedAt,
    status: r.status,
    source: r.source,
  };
}

function toSession(row: SessionRow): AttendanceSession {
  return {
    id: row.id,
    secret: row.secret ?? "",
    classSectionId: row.class_section_id,
    className: row.class_name,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    subjectCode: row.subject_code,
    teacherId: row.teacher_id,
    teacherName: row.teacher_name,
    crName: row.cr_name,
    isActive: row.is_active,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

function toRecord(row: RecordRow): AttendanceRecord {
  return {
    sessionId: row.session_id,
    studentId: row.student_id,
    studentName: row.student_name,
    rollNumber: row.roll_number,
    email: row.email,
    phone: row.phone,
    markedAt: row.marked_at,
    status: row.status,
    source: (row.source === "teacher_scan" || row.source === "manual"
      ? row.source
      : "live_qr") as AttendanceSource,
  };
}

// --- health -----------------------------------------------------------------

export async function supabaseHealth(): Promise<{ ok: boolean; detail: string }> {
  const settings = supabaseSettings();
  if (!settings) return { ok: false, detail: missingSupabaseEnv() };
  const client = await db();
  if (!client) return { ok: false, detail: lastFailure || "could not create the Supabase client" };
  // A real GET, not a head-count: postgrest-js discards the body of a HEAD response, so a 404
  // from a missing table would arrive as "no error" and the store would declare itself healthy.
  const { error } = await client.from(SESSIONS_TABLE).select("id").limit(1);
  if (error) {
    const detail = explain(error);
    note("health check", detail);
    return { ok: false, detail };
  }
  const host = settings.url.replace(/^https?:\/\//, "").split("/")[0];
  return { ok: true, detail: `Attendance is stored in Supabase (${host}).` };
}

/** What went wrong the last time this backend refused a query, if anything. */
export function supabaseLastFailure(): string {
  return lastFailure;
}

// --- sessions ---------------------------------------------------------------

export async function openSession(input: NewSessionInput): Promise<AttendanceSession | null> {
  const client = await db();
  if (!client) return null;
  const startedAt = new Date().toISOString();
  const session: AttendanceSession = {
    id: crypto.randomUUID(),
    secret: randomHex(24),
    ...input,
    isActive: true,
    startedAt,
    endedAt: null,
  };

  // A teacher hosts one live session at a time; closing strays first keeps a reloaded or
  // abandoned tab from leaving an older QR accepting scans.
  const closed = await client
    .from(SESSIONS_TABLE)
    .update({ is_active: false, ended_at: startedAt })
    .eq("teacher_id", session.teacherId)
    .eq("is_active", true);
  if (closed.error) return fail("close previous sessions", closed.error);

  const inserted = await client.from(SESSIONS_TABLE).insert(sessionRow(session)).select().limit(1);
  if (inserted.error) return fail("open session", inserted.error);
  const rows = (inserted.data as SessionRow[]) ?? [];
  if (rows.length === 0) {
    note("open session", "the session row was not written");
    return null;
  }
  return toSession(rows[0]!);
}

export async function getSession(id: string): Promise<AttendanceSession | null> {
  const client = await db();
  if (!client) return null;
  const { data, error } = await client.from(SESSIONS_TABLE).select("*").eq("id", id).maybeSingle();
  if (error) return fail("get session", error);
  return data ? toSession(data as SessionRow) : null;
}

export async function getActiveSessionForTeacher(
  teacherId: string,
): Promise<AttendanceSession | null> {
  const client = await db();
  if (!client) return null;
  const { data, error } = await client
    .from(SESSIONS_TABLE)
    .select("*")
    .eq("teacher_id", teacherId)
    .eq("is_active", true)
    .order("started_at", { ascending: true })
    .limit(5);
  if (error) return fail("find active session", error);
  const rows = (data as SessionRow[]) ?? [];
  return rows.length > 0 ? toSession(rows[rows.length - 1]!) : null;
}

export async function listRecentSessions(
  teacherId: string | null,
  limit = 12,
): Promise<AttendanceSession[]> {
  const client = await db();
  if (!client) return [];
  let query = client.from(SESSIONS_TABLE).select("*").order("started_at", { ascending: false });
  if (teacherId) query = query.eq("teacher_id", teacherId);
  const { data, error } = await query.limit(Math.min(Math.max(limit, 1), 50));
  if (error) {
    fail("list sessions", error);
    return [];
  }
  return ((data as SessionRow[]) ?? []).map(toSession);
}

export async function endSession(
  sessionId: string,
  patch?: { crName?: string | null | undefined },
): Promise<AttendanceSession | null> {
  const client = await db();
  if (!client) return null;
  const values: Record<string, unknown> = { is_active: false, ended_at: new Date().toISOString() };
  if (patch?.crName !== undefined) values["cr_name"] = patch.crName;
  const { data, error } = await client
    .from(SESSIONS_TABLE)
    .update(values)
    .eq("id", sessionId)
    .select()
    .limit(1);
  if (error) return fail("end session", error);
  const rows = (data as SessionRow[]) ?? [];
  return rows.length > 0 ? toSession(rows[0]!) : null;
}

// --- records ----------------------------------------------------------------

export async function markRecord(
  input: MarkInput,
): Promise<{ record: AttendanceRecord; alreadyMarked: boolean } | null> {
  const client = await db();
  if (!client) return null;
  const record: AttendanceRecord = {
    sessionId: input.sessionId,
    studentId: input.studentId,
    studentName: input.studentName,
    rollNumber: input.rollNumber,
    email: input.email,
    phone: input.phone,
    status: input.status,
    source: input.source,
    markedAt: new Date().toISOString(),
  };

  // The (session_id, student_id) primary key is the dedupe: ignoring a duplicate rather than
  // overwriting it is what keeps the time of the first scan on the sheet.
  const { data, error } = await client
    .from(RECORDS_TABLE)
    .upsert(recordRow(record), { onConflict: "session_id,student_id", ignoreDuplicates: true })
    .select();
  if (error) return fail("mark attendance", error);
  const written = (data as RecordRow[]) ?? [];
  if (written.length > 0) return { record: toRecord(written[0]!), alreadyMarked: false };

  const existing = await getSessionRecord(input.sessionId, input.studentId);
  if (!existing) {
    fail("mark attendance", { message: "the record was neither written nor found" });
    return null;
  }
  return { record: existing, alreadyMarked: true };
}

async function getSessionRecord(
  sessionId: string,
  studentId: string,
): Promise<AttendanceRecord | null> {
  const client = await db();
  if (!client) return null;
  const { data, error } = await client
    .from(RECORDS_TABLE)
    .select("*")
    .eq("session_id", sessionId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) return fail("read existing mark", error);
  return data ? toRecord(data as RecordRow) : null;
}

export async function listRecords(sessionId: string): Promise<AttendanceRecord[]> {
  const client = await db();
  if (!client) return [];
  const { data, error } = await client
    .from(RECORDS_TABLE)
    .select("*")
    .eq("session_id", sessionId)
    .order("marked_at", { ascending: true });
  if (error) {
    fail("list records", error);
    return [];
  }
  return ((data as RecordRow[]) ?? []).map(toRecord);
}

/**
 * A student's own history. Marks made by roll number (teacher scan / manual entry) carry a
 * different id, so they are looked up separately and merged — otherwise a student approved by
 * their teacher would still see "not marked".
 */
export async function listMarksForStudent(
  studentId: string,
  rollNumber: string | null,
  limit = 12,
): Promise<StudentMark[]> {
  const client = await db();
  if (!client) return [];
  const byId = await client.from(RECORDS_TABLE).select("*").eq("student_id", studentId);
  if (byId.error) {
    fail("list student marks", byId.error);
    return [];
  }
  const rows = ((byId.data as RecordRow[]) ?? []).slice();

  const roll = rollNumber?.trim().toUpperCase() ?? "";
  // Wildcards are stripped so a typed roll can never widen the match to other students.
  if (roll && !/[%_*]/.test(roll)) {
    const byRoll = await client.from(RECORDS_TABLE).select("*").ilike("roll_number", roll);
    if (!byRoll.error) rows.push(...((byRoll.data as RecordRow[]) ?? []).slice());
  }

  const unique = new Map<string, RecordRow>();
  for (const row of rows) unique.set(`${row.session_id}|${row.student_id}`, row);
  const mine = [...unique.values()]
    .sort((a, b) => (a.marked_at < b.marked_at ? 1 : -1))
    .slice(0, Math.min(Math.max(limit, 1), 50));
  if (mine.length === 0) return [];

  const sessionIds = [...new Set(mine.map((row) => row.session_id))];
  const sessions = await client.from(SESSIONS_TABLE).select("*").in("id", sessionIds);
  const bySession = new Map<string, SessionRow>(
    (sessions.error ? [] : ((sessions.data as SessionRow[]) ?? [])).map((row) => [row.id, row]),
  );

  return mine.map((row) => {
    const session = bySession.get(row.session_id);
    return {
      sessionId: row.session_id,
      markedAt: row.marked_at,
      status: row.status,
      source: toRecord(row).source,
      subjectName: session?.subject_name ?? null,
      className: session?.class_name ?? null,
      startedAt: session?.started_at ?? row.marked_at,
      sessionActive: session?.is_active ?? false,
    };
  });
}

export async function countPresent(sessionId: string): Promise<number> {
  const client = await db();
  if (!client) return 0;
  const { count, error } = await client
    .from(RECORDS_TABLE)
    .select("student_id", { head: true, count: "exact" })
    .eq("session_id", sessionId);
  if (error) {
    fail("count present", error);
    return 0;
  }
  return count ?? 0;
}

// --- rosters ----------------------------------------------------------------

export async function getRoster(classSectionId: string): Promise<ClassRoster | null> {
  const client = await db();
  if (!client) return null;
  const { data, error } = await client
    .from(ROSTERS_TABLE)
    .select("*")
    .eq("class_section_id", classSectionId)
    .maybeSingle();
  if (error) return fail("get roster", error);
  if (!data) return null;
  const row = data as RosterRow;
  return {
    classSectionId: row.class_section_id,
    students: Array.isArray(row.students) ? row.students : [],
    updatedAt: row.updated_at,
  };
}

export async function saveRoster(
  classSectionId: string,
  students: RosterStudent[],
): Promise<ClassRoster | null> {
  const client = await db();
  if (!client) return null;
  const roster: ClassRoster = { classSectionId, students, updatedAt: new Date().toISOString() };
  const { data, error } = await client
    .from(ROSTERS_TABLE)
    .upsert(
      {
        class_section_id: classSectionId,
        students: students as unknown as Record<string, unknown>[],
        updated_at: roster.updatedAt,
      },
      { onConflict: "class_section_id" },
    )
    .select()
    .limit(1);
  if (error) return fail("save roster", error);
  const rows = (data as RosterRow[]) ?? [];
  if (rows.length === 0) {
    fail("save roster", { message: "the roster row was not written" });
    return null;
  }
  return roster;
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
