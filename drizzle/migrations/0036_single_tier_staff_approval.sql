ALTER TABLE public.staff_registration_requests
<<<<<<< HEAD
<<<<<<< HEAD
=======
  DROP CONSTRAINT IF EXISTS staff_registration_requests_status_check,
>>>>>>> 6993c5b3469384e6e35d38e68fe541f4e440eaa9
=======
  DROP CONSTRAINT IF EXISTS staff_registration_requests_status_check,
>>>>>>> 6993c5b3469384e6e35d38e68fe541f4e440eaa9
  ADD CONSTRAINT staff_registration_requests_status_check
    CHECK (status IN ('pending', 'processing', 'provisioned', 'approved', 'rejected'));

DROP INDEX IF EXISTS public.staff_registration_requests_pending_phone_idx;
CREATE UNIQUE INDEX staff_registration_requests_pending_phone_idx
  ON public.staff_registration_requests (phone)
  WHERE status IN ('pending', 'processing', 'approved');

DROP INDEX IF EXISTS public.staff_registration_requests_scope_idx;
CREATE INDEX staff_registration_requests_scope_idx
  ON public.staff_registration_requests (upazila_id, union_name, created_at)
  WHERE status = 'pending';