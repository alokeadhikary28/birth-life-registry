CREATE OR REPLACE FUNCTION public.mfa_ok() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'uno', 'super', 'super_admin', 'owner')
  )
  OR coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
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

CREATE TRIGGER guard_profile_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_update();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

CREATE POLICY "super admins have full access"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING (
    public.mfa_ok()
    AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'owner'::public.app_role)
    )
  )
  WITH CHECK (
    public.mfa_ok()
    AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'owner'::public.app_role)
    )
  );
