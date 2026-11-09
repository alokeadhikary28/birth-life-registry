-- ১. যদি admin_area কলামটি না থাকে, তবে তা যোগ করুন
ALTER TABLE public.staff_registration_requests
  ADD COLUMN IF NOT EXISTS mobile text,
  ADD COLUMN IF NOT EXISTS admin_area text;

-- পুরোনো request-এর ফোন ও ইউনিয়নের মান নতুন কলামে কপি করুন।
UPDATE public.staff_registration_requests
SET mobile = phone
WHERE mobile IS NULL;

UPDATE public.staff_registration_requests 
SET admin_area = COALESCE(NULLIF(btrim(union_name), ''), 'অনির্দিষ্ট')
WHERE admin_area IS NULL OR btrim(admin_area) = '';

-- ৩. admin_area কলামে নট-নাল (NOT NULL) নিশ্চিত করুন
ALTER TABLE public.staff_registration_requests
  ALTER COLUMN admin_area SET NOT NULL;

-- ৪. পুরনো কোনো কনস্ট্রেইন্ট থাকলে তা ড্রপ করে নতুনগুলো যুক্ত করুন (মোবাইল নম্বর ১১ ডিজিট বা আন্তর্জাতিক কোড উভয় ফরম্যাটের জন্য নিরাপদ)
ALTER TABLE public.staff_registration_requests
  DROP CONSTRAINT IF EXISTS staff_registration_requests_mobile_check,
  ADD CONSTRAINT staff_registration_requests_mobile_check
    CHECK (mobile IS NULL OR mobile ~ '^(01[0-9]{9}|\+8801[0-9]{9})$'),
    
  DROP CONSTRAINT IF EXISTS staff_registration_requests_admin_area_check,
  ADD CONSTRAINT staff_registration_requests_admin_area_check
    CHECK (char_length(btrim(admin_area)) BETWEEN 1 AND 120);