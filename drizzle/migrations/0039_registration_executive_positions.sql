ALTER TABLE public.staff_registration_requests
  ADD COLUMN requested_position text;

ALTER TABLE public.staff_registration_requests
  DROP CONSTRAINT staff_registration_requests_category_check,
  DROP CONSTRAINT staff_registration_requests_role_check;

UPDATE public.staff_registration_requests
SET category = 'উচ্চ পর্যায়ের নির্বাহী প্যানেল',
    requested_position = 'uno'
WHERE category = 'উচ্চপর্যায়ের নির্বাহী প্যানেল';

ALTER TABLE public.staff_registration_requests
  ADD CONSTRAINT staff_registration_requests_role_check
    CHECK (role IN ('worker', 'police', 'admin', 'uno', 'district', 'super')),
  ADD CONSTRAINT staff_registration_requests_category_check
    CHECK (
      (category = 'স্বাস্থ্যকর্মী' AND role = 'worker' AND requested_position IS NULL) OR
      (category = 'গ্রাম পুলিশ' AND role = 'police' AND requested_position IS NULL) OR
      (category = 'ইউপি প্রশাসনিক কর্মকর্তা' AND role = 'admin' AND requested_position IS NULL) OR
      (
        category = 'উচ্চ পর্যায়ের নির্বাহী প্যানেল' AND
        requested_position IS NOT NULL AND
        (
          (requested_position = 'municipal_executive_officer' AND role = 'admin') OR
          (requested_position = 'uno' AND role = 'uno') OR
          (requested_position IN ('ddlg', 'dc', 'divisional_commissioner') AND role = 'district') OR
          (requested_position IN ('addl_registrar_general', 'registrar_general') AND role = 'super') OR
          (requested_position = 'city_corporation_ceo' AND role = 'admin')
        )
      )
    );
