/**
 * Attendance store — the app's source of truth for live QR sessions.
 *
 * Reads and writes go through server functions, so a student marking attendance on their phone
 * and the teacher watching the projector hit the same record. A browser-only store
 * (localStorage) could never do that: each device would only ever see its own scans.
 *
 * Two backends, chosen once per process and reported by `storeHealth()`:
 *  - Supabase (`erp_attendance_*`, see attendance-db.server.ts) whenever the server has the
 *    credentials and the tables answer. This is the only backend that works on a serverless
 *    host — Vercel runs the Node server from a read-only directory and gives every instance its
 *    own ephemeral disk, so two devices are never guaranteed to see the same file.
 *  - A JSON file under DATA_DIR otherwise: written atomically and serialized through one queue
 *    so concurrent scans cannot interleave. That is the Docker/Node deployment.
 * When neither is available the store says so and refuses to open a session, because a projected
 * QR that cannot record anything is far worse than a red banner on the teacher's screen.
 */

import { accessSync, constants, mkdirSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type {
  AttendanceRecord,
  AttendanceSession,
  ClassRoster,
  ReportRow,
  RosterStudent,
  StudentMark,
} from "./attendance-types";
import * as db from "./attendance-db.server";
import { mirrorRecord, mirrorRoster, mirrorSession } from "./supabase-mirror.server";

export type NewSessionInput = {
  classSectionId: string;
  className: string | null;
  subjectId: string | null;
  subjectName: string | null;
  subjectCode: string | null;
  teacherId: string;
  teacherName: string;
  crName: string | null;
};

export type MarkInput = {
  sessionId: string;
  studentId: string;
  studentName: string;
  rollNumber: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  source: AttendanceRecord["source"];
};

export type Backend = "supabase" | "file" | "none";

export type StoreHealth = { backend: Backend; detail: string };

// --- backend selection ------------------------------------------------------

function dataFile(): string {
  const dir = process.env["DATA_DIR"] || resolve(process.cwd(), ".data");
  return resolve(dir, "attendance.json");
}

/** Whether this process can actually keep a file here, checked before the first scan. */
function probeFileStore(): { ok: boolean; error: string } {
  const dir = dirname(dataFile());
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    return { ok: true, error: "" };
  } catch (err) {
    const code = (err as { code?: string }).code;
    return { ok: false, error: code ?? String(err) };
  }
}

const MIGRATION = "supabase/migrations/20260930090000_attendance_mirror_tables.sql";

async function decide(): Promise<StoreHealth> {
  const configured = db.supabaseSettings() !== null;
  let supabaseDetail = "";

  if (configured) {
    const health = await db.supabaseHealth();
    if (health.ok) return { backend: "supabase", detail: health.detail };
    supabaseDetail = health.detail;
    console.error(`[attendance store] Supabase configured but unusable: ${health.detail}`);
  }

  const probe = probeFileStore();
  if (probe.ok) {
    return {
      backend: "file",
      detail: configured
        ? `Attendance is stored in ${dataFile()}, not in Supabase — ${supabaseDetail}`
        : `Attendance is stored in ${dataFile()}.`,
    };
  }

  const disk = `the server cannot write ${dataFile()} (${probe.error})`;
  return {
    backend: "none",
    detail: configured
      ? `Attendance cannot be recorded. ${supabaseDetail}, and ${disk}. Serverless hosts ship a read-only disk, so the database is the only store.`
      : `Attendance cannot be recorded: ${db.missingSupabaseEnv()}, and ${disk}. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to the server and apply ${MIGRATION}, or run the Docker image, which mounts a writable /data volume.`,
  };
}

let current: Promise<StoreHealth> | null = null;

/** Decided once and reused, so a flaky database cannot move a live lecture between two stores. */
export function storeHealth(): Promise<StoreHealth> {
  current ??= decide();
  return current;
}

async function usingSupabase(): Promise<boolean> {
  return (await storeHealth()).backend === "supabase";
}

// --- the Supabase-backed store ---------------------------------------------

export async function openSession(input: NewSessionInput): Promise<AttendanceSession | null> {
  if (await usingSupabase()) return db.openSession(input);
  return fileOpenSession(input);
}

export async function getSession(id: string): Promise<AttendanceSession | null> {
  if (await usingSupabase()) return db.getSession(id);
  const current = await load();
  return current.sessions.find((s) => s.id === id) ?? null;
}

export async function getActiveSessionForTeacher(
  teacherId: string,
): Promise<AttendanceSession | null> {
  if (await usingSupabase()) return db.getActiveSessionForTeacher(teacherId);
  const current = await load();
  const active = current.sessions.filter((s) => s.teacherId === teacherId && s.isActive);
  return active.length > 0 ? active[active.length - 1]! : null;
}

export async function listRecentSessions(
  teacherId: string | null,
  limit = 12,
): Promise<AttendanceSession[]> {
  if (await usingSupabase()) return db.listRecentSessions(teacherId, limit);
  const current = await load();
  return current.sessions
    .filter((s) => !teacherId || s.teacherId === teacherId)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, limit);
}

export async function endSession(
  sessionId: string,
  patch?: { crName?: string | null | undefined },
): Promise<AttendanceSession | null> {
  if (await usingSupabase()) return db.endSession(sessionId, patch);
  const endedAt = new Date().toISOString();
  const ended = await mutate((draft) => {
    const session = draft.findSession(sessionId);
    if (!session) return null;
    session.isActive = false;
    session.endedAt = endedAt;
    if (patch?.crName !== undefined) session.crName = patch.crName;
    return { ...session };
  });
  if (!ended) return null;
  void mirrorSession(db.sessionRow(ended));
  return ended;
}

export async function markRecord(
  input: MarkInput,
): Promise<{ record: AttendanceRecord; alreadyMarked: boolean } | null> {
  if (await usingSupabase()) return db.markRecord(input);
  const existing = await load();
  const prior = existing.records.find(
    (r) => r.sessionId === input.sessionId && r.studentId === input.studentId,
  );
  // Idempotent: a second scan keeps the first marked time so the sheet shows when they arrived.
  const record: AttendanceRecord = {
    sessionId: input.sessionId,
    studentId: input.studentId,
    studentName: input.studentName,
    rollNumber: input.rollNumber,
    email: input.email,
    phone: input.phone,
    status: input.status,
    source: input.source,
    markedAt: prior?.markedAt ?? new Date().toISOString(),
  };
  const saved = await mutate((draft) => draft.upsertRecord(record));
  if (saved === null) return null;
  void mirrorRecord(db.recordRow(record));
  return { record, alreadyMarked: Boolean(prior) };
}

export async function listRecords(sessionId: string): Promise<AttendanceRecord[]> {
  if (await usingSupabase()) return db.listRecords(sessionId);
  const current = await load();
  return current.records
    .filter((r) => r.sessionId === sessionId)
    .sort((a, b) => (a.markedAt < b.markedAt ? -1 : 1));
}

/**
 * A student's own history. Marks made by roll number (teacher scan / manual entry) are matched
 * too, otherwise a student approved by their teacher would still see "not marked".
 */
export async function listMarksForStudent(
  studentId: string,
  rollNumber: string | null,
  limit = 12,
): Promise<StudentMark[]> {
  if (await usingSupabase()) return db.listMarksForStudent(studentId, rollNumber, limit);
  const current = await load();
  const sessions = new Map(current.sessions.map((session) => [session.id, session]));
  const roll = rollNumber?.toUpperCase() ?? null;
  return current.records
    .filter(
      (record) =>
        record.studentId === studentId ||
        (roll !== null && record.rollNumber?.toUpperCase() === roll),
    )
    .sort((a, b) => (a.markedAt < b.markedAt ? 1 : -1))
    .slice(0, limit)
    .map((record) => {
      const session = sessions.get(record.sessionId);
      return {
        sessionId: record.sessionId,
        markedAt: record.markedAt,
        status: record.status,
        source: record.source,
        subjectName: session?.subjectName ?? null,
        className: session?.className ?? null,
        startedAt: session?.startedAt ?? record.markedAt,
        sessionActive: session?.isActive ?? false,
      };
    });
}

export async function countPresent(sessionId: string): Promise<number> {
  if (await usingSupabase()) return db.countPresent(sessionId);
  const current = await load();
  return current.records.filter((r) => r.sessionId === sessionId).length;
}

export async function getRoster(classSectionId: string): Promise<ClassRoster | null> {
  if (await usingSupabase()) return db.getRoster(classSectionId);
  const current = await load();
  return current.rosters.find((r) => r.classSectionId === classSectionId) ?? null;
}

export async function saveRoster(
  classSectionId: string,
  students: RosterStudent[],
): Promise<ClassRoster | null> {
  if (await usingSupabase()) return db.saveRoster(classSectionId, students);
  const roster: ClassRoster = {
    classSectionId,
    students,
    updatedAt: new Date().toISOString(),
  };
  const saved = await mutate((draft) => {
    const index = draft.snapshot.rosters.findIndex((r) => r.classSectionId === classSectionId);
    if (index >= 0) draft.snapshot.rosters[index] = roster;
    else draft.snapshot.rosters.push(roster);
    return true;
  });
  if (saved === null) return null;
  void mirrorRoster({
    class_section_id: classSectionId,
    students: students,
    updated_at: roster.updatedAt,
  });
  return roster;
}

// --- the file-backed store --------------------------------------------------

type Snapshot = {
  sessions: AttendanceSession[];
  records: AttendanceRecord[];
  rosters: ClassRoster[];
};

let snapshot: Snapshot | null = null;
let opChain: Promise<unknown> = Promise.resolve();

async function load(): Promise<Snapshot> {
  if (snapshot) return snapshot;
  try {
    const raw = await readFile(dataFile(), "utf8");
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    snapshot = {
      sessions: parsed.sessions ?? [],
      records: parsed.records ?? [],
      rosters: parsed.rosters ?? [],
    };
  } catch {
    // Missing or corrupt file means an empty store, not a crash: the first write recreates it.
    snapshot = { sessions: [], records: [], rosters: [] };
  }
  return snapshot;
}

let writeChain: Promise<void> = Promise.resolve();

async function writeOnce(json: string): Promise<void> {
  const file = dataFile();
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, json, "utf8");
  try {
    await rename(tmp, file);
  } catch (err) {
    // Windows can reject the rename while another handle still has the target open.
    await unlink(file).catch(() => undefined);
    try {
      await rename(tmp, file);
    } catch (retryErr) {
      console.error("[attendance store] write failed:", retryErr);
      throw retryErr;
    }
  }
}

function commit(draft: Snapshot): Promise<void> {
  const json = JSON.stringify(draft, null, 2);
  const task = writeChain.then(
    () => writeOnce(json),
    () => writeOnce(json),
  );
  writeChain = task.catch(() => undefined);
  return task;
}

/**
 * Serializes read-modify-write cycles and only swaps the cached snapshot in after the
 * write lands, so a failed disk write leaves the in-memory store unchanged.
 */
async function mutate<T>(op: (draft: Draft) => T): Promise<T | null> {
  const run = async (): Promise<T | null> => {
    const current = await load();
    const draft = new Draft(structuredClone(current));
    const result = op(draft);
    try {
      await commit(draft.snapshot);
    } catch {
      return null;
    }
    snapshot = draft.snapshot;
    return result;
  };
  const chained = opChain.then(run, run);
  opChain = chained.catch(() => undefined);
  return chained;
}

class Draft {
  constructor(readonly snapshot: Snapshot) {}

  findSession(id: string) {
    return this.snapshot.sessions.find((s) => s.id === id);
  }

  upsertRecord(record: AttendanceRecord): boolean {
    const index = this.snapshot.records.findIndex(
      (r) => r.sessionId === record.sessionId && r.studentId === record.studentId,
    );
    if (index >= 0) {
      this.snapshot.records[index] = record;
      return true;
    }
    this.snapshot.records.push(record);
    return false;
  }
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fileOpenSession(input: NewSessionInput): Promise<AttendanceSession | null> {
  if ((await storeHealth()).backend === "none") return null;
  const startedAt = new Date().toISOString();
  const session: AttendanceSession = {
    id: crypto.randomUUID(),
    secret: randomHex(24),
    ...input,
    isActive: true,
    startedAt,
    endedAt: null,
  };
  const saved = await mutate((draft) => {
    // A teacher can only host one live session at a time; opening a new one closes strays.
    for (const other of draft.snapshot.sessions) {
      if (other.teacherId === session.teacherId && other.isActive) {
        other.isActive = false;
        other.endedAt = other.endedAt ?? startedAt;
      }
    }
    draft.snapshot.sessions.push(session);
    return true;
  });
  if (saved === null) return null;
  void mirrorSession(db.sessionRow(session));
  return session;
}

/**
 * Every enrolled student for the session's class, marked Present when a record exists and
 * Absent otherwise. Students who scanned without being on the roster are still included —
 * losing a real mark is worse than an unplanned extra row.
 */
export function buildReportRows(roster: RosterStudent[], records: AttendanceRecord[]): ReportRow[] {
  const byRoll = new Map<string, AttendanceRecord>();
  const byId = new Map<string, AttendanceRecord>();
  for (const record of records) {
    if (record.rollNumber) byRoll.set(record.rollNumber.toUpperCase(), record);
    byId.set(record.studentId, record);
  }

  const claimed = new Set<string>();
  const rows: ReportRow[] = roster.map((student) => {
    const record =
      byId.get(student.studentId) ??
      (student.rollNumber ? byRoll.get(student.rollNumber.toUpperCase()) : undefined);
    if (record) claimed.add(record.studentId);
    return {
      name: record?.studentName || student.name,
      roll: student.rollNumber || record?.rollNumber || "—",
      email: student.email || record?.email || "—",
      phone: student.phone || record?.phone || "—",
      markedAt: record?.markedAt ?? null,
      status: record ? ("Present" as const) : ("Absent" as const),
    };
  });

  for (const record of records) {
    if (claimed.has(record.studentId)) continue;
    rows.push({
      name: record.studentName,
      roll: record.rollNumber ?? "—",
      email: record.email ?? "—",
      phone: record.phone ?? "—",
      markedAt: record.markedAt,
      status: "Present",
    });
  }

  return rows.sort((a, b) => a.roll.localeCompare(b.roll, undefined, { numeric: true }));
}
