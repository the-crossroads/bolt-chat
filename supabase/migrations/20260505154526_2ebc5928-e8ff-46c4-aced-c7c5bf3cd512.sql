
REVOKE EXECUTE ON FUNCTION public.is_server_member(UUID, UUID) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_server_role(UUID, UUID) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_server_role(UUID, UUID, public.server_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_server_staff(UUID, UUID) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_dm_participant(UUID, UUID) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_view_message(UUID, UUID, UUID) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_moderate_message(UUID, UUID) FROM anon, public;

ALTER FUNCTION public.touch_updated_at() SET search_path = public;
