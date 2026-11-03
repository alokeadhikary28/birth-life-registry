CREATE TABLE public.staff_registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 100),
  phone text NOT NULL CHECK (phone ~ '^\+8801[0-9]{9}$'),
  role text NOT NULL CHECK (role IN ('worker', 'police')),
  union_name text NOT NULL,
  upazila_id text NOT NULL DEFAULT 'manirampur' REFERENCES public.upazilas(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'provisioned', 'rejected')),
  processing_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  processing_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX staff_registration_requests_pending_phone_idx
  ON public.staff_registration_requests (phone)
  WHERE status IN ('pending', 'processing');

CREATE INDEX staff_registration_requests_scope_idx
  ON public.staff_registration_requests (upazila_id, created_at)
  WHERE status = 'pending';

ALTER TABLE public.staff_registration_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_registration_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staff_registration_requests TO service_role;
