-- Attendance store tables for Campus ERP.
--
-- Where the app has a durable disk (the Docker image mounts /data), live QR sessions, marks and
-- class rosters live in a JSON file. On a serverless host — Vercel and anything like it — the code
-- directory is read-only and every instance gets its own throwaway /tmp, so these tables are the
-- store: they are the only thing the teacher's projector and the students' phones can both reach.
--
-- local-auth account ids such as `user_1759...` or `demo-student` are not auth.users UUIDs, so
-- they cannot satisfy the FKs on the original attendance_records table; these erp_* tables take
-- the ids as text instead.
--
-- Apply with `supabase db push` or paste this whole file into the SQL editor — every statement is
-- idempotent, so running it twice is safe and running it again after an upgrade adds the missing
-- columns. Until it exists the server reports that attendance cannot be recorded.

CREATE TABLE IF NOT EXISTS public.erp_attendance_sessions (
  id text PRIMARY KEY,
  -- HMAC key for the rotating QR. Only the app's own server ever reads it, and a session without
  -- one cannot verify a scan, so live QR marks are refused rather than guessed at.
  secret text,
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

ALTER TABLE public.erp_attendance_sessions ADD COLUMN IF NOT EXISTS secret text;

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
  -- The dedupe: a second scan by the same student is ignored, which keeps the first arrival time.
  PRIMARY KEY (session_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.erp_attendance_roster (
  class_section_id text PRIMARY KEY,
  students jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_attendance_records_session_idx
  ON public.erp_attendance_records (session_id, marked_at);

CREATE INDEX IF NOT EXISTS erp_attendance_records_student_idx
  ON public.erp_attendance_records (student_id, marked_at DESC);

CREATE INDEX IF NOT EXISTS erp_attendance_records_roll_idx
  ON public.erp_attendance_records (upper(roll_number));

-- The teacher page restores its live session and lists recent ones per teacher.
CREATE INDEX IF NOT EXISTS erp_attendance_sessions_teacher_idx
  ON public.erp_attendance_sessions (teacher_id, started_at DESC);

-- Server-side queries use the service role. RLS with no policies keeps the browser keys out of
-- these tables entirely: the publishable key must not be able to write attendance.
ALTER TABLE public.erp_attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_attendance_roster ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_attendance_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_attendance_records TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_attendance_roster TO service_role;

REVOKE ALL ON public.erp_attendance_sessions FROM authenticated, anon;
REVOKE ALL ON public.erp_attendance_records FROM authenticated, anon;
REVOKE ALL ON public.erp_attendance_roster FROM authenticated, anon;
