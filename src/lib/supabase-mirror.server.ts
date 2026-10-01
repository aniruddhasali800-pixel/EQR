/**
 * Optional Supabase mirror for attendance data.
 *
 * The app's own store is the source of truth (see attendance-store.server.ts). When that store
 * lives in Supabase this module never runs; it exists for the file-backed deployment on
 * Docker/Node, where SUPABASE_URL + a secret key additionally duplicate every
 * session/record/roster write into the `erp_*` tables created by
 * supabase/migrations/20260930090000_*.sql, so the school's database holds the same rows.
 * Mirroring is best-effort: a mirror failure logs and never blocks or falsifies an attendance
 * mark.
 */

import { missingSupabaseEnv, supabaseSettings } from "./attendance-db.server";

export function mirrorStatus(): { enabled: boolean; reason: string } {
  const settings = supabaseSettings();
  if (!settings) return { enabled: false, reason: missingSupabaseEnv() };
  return { enabled: true, reason: "Mirroring attendance to Supabase erp_* tables" };
}

type MirrorClient = {
  from: (table: string) => {
    upsert: (values: unknown, options?: { onConflict?: string }) => Promise<{ error: unknown }>;
  };
};

let clientPromise: Promise<MirrorClient | null> | undefined;

async function getClient(): Promise<MirrorClient | null> {
  if (!mirrorStatus().enabled) return null;
  if (!clientPromise) {
    clientPromise = import("@/integrations/supabase/client.server")
      .then((m) => m.supabaseAdmin as unknown as MirrorClient)
      .catch(() => null);
  }
  return clientPromise;
}

/** Runs a mirror write, logging (never throwing) on failure. */
async function write(table: string, values: unknown, onConflict: string): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    const { error } = await client.from(table).upsert(values, { onConflict });
    if (error) console.warn(`[attendance mirror] upsert into ${table} failed:`, error);
  } catch (err) {
    console.warn(`[attendance mirror] upsert into ${table} threw:`, err);
  }
}

export async function mirrorSession(session: Record<string, unknown>): Promise<void> {
  await write("erp_attendance_sessions", session, "id");
}

export async function mirrorRecord(record: Record<string, unknown>): Promise<void> {
  await write("erp_attendance_records", record, "session_id,student_id");
}

export async function mirrorRoster(roster: Record<string, unknown>): Promise<void> {
  await write("erp_attendance_roster", roster, "class_section_id");
}
