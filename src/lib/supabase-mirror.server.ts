/**
 * Optional Supabase mirror for attendance data.
 *
 * The app's own store is the source of truth (see attendance-store.server.ts) because
 * local-auth user ids are not `auth.users` UUIDs and the deployed container may have no
 * Supabase credentials at all. When SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are both
 * present, every session/record/roster write is duplicated into the `erp_*` tables
 * created by supabase/migrations/20260930090000_*.sql so the school's database holds
 * the same rows. Mirroring is best-effort: a mirror failure logs and never blocks or
 * falsifies an attendance mark.
 */

function firstEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value && !value.includes("placeholder")) return value;
  }
  return undefined;
}

export function mirrorStatus(): { enabled: boolean; reason: string } {
  const url = firstEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  if (!url) return { enabled: false, reason: "SUPABASE_URL is not set" };
  const key = firstEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return { enabled: false, reason: "SUPABASE_SERVICE_ROLE_KEY is not set" };
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
