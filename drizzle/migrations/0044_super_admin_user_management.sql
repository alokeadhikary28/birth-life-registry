ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_status_check,
  ADD CONSTRAINT profiles_status_check
    CHECK (status IN ('pending', 'active', 'rejected', 'suspended', 'cancelled'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_approval_status_check,
  ADD CONSTRAINT profiles_approval_status_check
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'suspended', 'cancelled'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_approval_status_matches_access,
  ADD CONSTRAINT profiles_approval_status_matches_access
    CHECK (
      (approval_status = 'approved' AND status = 'active' AND active)
      OR (approval_status = 'pending' AND status = 'pending' AND NOT active)
      OR (approval_status = 'rejected' AND status = 'rejected' AND NOT active)
      OR (approval_status = 'suspended' AND status = 'suspended' AND NOT active)
      OR (approval_status = 'cancelled' AND status = 'cancelled' AND NOT active)
    );
