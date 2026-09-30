-- Optional Supabase mirror for the Campus ERP attendance store.
--
-- The Node server owns attendance state (src/lib/attendance-store.server.ts) because local-auth
-- account ids such as `user_1759...` or `demo-student` are not auth.users UUIDs, so they cannot
-- satisfy the FKs on the original attendance_records table. These erp_* tables take the ids as
-- text instead, letting the server mirror every write with the service role key.
--
-- Apply with `supabase db push` (or paste into the SQL editor). Until it exists the mirror logs a
-- warning per write and attendance keeps working from the server store; nothing else depends on it.

CREATE TABLE IF NOT EXISTS public.erp_attendance_sessions (
  id text PRIMARY KEY,
  class_section_id text NOT NULL,
  class_name text,
  subject_id text,
  subject_name text,
  subject_code text,
  teacher_id text NOT NULL,
  teacher_name text NOT NULL,
  cr_name text,
  is_active boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  mirrored_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.erp_attendance_records (
  session_id text NOT NULL REFERENCES public.erp_attendance_sessions(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  student_name text NOT NULL,
  roll_number text,
  email text,
  phone text,
  marked_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'Present',
  source text NOT NULL DEFAULT 'live_qr',
  mirrored_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.erp_attendance_roster (
  class_section_id text PRIMARY KEY,
  students jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_attendance_records_session_idx
  ON public.erp_attendance_records (session_id, marked_at);

-- Server-side mirror writes use the service role. RLS with no policies keeps the browser keys
-- out of these tables entirely.
ALTER TABLE public.erp_attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_attendance_roster ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_attendance_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_attendance_records TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_attendance_roster TO service_role;

REVOKE ALL ON public.erp_attendance_sessions FROM authenticated, anon;
REVOKE ALL ON public.erp_attendance_records FROM authenticated, anon;
REVOKE ALL ON public.erp_attendance_roster FROM authenticated, anon;
