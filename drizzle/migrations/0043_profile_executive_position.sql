ALTER TABLE public.profiles
  ADD COLUMN executive_position text,
  ADD CONSTRAINT profiles_executive_position_check
    CHECK (
      executive_position IS NULL OR executive_position IN (
        'municipal_executive_officer',
        'uno',
        'ddlg',
        'dc',
        'addl_registrar_general',
        'city_corporation_ceo',
        'divisional_commissioner',
        'registrar_general'
      )
    );

WITH position_matches AS (
  SELECT
    p.id,
    min(r.requested_position) AS executive_position
  FROM public.profiles p
  JOIN public.staff_registration_requests r
    ON r.status = 'approved'
    AND r.requested_position IS NOT NULL
    AND (
      (
        p.email IS NOT NULL
        AND r.email IS NOT NULL
        AND lower(p.email) = lower(r.email)
      )
      OR (
        p.mobile IS NOT NULL
        AND r.phone IS NOT NULL
        AND regexp_replace(regexp_replace(p.mobile, '\D', '', 'g'), '^880', '0')
          = regexp_replace(regexp_replace(r.phone, '\D', '', 'g'), '^880', '0')
      )
    )
  WHERE p.executive_position IS NULL
  GROUP BY p.id
  HAVING count(DISTINCT r.requested_position) = 1
)
UPDATE public.profiles p
SET executive_position = matches.executive_position
FROM position_matches matches
WHERE matches.id = p.id;
