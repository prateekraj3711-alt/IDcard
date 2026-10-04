REVOKE EXECUTE ON FUNCTION public.current_class_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_class(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_student(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_student_class() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_class_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_class(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_student(uuid) TO authenticated;