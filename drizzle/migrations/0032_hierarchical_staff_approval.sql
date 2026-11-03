ALTER TABLE public.profiles
  ADD COLUMN approval_status text NOT NULL DEFAULT 'approved'
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

UPDATE public.profiles
SET approval_status = CASE status
  WHEN 'active' THEN 'approved'
  ELSE status
END;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_approval_status_matches_access
  CHECK (
    (approval_status = 'approved' AND status = 'active' AND active)
    OR (approval_status = 'pending' AND status = 'pending' AND NOT active)
    OR (approval_status = 'rejected' AND status = 'rejected' AND NOT active)
  );

DROP TRIGGER IF EXISTS create_pending_staff_profile_after_auth_signup ON auth.users;
DROP FUNCTION IF EXISTS public.create_pending_staff_profile();

GRANT UPDATE (approval_status, status, active) ON public.profiles TO authenticated;

CREATE POLICY "union admins review field staff"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    approval_status = 'pending'
    AND public.mfa_ok()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
    AND upazila_id = public.current_upazila()
    AND station_id = public.current_station()
    AND union_id = public.current_station()
    AND (
      public.has_role(id, 'worker'::public.app_role)
      OR public.has_role(id, 'police'::public.app_role)
    )
  )
  WITH CHECK (
    approval_status IN ('approved', 'rejected')
    AND public.mfa_ok()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
    AND upazila_id = public.current_upazila()
    AND station_id = public.current_station()
    AND union_id = public.current_station()
    AND (
      public.has_role(id, 'worker'::public.app_role)
      OR public.has_role(id, 'police'::public.app_role)
    )
  );

CREATE POLICY "unos review union admins"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    approval_status = 'pending'
    AND public.mfa_ok()
    AND public.has_role(auth.uid(), 'uno'::public.app_role)
    AND upazila_id = public.current_upazila()
    AND public.has_role(id, 'admin'::public.app_role)
  )
  WITH CHECK (
    approval_status IN ('approved', 'rejected')
    AND public.mfa_ok()
    AND public.has_role(auth.uid(), 'uno'::public.app_role)
    AND upazila_id = public.current_upazila()
    AND public.has_role(id, 'admin'::public.app_role)
  );
