-- Roles
CREATE TYPE public.app_role AS ENUM ('super_admin','principal','hod','teacher','cr','student');

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  hod_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL DEFAULT '',
  middle_name text,
  last_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text,
  photo_url text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE public.student_details (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  roll_number text,
  prn text,
  registration_number text,
  branch text,
  semester int,
  section text,
  batch text,
  blood_group text,
  address text,
  parent_name text,
  parent_mobile text,
  emergency_contact text,
  gender text,
  date_of_birth date,
  admission_date date,
  id_proof_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.teacher_details (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id text,
  qualification text,
  joining_date date,
  signature_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  semester int,
  credits int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.class_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  semester int NOT NULL,
  section text NOT NULL,
  batch text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.timetable_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_section_id uuid NOT NULL REFERENCES public.class_sections(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  day_of_week int NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  room text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_details TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_details TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timetable_slots TO authenticated;
GRANT ALL ON public.departments, public.profiles, public.user_roles, public.student_details, public.teacher_details, public.subjects, public.class_sections, public.timetable_slots TO service_role;

-- Helpers
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin','principal','hod','teacher')
  )
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_departments_updated BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_student_updated BEFORE UPDATE ON public.student_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_teacher_updated BEFORE UPDATE ON public.teacher_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_timetable_updated BEFORE UPDATE ON public.timetable_slots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name',''),
    COALESCE(NEW.raw_user_meta_data->>'last_name',''),
    COALESCE(NEW.email,''),
    NEW.raw_user_meta_data->>'phone'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'student'))
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'super_admin')) WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admin profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admin profile delete" ON public.profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "roles read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "roles admin manage" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "student details read" ON public.student_details FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "student details self update" ON public.student_details FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin')) WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "student details admin write" ON public.student_details FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "student details admin delete" ON public.student_details FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "teacher details read" ON public.teacher_details FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "teacher details self update" ON public.teacher_details FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin')) WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "teacher details insert" ON public.teacher_details FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "teacher details delete" ON public.teacher_details FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "departments read" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "departments admin" ON public.departments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "subjects read" ON public.subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "subjects admin" ON public.subjects FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "sections read" ON public.class_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "sections admin" ON public.class_sections FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "timetable read" ON public.timetable_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "timetable admin" ON public.timetable_slots FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));