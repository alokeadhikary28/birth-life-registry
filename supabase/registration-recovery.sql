-- Registration/approval recovery for the currently supported Manirampur flow.
-- Safe to run repeatedly on a fresh/restored Supabase project.
-- This does not install the rest of the application migrations.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM (
      'worker', 'admin', 'police', 'uno', 'super', 'district', 'super_admin', 'owner'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.upazilas (
  id text PRIMARY KEY,
  bn text NOT NULL,
  en text NOT NULL,
  district_bn text NOT NULL,
  district_en text NOT NULL,
  division_bn text NOT NULL DEFAULT '',
  division_en text NOT NULL DEFAULT '',
  unions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.upazilas TO authenticated;
GRANT ALL ON public.upazilas TO service_role;
ALTER TABLE public.upazilas ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name_bn text NOT NULL,
  name_en text NOT NULL,
  mobile text,
  email text,
  upazila_id text REFERENCES public.upazilas(id),
  union_id text,
  ward integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  district_id text,
  station_id text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'rejected')),
  approval_status text NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT profiles_active_matches_status CHECK (active = (status = 'active')),
  CONSTRAINT profiles_approval_status_matches_access CHECK (
    (approval_status = 'approved' AND status = 'active' AND active)
    OR (approval_status = 'pending' AND status = 'pending' AND NOT active)
    OR (approval_status = 'rejected' AND status = 'rejected' AND NOT active)
  ),
  CONSTRAINT profiles_station_matches_union CHECK (station_id IS NOT DISTINCT FROM union_id)
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS district_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS station_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  action text NOT NULL,
  case_id uuid,
  details jsonb
);

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  identifier text NOT NULL,
  method text NOT NULL,
  ip text,
  success boolean NOT NULL,
  reason text
);

CREATE INDEX IF NOT EXISTS login_attempts_idx
  ON public.login_attempts (identifier, at DESC);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx
  ON public.login_attempts (ip, at DESC);
CREATE INDEX IF NOT EXISTS profiles_pending_union_idx
  ON public.profiles (upazila_id, union_id, created_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.administrative_areas (
  id text PRIMARY KEY,
  level text NOT NULL CHECK (
    level IN ('division', 'city_corporation', 'district', 'municipality', 'upazila', 'union', 'ward')
  ),
  name_bn text NOT NULL,
  name_en text NOT NULL,
  parent_id text REFERENCES public.administrative_areas(id) ON DELETE CASCADE,
  division_id text REFERENCES public.administrative_areas(id) ON DELETE CASCADE,
  district_id text REFERENCES public.administrative_areas(id) ON DELETE CASCADE,
  city_corporation_id text REFERENCES public.administrative_areas(id) ON DELETE CASCADE,
  municipality_id text REFERENCES public.administrative_areas(id) ON DELETE CASCADE,
  upazila_id text REFERENCES public.upazilas(id) ON DELETE CASCADE,
  union_id text,
  ward_number integer CHECK (ward_number BETWEEN 1 AND 99),
  CHECK ((level = 'division' AND parent_id IS NULL) OR (level <> 'division' AND parent_id IS NOT NULL)),
  CHECK ((level = 'ward') = (ward_number IS NOT NULL)),
  CHECK (
    (level IN ('union', 'municipality') AND union_id IS NOT NULL)
    OR (level NOT IN ('union', 'municipality') AND level <> 'ward' AND union_id IS NULL)
    OR level = 'ward'
  )
);

CREATE INDEX IF NOT EXISTS administrative_areas_level_parent_idx
  ON public.administrative_areas (level, parent_id);
CREATE INDEX IF NOT EXISTS administrative_areas_geo_idx
  ON public.administrative_areas (
    division_id, district_id, city_corporation_id, municipality_id, upazila_id, union_id, ward_number
  );

CREATE TABLE IF NOT EXISTS public.administrative_stations (
  upazila_id text NOT NULL REFERENCES public.upazilas(id) ON DELETE CASCADE,
  station_id text NOT NULL,
  district_id text NOT NULL REFERENCES public.administrative_areas(id),
  name_bn text NOT NULL,
  name_en text NOT NULL,
  station_type text NOT NULL CHECK (station_type IN ('union', 'paurashava')),
  PRIMARY KEY (upazila_id, station_id)
);

CREATE INDEX IF NOT EXISTS administrative_stations_district_idx
  ON public.administrative_stations (district_id, upazila_id, station_type);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.current_upazila()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT upazila_id FROM public.profiles WHERE id = auth.uid() AND active
$$;

CREATE OR REPLACE FUNCTION public.current_union()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT union_id FROM public.profiles WHERE id = auth.uid() AND active
$$;

CREATE OR REPLACE FUNCTION public.current_ward()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ward FROM public.profiles WHERE id = auth.uid() AND active
$$;

CREATE OR REPLACE FUNCTION public.current_district()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT district_id FROM public.profiles WHERE id = auth.uid() AND active
$$;

CREATE OR REPLACE FUNCTION public.current_station()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT station_id FROM public.profiles WHERE id = auth.uid() AND active
$$;

CREATE OR REPLACE FUNCTION public.mfa_ok()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'district', 'uno', 'super', 'super_admin', 'owner')
  ) OR coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
$$;

CREATE OR REPLACE FUNCTION public.administrative_area_slug(value text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = public
AS $$
  SELECT trim(both '-' from regexp_replace(lower(value), '[^a-z0-9]+', '-', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.sync_upazila_administrative_areas(_upazila_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  area_row public.upazilas%ROWTYPE;
  division_area_id text;
  district_area_id text;
  upazila_area_id text;
  local_area jsonb;
  local_area_id text;
  local_area_level text;
  local_union_id text;
  ward integer;
BEGIN
  SELECT * INTO area_row FROM public.upazilas WHERE id = _upazila_id;
  IF NOT FOUND THEN RETURN; END IF;

  division_area_id := 'division:' || public.administrative_area_slug(area_row.division_en);
  district_area_id := 'district:' || public.administrative_area_slug(area_row.division_en)
    || ':' || public.administrative_area_slug(area_row.district_en);
  upazila_area_id := 'upazila:' || area_row.id;

  INSERT INTO public.administrative_areas (id, level, name_bn, name_en, parent_id, division_id)
  VALUES (division_area_id, 'division', area_row.division_bn, area_row.division_en, NULL, division_area_id)
  ON CONFLICT (id) DO UPDATE SET name_bn = EXCLUDED.name_bn, name_en = EXCLUDED.name_en;

  INSERT INTO public.administrative_areas (id, level, name_bn, name_en, parent_id, division_id, district_id)
  VALUES (
    district_area_id, 'district', area_row.district_bn, area_row.district_en,
    division_area_id, division_area_id, district_area_id
  )
  ON CONFLICT (id) DO UPDATE SET
    name_bn = EXCLUDED.name_bn, name_en = EXCLUDED.name_en,
    parent_id = EXCLUDED.parent_id, division_id = EXCLUDED.division_id;

  INSERT INTO public.administrative_areas (
    id, level, name_bn, name_en, parent_id, division_id, district_id, upazila_id
  )
  VALUES (
    upazila_area_id, 'upazila', area_row.bn, area_row.en,
    district_area_id, division_area_id, district_area_id, area_row.id
  )
  ON CONFLICT (id) DO UPDATE SET
    name_bn = EXCLUDED.name_bn, name_en = EXCLUDED.name_en,
    parent_id = EXCLUDED.parent_id, division_id = EXCLUDED.division_id,
    district_id = EXCLUDED.district_id, upazila_id = EXCLUDED.upazila_id;

  FOR local_area IN SELECT value FROM jsonb_array_elements(area_row.unions) LOOP
    local_union_id := local_area ->> 'id';
    IF local_union_id IS NULL OR local_area ->> 'bn' IS NULL OR local_area ->> 'en' IS NULL THEN
      CONTINUE;
    END IF;

    IF local_area ->> 'bn' LIKE '%পৌরসভা%' OR local_area ->> 'en' ILIKE '%pourashava%' THEN
      local_area_level := 'municipality';
      local_area_id := 'municipality:' || area_row.id || ':' || local_union_id;
    ELSE
      local_area_level := 'union';
      local_area_id := 'union:' || area_row.id || ':' || local_union_id;
    END IF;

    INSERT INTO public.administrative_areas (
      id, level, name_bn, name_en, parent_id, division_id, district_id,
      municipality_id, upazila_id, union_id
    )
    VALUES (
      local_area_id, local_area_level, local_area ->> 'bn', local_area ->> 'en',
      upazila_area_id, division_area_id, district_area_id,
      CASE WHEN local_area_level = 'municipality' THEN local_area_id ELSE NULL END,
      area_row.id, local_union_id
    )
    ON CONFLICT (id) DO UPDATE SET
      level = EXCLUDED.level, name_bn = EXCLUDED.name_bn, name_en = EXCLUDED.name_en,
      parent_id = EXCLUDED.parent_id, division_id = EXCLUDED.division_id,
      district_id = EXCLUDED.district_id, municipality_id = EXCLUDED.municipality_id,
      upazila_id = EXCLUDED.upazila_id, union_id = EXCLUDED.union_id;

    FOR ward IN 1..9 LOOP
      INSERT INTO public.administrative_areas (
        id, level, name_bn, name_en, parent_id, division_id, district_id,
        municipality_id, upazila_id, union_id, ward_number
      )
      VALUES (
        'ward:' || area_row.id || ':' || local_union_id || ':' || ward,
        'ward', 'ওয়ার্ড ' || ward, 'Ward ' || ward, local_area_id,
        division_area_id, district_area_id,
        CASE WHEN local_area_level = 'municipality' THEN local_area_id ELSE NULL END,
        area_row.id, local_union_id, ward
      )
      ON CONFLICT (id) DO UPDATE SET
        name_bn = EXCLUDED.name_bn, name_en = EXCLUDED.name_en, parent_id = EXCLUDED.parent_id,
        division_id = EXCLUDED.division_id, district_id = EXCLUDED.district_id,
        municipality_id = EXCLUDED.municipality_id, upazila_id = EXCLUDED.upazila_id,
        union_id = EXCLUDED.union_id, ward_number = EXCLUDED.ward_number;
    END LOOP;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.sync_upazila_administrative_areas_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_upazila_administrative_areas(NEW.id);
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.sync_upazila_administrative_areas(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_upazila_administrative_areas(text) TO service_role;
REVOKE ALL ON FUNCTION public.sync_upazila_administrative_areas_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_upazila_administrative_areas ON public.upazilas;
CREATE TRIGGER sync_upazila_administrative_areas
AFTER INSERT OR UPDATE OF bn, en, district_bn, district_en, division_bn, division_en, unions
ON public.upazilas FOR EACH ROW
EXECUTE FUNCTION public.sync_upazila_administrative_areas_trigger();

CREATE OR REPLACE FUNCTION public.sync_upazila_stations(_upazila_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  area_row public.upazilas%ROWTYPE;
  district_area_id text;
  station jsonb;
  station_type_value text;
BEGIN
  SELECT * INTO area_row FROM public.upazilas WHERE id = _upazila_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT district_id INTO district_area_id
  FROM public.administrative_areas
  WHERE level = 'upazila' AND upazila_id = _upazila_id
  LIMIT 1;
  IF district_area_id IS NULL THEN
    RAISE EXCEPTION 'Administrative district mapping missing for upazila %', _upazila_id;
  END IF;

  FOR station IN SELECT value FROM jsonb_array_elements(area_row.unions) LOOP
    IF station ->> 'id' IS NULL OR station ->> 'bn' IS NULL OR station ->> 'en' IS NULL THEN
      CONTINUE;
    END IF;
    station_type_value := CASE
      WHEN station ->> 'bn' LIKE '%পৌরসভা%' OR station ->> 'en' ILIKE '%pourashava%'
        THEN 'paurashava'
      ELSE 'union'
    END;
    INSERT INTO public.administrative_stations (
      upazila_id, station_id, district_id, name_bn, name_en, station_type
    )
    VALUES (
      _upazila_id, station ->> 'id', district_area_id,
      station ->> 'bn', station ->> 'en', station_type_value
    )
    ON CONFLICT (upazila_id, station_id) DO UPDATE SET
      district_id = EXCLUDED.district_id, name_bn = EXCLUDED.name_bn,
      name_en = EXCLUDED.name_en, station_type = EXCLUDED.station_type;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.sync_upazila_stations_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_upazila_stations(NEW.id);
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.sync_upazila_stations(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_upazila_stations(text) TO service_role;
REVOKE ALL ON FUNCTION public.sync_upazila_stations_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_upazila_stations ON public.upazilas;
CREATE TRIGGER sync_upazila_stations
AFTER INSERT OR UPDATE OF bn, en, district_bn, district_en, division_bn, division_en, unions
ON public.upazilas FOR EACH ROW
EXECUTE FUNCTION public.sync_upazila_stations_trigger();

CREATE OR REPLACE FUNCTION public.set_profile_station_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.station_id := NEW.union_id;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS set_profile_station_scope ON public.profiles;
CREATE TRIGGER set_profile_station_scope
BEFORE INSERT OR UPDATE OF upazila_id, union_id, station_id
ON public.profiles FOR EACH ROW
EXECUTE FUNCTION public.set_profile_station_scope();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_station_scope_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_station_scope_fkey
      FOREIGN KEY (upazila_id, station_id)
      REFERENCES public.administrative_stations(upazila_id, station_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS profiles_station_scope_idx
  ON public.profiles (district_id, upazila_id, station_id);

INSERT INTO public.upazilas AS existing_upazila (
  id, bn, en, district_bn, district_en, division_bn, division_en, unions
)
VALUES (
  'manirampur',
  'মণিরামপুর',
  'Manirampur',
  'যশোর',
  'Jashore',
  'খুলনা',
  'Khulna',
  '[
    {"id":"mn-pourashava","bn":"মণিরামপুর পৌরসভা","en":"Manirampur Pourashava","villages":[]},
    {"id":"mn-rohita","bn":"০১ নং রোহিতা","en":"01 No. Rohita","villages":[]},
    {"id":"mn-kashimnagar","bn":"০২ নং কাশিমনগর","en":"02 No. Kashimnagar","villages":[]},
    {"id":"mn-bhojgati","bn":"০৩ নং ভোজগাতি","en":"03 No. Bhojgati","villages":[]},
    {"id":"mn-dhakuria","bn":"০৪ নং ঢাকুরিয়া","en":"04 No. Dhakuria","villages":[]},
    {"id":"mn-haridaskati","bn":"০৫ নং হরিদাসকাটি","en":"05 No. Haridaskati","villages":[]},
    {"id":"mn-manirampur","bn":"০৬ নং মণিরামপুর","en":"06 No. Manirampur","villages":[]},
    {"id":"mn-khedapara","bn":"০৭ নং খেদাপাড়া","en":"07 No. Khedapara","villages":[]},
    {"id":"mn-hariharnagar","bn":"০৮ নং হরিহরনগর","en":"08 No. Hariharnagar","villages":[]},
    {"id":"mn-jhanpa","bn":"০৯ নং ঝাঁপা","en":"09 No. Jhanpa","villages":[]},
    {"id":"mn-moshmimnagar","bn":"১০ নং মশ্বিমনগর","en":"10 No. Moshmimnagar","villages":[]},
    {"id":"mn-chaluahati","bn":"১১ নং চালুয়াহাটি","en":"11 No. Chaluahati","villages":[]},
    {"id":"mn-shyamkur","bn":"১২ নং শ্যামকুড়","en":"12 No. Shyamkur","villages":[]},
    {"id":"mn-khanpur","bn":"১৩ নং খানপুর","en":"13 No. Khanpur","villages":[]},
    {"id":"mn-durbadanga","bn":"১৪ নং দুর্বাডাঙ্গা","en":"14 No. Durbadanga","villages":[]},
    {"id":"mn-kultia","bn":"১৫ নং কুলটিয়া","en":"15 No. Kultia","villages":[]},
    {"id":"mn-nehalpur","bn":"১৬ নং নেহালপুর","en":"16 No. Nehalpur","villages":[]},
    {"id":"mn-monoharpur","bn":"১৭ নং মনোহরপুর","en":"17 No. Monoharpur","villages":[]}
  ]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  bn = EXCLUDED.bn,
  en = EXCLUDED.en,
  district_bn = EXCLUDED.district_bn,
  district_en = EXCLUDED.district_en,
  division_bn = EXCLUDED.division_bn,
  division_en = EXCLUDED.division_en,
  unions = CASE
    WHEN jsonb_typeof(existing_upazila.unions) = 'array'
      AND jsonb_array_length(existing_upazila.unions) > 0
      THEN existing_upazila.unions
    ELSE EXCLUDED.unions
  END;

DO $$
DECLARE
  area_row record;
BEGIN
  FOR area_row IN SELECT id FROM public.upazilas LOOP
    PERFORM public.sync_upazila_administrative_areas(area_row.id);
  END LOOP;
  FOR area_row IN SELECT id FROM public.upazilas LOOP
    PERFORM public.sync_upazila_stations(area_row.id);
  END LOOP;
END
$$;

ALTER TABLE public.administrative_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.administrative_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.profiles, public.user_roles, public.audit_logs, public.login_attempts TO authenticated;
GRANT ALL ON public.profiles, public.user_roles, public.audit_logs, public.login_attempts TO service_role;
GRANT SELECT ON public.administrative_areas, public.administrative_stations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.administrative_areas TO authenticated;
GRANT ALL ON public.administrative_areas, public.administrative_stations TO service_role;
GRANT UPDATE (approval_status, status, active) ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "read areas" ON public.upazilas;
CREATE POLICY "read areas" ON public.upazilas
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "super adds areas" ON public.upazilas;
CREATE POLICY "super adds areas" ON public.upazilas
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super'));
DROP POLICY IF EXISTS "super edits areas" ON public.upazilas;
CREATE POLICY "super edits areas" ON public.upazilas
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super'))
  WITH CHECK (public.has_role(auth.uid(), 'super'));
DROP POLICY IF EXISTS "mfa gate write" ON public.upazilas;
CREATE POLICY "mfa gate write" ON public.upazilas AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.mfa_ok());
DROP POLICY IF EXISTS "mfa gate update" ON public.upazilas;
CREATE POLICY "mfa gate update" ON public.upazilas AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (public.mfa_ok()) WITH CHECK (public.mfa_ok());

DROP POLICY IF EXISTS "scoped profiles" ON public.profiles;
CREATE POLICY "scoped profiles" ON public.profiles
  FOR SELECT TO authenticated USING (
    id = auth.uid()
    OR public.has_role(auth.uid(), 'super')
    OR (public.has_role(auth.uid(), 'district') AND district_id = public.current_district())
    OR (public.has_role(auth.uid(), 'uno') AND upazila_id = public.current_upazila())
    OR (
      public.has_role(auth.uid(), 'admin')
      AND upazila_id = public.current_upazila()
      AND union_id = public.current_union()
    )
  );
DROP POLICY IF EXISTS "mfa gate" ON public.profiles;
CREATE POLICY "mfa gate" ON public.profiles AS RESTRICTIVE
  FOR SELECT TO authenticated USING (id = auth.uid() OR public.mfa_ok());
DROP POLICY IF EXISTS "union admins review field staff" ON public.profiles;
CREATE POLICY "union admins review field staff" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    approval_status = 'pending' AND public.mfa_ok()
    AND public.has_role(auth.uid(), 'admin')
    AND upazila_id = public.current_upazila()
    AND station_id = public.current_station()
    AND union_id = public.current_station()
    AND (public.has_role(id, 'worker') OR public.has_role(id, 'police'))
  )
  WITH CHECK (
    approval_status IN ('approved', 'rejected') AND public.mfa_ok()
    AND public.has_role(auth.uid(), 'admin')
    AND upazila_id = public.current_upazila()
    AND station_id = public.current_station()
    AND union_id = public.current_station()
    AND (public.has_role(id, 'worker') OR public.has_role(id, 'police'))
  );
DROP POLICY IF EXISTS "unos review union admins" ON public.profiles;
CREATE POLICY "unos review union admins" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    approval_status = 'pending' AND public.mfa_ok()
    AND public.has_role(auth.uid(), 'uno')
    AND upazila_id = public.current_upazila()
    AND public.has_role(id, 'admin')
  )
  WITH CHECK (
    approval_status IN ('approved', 'rejected') AND public.mfa_ok()
    AND public.has_role(auth.uid(), 'uno')
    AND upazila_id = public.current_upazila()
    AND public.has_role(id, 'admin')
  );
DROP POLICY IF EXISTS "super admins have full access" ON public.profiles;
CREATE POLICY "super admins have full access" ON public.profiles
  FOR ALL TO authenticated
  USING (
    public.mfa_ok()
    AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'owner'))
  )
  WITH CHECK (
    public.mfa_ok()
    AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'owner'))
  );

CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'owner') THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['approval_status', 'status', 'active'])
    IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['approval_status', 'status', 'active']) THEN
    RAISE EXCEPTION 'Only Super Admins and Owners may modify profile details';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS guard_profile_update ON public.profiles;
CREATE TRIGGER guard_profile_update
BEFORE UPDATE ON public.profiles FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_update();

DROP POLICY IF EXISTS "scoped roles" ON public.user_roles;
CREATE POLICY "scoped roles" ON public.user_roles
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'super')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'owner')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id
        AND (
          (public.has_role(auth.uid(), 'district') AND p.district_id = public.current_district())
          OR (public.has_role(auth.uid(), 'uno') AND p.upazila_id = public.current_upazila())
          OR (
            public.has_role(auth.uid(), 'admin')
            AND p.upazila_id = public.current_upazila()
            AND p.union_id = public.current_union()
          )
        )
    )
  );
DROP POLICY IF EXISTS "mfa gate" ON public.user_roles;
CREATE POLICY "mfa gate" ON public.user_roles AS RESTRICTIVE
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.mfa_ok());

DROP POLICY IF EXISTS "super reads audit" ON public.audit_logs;
CREATE POLICY "super reads audit" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super'));
DROP POLICY IF EXISTS "mfa gate" ON public.audit_logs;
CREATE POLICY "mfa gate" ON public.audit_logs AS RESTRICTIVE
  FOR SELECT TO authenticated USING (public.mfa_ok());
DROP POLICY IF EXISTS "super reads attempts" ON public.login_attempts;
CREATE POLICY "super reads attempts" ON public.login_attempts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super'));
DROP POLICY IF EXISTS "mfa gate" ON public.login_attempts;
CREATE POLICY "mfa gate" ON public.login_attempts AS RESTRICTIVE
  FOR SELECT TO authenticated USING (public.mfa_ok());

DROP POLICY IF EXISTS "read administrative area catalog" ON public.administrative_areas;
CREATE POLICY "read administrative area catalog" ON public.administrative_areas
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "super manages administrative area catalog" ON public.administrative_areas;
CREATE POLICY "super manages administrative area catalog" ON public.administrative_areas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super'))
  WITH CHECK (public.has_role(auth.uid(), 'super'));
DROP POLICY IF EXISTS "administrative areas require MFA" ON public.administrative_areas;
CREATE POLICY "administrative areas require MFA" ON public.administrative_areas AS RESTRICTIVE
  FOR ALL TO authenticated USING (public.mfa_ok()) WITH CHECK (public.mfa_ok());
DROP POLICY IF EXISTS "read administrative station catalog" ON public.administrative_stations;
CREATE POLICY "read administrative station catalog" ON public.administrative_stations
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "super manages administrative station catalog" ON public.administrative_stations;
CREATE POLICY "super manages administrative station catalog" ON public.administrative_stations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super'))
  WITH CHECK (public.has_role(auth.uid(), 'super'));
DROP POLICY IF EXISTS "administrative stations require MFA" ON public.administrative_stations;
CREATE POLICY "administrative stations require MFA" ON public.administrative_stations AS RESTRICTIVE
  FOR ALL TO authenticated USING (public.mfa_ok()) WITH CHECK (public.mfa_ok());

CREATE TABLE IF NOT EXISTS public.staff_registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 100),
  phone text CHECK (phone IS NULL OR phone ~ '^\+8801[0-9]{9}$'),
  email text,
  role text NOT NULL CHECK (role IN ('worker', 'police', 'admin', 'uno', 'district', 'super')),
  union_name text NOT NULL,
  upazila_id text NOT NULL DEFAULT 'manirampur'
    REFERENCES public.upazilas(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'provisioned', 'approved', 'rejected')),
  processing_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  processing_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  office_name text CHECK (
    office_name IS NULL OR char_length(btrim(office_name)) BETWEEN 1 AND 120
  ),
  category text NOT NULL,
  requested_position text,
  CONSTRAINT staff_registration_requests_contact_check CHECK (phone IS NOT NULL OR email IS NOT NULL),
  CONSTRAINT staff_registration_requests_email_check CHECK (
    email IS NULL OR char_length(email) <= 255
  ),
  CONSTRAINT staff_registration_requests_category_check CHECK (
    (category = 'স্বাস্থ্যকর্মী' AND role = 'worker' AND requested_position IS NULL)
    OR (category = 'গ্রাম পুলিশ' AND role = 'police' AND requested_position IS NULL)
    OR (category = 'ইউপি প্রশাসনিক কর্মকর্তা' AND role = 'admin' AND requested_position IS NULL)
    OR (
      category = 'উচ্চ পর্যায়ের নির্বাহী প্যানেল'
      AND requested_position IS NOT NULL
      AND (
        (requested_position = 'municipal_executive_officer' AND role = 'admin')
        OR (requested_position = 'uno' AND role = 'uno')
        OR (requested_position IN ('ddlg', 'dc', 'divisional_commissioner') AND role = 'district')
        OR (requested_position IN ('addl_registrar_general', 'registrar_general') AND role = 'super')
        OR (requested_position = 'city_corporation_ceo' AND role = 'admin')
      )
    )
  )
);

ALTER TABLE public.staff_registration_requests
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS office_name text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS requested_position text;
ALTER TABLE public.staff_registration_requests ALTER COLUMN phone DROP NOT NULL;

UPDATE public.staff_registration_requests
SET category = CASE
  WHEN role = 'worker' THEN 'স্বাস্থ্যকর্মী'
  WHEN role = 'police' THEN 'গ্রাম পুলিশ'
  WHEN role = 'admin' THEN 'ইউপি প্রশাসনিক কর্মকর্তা'
  WHEN role = 'uno' THEN 'উচ্চ পর্যায়ের নির্বাহী প্যানেল'
  WHEN role IN ('district', 'super') THEN 'উচ্চ পর্যায়ের নির্বাহী প্যানেল'
  ELSE category
END
WHERE category IS NULL OR category = 'উচ্চপর্যায়ের নির্বাহী প্যানেল';

UPDATE public.staff_registration_requests
SET requested_position = 'uno'
WHERE role = 'uno' AND category = 'উচ্চ পর্যায়ের নির্বাহী প্যানেল'
  AND requested_position IS NULL;

ALTER TABLE public.staff_registration_requests ALTER COLUMN category SET NOT NULL;
ALTER TABLE public.staff_registration_requests
  DROP CONSTRAINT IF EXISTS staff_registration_requests_status_check,
  DROP CONSTRAINT IF EXISTS staff_registration_requests_role_check,
  DROP CONSTRAINT IF EXISTS staff_registration_requests_category_check,
  DROP CONSTRAINT IF EXISTS staff_registration_requests_contact_check,
  DROP CONSTRAINT IF EXISTS staff_registration_requests_email_check,
  DROP CONSTRAINT IF EXISTS staff_registration_requests_office_name_check,
  DROP CONSTRAINT IF EXISTS staff_registration_requests_phone_check,
  ADD CONSTRAINT staff_registration_requests_status_check
    CHECK (status IN ('pending', 'processing', 'provisioned', 'approved', 'rejected')),
  ADD CONSTRAINT staff_registration_requests_role_check
    CHECK (role IN ('worker', 'police', 'admin', 'uno', 'district', 'super')),
  ADD CONSTRAINT staff_registration_requests_phone_check
    CHECK (phone IS NULL OR phone ~ '^\+8801[0-9]{9}$'),
  ADD CONSTRAINT staff_registration_requests_contact_check
    CHECK (phone IS NOT NULL OR email IS NOT NULL),
  ADD CONSTRAINT staff_registration_requests_email_check
    CHECK (email IS NULL OR (email = lower(btrim(email)) AND char_length(email) <= 255)),
  ADD CONSTRAINT staff_registration_requests_office_name_check
    CHECK (office_name IS NULL OR char_length(btrim(office_name)) BETWEEN 1 AND 120),
  ADD CONSTRAINT staff_registration_requests_category_check CHECK (
    (category = 'স্বাস্থ্যকর্মী' AND role = 'worker' AND requested_position IS NULL)
    OR (category = 'গ্রাম পুলিশ' AND role = 'police' AND requested_position IS NULL)
    OR (category = 'ইউপি প্রশাসনিক কর্মকর্তা' AND role = 'admin' AND requested_position IS NULL)
    OR (
      category = 'উচ্চ পর্যায়ের নির্বাহী প্যানেল'
      AND requested_position IS NOT NULL
      AND (
        (requested_position = 'municipal_executive_officer' AND role = 'admin')
        OR (requested_position = 'uno' AND role = 'uno')
        OR (requested_position IN ('ddlg', 'dc', 'divisional_commissioner') AND role = 'district')
        OR (requested_position IN ('addl_registrar_general', 'registrar_general') AND role = 'super')
        OR (requested_position = 'city_corporation_ceo' AND role = 'admin')
      )
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS staff_registration_requests_pending_phone_idx
  ON public.staff_registration_requests (phone)
  WHERE phone IS NOT NULL AND status IN ('pending', 'processing', 'approved');
CREATE UNIQUE INDEX IF NOT EXISTS staff_registration_requests_pending_email_idx
  ON public.staff_registration_requests (lower(email))
  WHERE email IS NOT NULL AND status IN ('pending', 'processing', 'approved');
CREATE INDEX IF NOT EXISTS staff_registration_requests_scope_idx
  ON public.staff_registration_requests (upazila_id, union_name, created_at)
  WHERE status = 'pending';

ALTER TABLE public.staff_registration_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_registration_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staff_registration_requests TO service_role;

NOTIFY pgrst, 'reload schema';
