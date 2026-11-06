ALTER TABLE public.staff_registration_requests
  ADD COLUMN office_name text,
  ADD COLUMN category text;

UPDATE public.staff_registration_requests
SET category = CASE role
  WHEN 'worker' THEN 'স্বাস্থ্যকর্মী'
  WHEN 'police' THEN 'গ্রাম পুলিশ'
END;

ALTER TABLE public.staff_registration_requests
  DROP CONSTRAINT staff_registration_requests_role_check,
  ADD CONSTRAINT staff_registration_requests_role_check
    CHECK (role IN ('worker', 'police', 'admin', 'uno')),
  ALTER COLUMN category SET NOT NULL,
  ADD CONSTRAINT staff_registration_requests_category_check
    CHECK (
      (category = 'স্বাস্থ্যকর্মী' AND role = 'worker') OR
      (category = 'গ্রাম পুলিশ' AND role = 'police') OR
      (category = 'ইউপি প্রশাসনিক কর্মকর্তা' AND role = 'admin') OR
      (category = 'উচ্চপর্যায়ের নির্বাহী প্যানেল' AND role = 'uno')
    ),
  ADD CONSTRAINT staff_registration_requests_office_name_check
    CHECK (
      office_name IS NULL OR
      char_length(btrim(office_name)) BETWEEN 1 AND 120
    );
