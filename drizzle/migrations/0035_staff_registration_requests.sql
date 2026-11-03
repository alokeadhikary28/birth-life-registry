CREATE TABLE public.staff_registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 100),
  mobile text NOT NULL CHECK (mobile ~ '^\+8801[0-9]{9}$'),
  requested_role text NOT NULL CHECK (requested_role IN ('worker', 'police')),
  upazila_id text NOT NULL REFERENCES public.upazilas(id) ON DELETE CASCADE,
  union_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'provisioned', 'rejected')),
  processing_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  processing_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX staff_registration_requests_pending_mobile_idx
  ON public.staff_registration_requests (mobile)
  WHERE status IN ('pending', 'processing');

CREATE INDEX staff_registration_requests_scope_idx
  ON public.staff_registration_requests (upazila_id, union_id, created_at)
  WHERE status = 'pending';

ALTER TABLE public.staff_registration_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_registration_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staff_registration_requests TO service_role;
