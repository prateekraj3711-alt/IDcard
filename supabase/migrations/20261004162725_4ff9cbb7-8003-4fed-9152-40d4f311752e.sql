CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE OR REPLACE FUNCTION private.current_school_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid() AND is_active AND deleted_at IS NULL $$;
CREATE OR REPLACE FUNCTION private.current_class_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT class_id FROM public.profiles WHERE id = auth.uid() AND is_active AND deleted_at IS NULL $$;
CREATE OR REPLACE FUNCTION private.can_access_student(_student_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.has_role(auth.uid(), 'super_admin') OR private.current_class_id() IS NULL
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = _student_id AND s.class_id = private.current_class_id()) $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$ SELECT private.has_role(_user_id, _role) $$;
CREATE OR REPLACE FUNCTION public.current_school_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$ SELECT private.current_school_id() $$;
CREATE OR REPLACE FUNCTION public.current_class_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$ SELECT private.current_class_id() $$;
CREATE OR REPLACE FUNCTION public.can_access_student(_student_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$ SELECT private.can_access_student(_student_id) $$;
CREATE OR REPLACE FUNCTION public.can_access_class(_class_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT private.has_role(auth.uid(), 'super_admin') OR private.current_class_id() IS NULL OR _class_id = private.current_class_id() $$;
CREATE OR REPLACE FUNCTION public.can_access_school(_school_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (private.has_role(auth.uid(), 'super_admin')
    OR (_school_id IS NOT NULL AND _school_id = private.current_school_id())) $$;
CREATE OR REPLACE FUNCTION public.can_access_school_path(_segment text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (private.has_role(auth.uid(), 'super_admin')
    OR (_segment IS NOT NULL AND _segment = private.current_school_id()::text)) $$;

REVOKE EXECUTE ON FUNCTION public.enforce_student_class() FROM PUBLIC, anon, authenticated;