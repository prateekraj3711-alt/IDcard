ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS entry_fields jsonb;

CREATE OR REPLACE FUNCTION public.current_class_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT class_id FROM public.profiles WHERE id = auth.uid() AND is_active AND deleted_at IS NULL
$$;

CREATE OR REPLACE FUNCTION public.can_access_class(_class_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'super_admin')
    OR public.current_class_id() IS NULL
    OR _class_id = public.current_class_id()
$$;

CREATE OR REPLACE FUNCTION public.can_access_student(_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'super_admin')
    OR public.current_class_id() IS NULL
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = _student_id AND s.class_id = public.current_class_id())
$$;

-- Force a class-bound user's candidates into their class (web + Android).
CREATE OR REPLACE FUNCTION public.enforce_student_class()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c uuid;
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'super_admin') THEN RETURN NEW; END IF;
  c := public.current_class_id();
  IF c IS NULL THEN RETURN NEW; END IF;
  IF NEW.class_id IS DISTINCT FROM c THEN
    NEW.class_id := c;
    IF NEW.section_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sections WHERE id = NEW.section_id AND class_id = c) THEN
      NEW.section_id := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_students_enforce_class ON public.students;
CREATE TRIGGER trg_students_enforce_class BEFORE INSERT OR UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.enforce_student_class();

CREATE POLICY students_class_scope ON public.students AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_access_class(class_id)) WITH CHECK (public.can_access_class(class_id));
CREATE POLICY photos_class_scope ON public.photos AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_access_student(student_id)) WITH CHECK (public.can_access_student(student_id));
CREATE POLICY id_cards_class_scope ON public.id_cards AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_access_student(student_id)) WITH CHECK (public.can_access_student(student_id));

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND NOT (school_id IS DISTINCT FROM public.current_school_id()) AND NOT (class_id IS DISTINCT FROM public.current_class_id()));