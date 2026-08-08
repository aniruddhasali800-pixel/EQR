-- Sessions
CREATE TABLE public.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_section_id uuid NOT NULL REFERENCES public.class_sections(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  secret text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  is_active boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_sessions TO authenticated;
GRANT ALL ON public.attendance_sessions TO service_role;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions staff insert" ON public.attendance_sessions
  FOR INSERT TO authenticated
  WITH CHECK (teacher_id = auth.uid() AND public.is_staff(auth.uid()));

CREATE POLICY "sessions owner update" ON public.attendance_sessions
  FOR UPDATE TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "sessions owner delete" ON public.attendance_sessions
  FOR DELETE TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

-- secret column is only read by the owning teacher / service role via server code
CREATE POLICY "sessions owner read" ON public.attendance_sessions
  FOR SELECT TO authenticated
  USING (teacher_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE TRIGGER trg_attendance_sessions_updated
  BEFORE UPDATE ON public.attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Records
CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  marked_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'present',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

GRANT SELECT, INSERT ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "records read" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "records self insert" ON public.attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Demo campus structure so dropdowns have options
INSERT INTO public.departments (name, code) VALUES
  ('Computer Engineering', 'CO'),
  ('Information Technology', 'IF'),
  ('Mechanical Engineering', 'ME'),
  ('Electronics & Telecommunication', 'EJ')
ON CONFLICT DO NOTHING;

INSERT INTO public.subjects (name, code, department_id, semester, credits)
SELECT v.name, v.code, d.id, v.semester, v.credits
FROM (VALUES
  ('Data Structures', 'CO301', 'CO', 3, 4),
  ('Operating Systems', 'CO402', 'CO', 4, 4),
  ('Database Management', 'CO403', 'CO', 4, 3),
  ('Computer Networks', 'CO501', 'CO', 5, 4),
  ('Web Development', 'IF302', 'IF', 3, 3),
  ('Software Testing', 'IF404', 'IF', 4, 3),
  ('Thermodynamics', 'ME301', 'ME', 3, 4),
  ('Digital Electronics', 'EJ302', 'EJ', 3, 4)
) AS v(name, code, dept_code, semester, credits)
JOIN public.departments d ON d.code = v.dept_code
ON CONFLICT DO NOTHING;

INSERT INTO public.class_sections (name, department_id, semester, section, batch)
SELECT v.name, d.id, v.semester, v.section, v.batch
FROM (VALUES
  ('CO Sem 3 - A', 'CO', 3, 'A', '2025-26'),
  ('CO Sem 3 - B', 'CO', 3, 'B', '2025-26'),
  ('CO Sem 4 - A', 'CO', 4, 'A', '2025-26'),
  ('CO Sem 5 - A', 'CO', 5, 'A', '2025-26'),
  ('IF Sem 3 - A', 'IF', 3, 'A', '2025-26'),
  ('IF Sem 4 - A', 'IF', 4, 'A', '2025-26'),
  ('ME Sem 3 - A', 'ME', 3, 'A', '2025-26'),
  ('EJ Sem 3 - A', 'EJ', 3, 'A', '2025-26')
) AS v(name, dept_code, semester, section, batch)
JOIN public.departments d ON d.code = v.dept_code
ON CONFLICT DO NOTHING;