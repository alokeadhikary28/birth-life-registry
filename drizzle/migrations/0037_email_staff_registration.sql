ALTER TABLE public.staff_registration_requests
  ALTER COLUMN phone DROP NOT NULL,
  ADD COLUMN email text,
  ADD CONSTRAINT staff_registration_requests_contact_check
    CHECK (phone IS NOT NULL OR email IS NOT NULL),
  ADD CONSTRAINT staff_registration_requests_email_check
    CHECK (email IS NULL OR email = lower(btrim(email)));

CREATE UNIQUE INDEX staff_registration_requests_pending_email_idx
  ON public.staff_registration_requests (lower(email))
  WHERE email IS NOT NULL AND status IN ('pending', 'processing', 'approved');

DROP INDEX IF EXISTS public.staff_registration_requests_scope_idx;
CREATE INDEX staff_registration_requests_scope_idx
  ON public.staff_registration_requests (upazila_id, union_name, created_at)
  WHERE status = 'pending';
