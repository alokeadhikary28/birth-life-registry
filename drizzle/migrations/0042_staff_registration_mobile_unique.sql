CREATE UNIQUE INDEX staff_registration_requests_pending_mobile_idx
  ON public.staff_registration_requests (mobile)
  WHERE mobile IS NOT NULL AND status IN ('pending', 'processing', 'approved');
