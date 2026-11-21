DROP POLICY IF EXISTS "union admins review field staff" ON public.profiles;
DROP POLICY IF EXISTS "unos review union admins" ON public.profiles;

CREATE OR REPLACE FUNCTION public.guard_profile_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
    AND (
      NEW.approval_status IS DISTINCT FROM OLD.approval_status
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.active IS DISTINCT FROM OLD.active
    )
    AND NOT public.has_role(auth.uid(), 'super'::public.app_role) THEN
    RAISE EXCEPTION 'Only Super Admins may modify staff approval status';
  END IF;

  IF auth.uid() IS NULL
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - ARRAY['approval_status', 'status', 'active'])
    IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['approval_status', 'status', 'active']) THEN
    RAISE EXCEPTION 'Only Super Admins and Owners may modify profile details';
  END IF;

  RETURN NEW;
END
$$;
