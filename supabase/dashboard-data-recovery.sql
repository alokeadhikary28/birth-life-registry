-- Recover the dashboard's missing case/notice relations on the partially
-- bootstrapped schema described in README.md.
--
-- This does not replace the Drizzle migration history, apply migrations
-- omitted from its journal, or create Storage buckets/policies and other
-- feature tables. It expects the
-- existing profiles, user_roles, upazilas, administrative_areas,
-- administrative_stations, and audit_logs tables to match this project's
-- schema. The preflight checks fail the transaction rather than guessing.

BEGIN;

DO $preflight$
DECLARE
  missing_columns text;
  missing_roles text;
BEGIN
  IF to_regtype('public.app_role') IS NULL THEN
    RAISE EXCEPTION 'Missing public.app_role; reconcile the core migrations first';
  END IF;

  SELECT string_agg(required.role_name, ', ')
  INTO missing_roles
  FROM (VALUES ('worker'), ('admin'), ('police'), ('uno'), ('super'), ('district'))
    AS required(role_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'app_role'
      AND e.enumlabel = required.role_name
  );
  IF missing_roles IS NOT NULL THEN
    RAISE EXCEPTION 'public.app_role is missing required labels: %', missing_roles;
  END IF;

  SELECT string_agg(required.table_name || '.' || required.column_name, ', ')
  INTO missing_columns
  FROM (VALUES
    ('profiles', 'id'),
    ('profiles', 'active'),
    ('profiles', 'upazila_id'),
    ('profiles', 'union_id'),
    ('profiles', 'ward'),
    ('profiles', 'district_id'),
    ('profiles', 'station_id'),
    ('user_roles', 'user_id'),
    ('user_roles', 'role'),
    ('upazilas', 'id'),
    ('upazilas', 'district_en'),
    ('upazilas', 'unions'),
    ('administrative_areas', 'id'),
    ('administrative_stations', 'upazila_id'),
    ('administrative_stations', 'station_id'),
    ('administrative_stations', 'district_id'),
    ('audit_logs', 'at'),
    ('audit_logs', 'user_id'),
    ('audit_logs', 'action'),
    ('audit_logs', 'case_id'),
    ('audit_logs', 'details')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = required.table_name
      AND c.column_name = required.column_name
  );

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Dashboard recovery prerequisites missing columns: %', missing_columns;
  END IF;

  IF to_regclass('public.cases') IS NOT NULL THEN
    SELECT string_agg(required.column_name, ', ')
    INTO missing_columns
    FROM (VALUES
      ('id'), ('client_id'), ('type'), ('name_bn'), ('name_en'),
      ('father_bn'), ('father_en'), ('mother_bn'), ('mother_en'), ('nid'),
      ('gender'), ('dob'), ('child_order'), ('dod'), ('cause_bn'), ('cause_en'),
      ('village_id'), ('files'), ('files_purged'), ('status'), ('reg_no'),
      ('police_task'), ('created_by'), ('upazila_id'), ('union_id'), ('ward'),
      ('sms_sent'), ('created_at'), ('completed_at'), ('parent_mobile'),
      ('details'), ('district_id'), ('station_id')
    ) AS required(column_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cases'
        AND c.column_name = required.column_name
    );
    IF missing_columns IS NOT NULL THEN
      RAISE EXCEPTION 'public.cases already exists with an incomplete schema; missing columns: %', missing_columns;
    END IF;
  END IF;

  IF to_regclass('public.case_remarks') IS NOT NULL
     AND (
       NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'case_remarks' AND column_name = 'id')
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'case_remarks' AND column_name = 'case_id')
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'case_remarks' AND column_name = 'author')
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'case_remarks' AND column_name = 'role')
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'case_remarks' AND column_name = 'text')
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'case_remarks' AND column_name = 'created_at')
     ) THEN
    RAISE EXCEPTION 'public.case_remarks already exists with an incomplete schema';
  END IF;

  IF to_regclass('public.upazila_announcements') IS NOT NULL
     AND (
       NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'upazila_announcements' AND column_name = 'upazila_id')
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'upazila_announcements' AND column_name = 'notice_bn')
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'upazila_announcements' AND column_name = 'notice_en')
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'upazila_announcements' AND column_name = 'active')
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'upazila_announcements' AND column_name = 'updated_by')
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'upazila_announcements' AND column_name = 'updated_at')
     ) THEN
    RAISE EXCEPTION 'public.upazila_announcements already exists with an incomplete schema';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.mfa_ok()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role::text IN ('admin', 'district', 'uno', 'super', 'super_admin', 'owner')
  )
  OR COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

CREATE OR REPLACE FUNCTION public.current_upazila()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT upazila_id FROM public.profiles WHERE id = auth.uid() AND active
$$;

CREATE OR REPLACE FUNCTION public.current_union()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT union_id FROM public.profiles WHERE id = auth.uid() AND active
$$;

CREATE OR REPLACE FUNCTION public.current_ward()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ward FROM public.profiles WHERE id = auth.uid() AND active
$$;

CREATE OR REPLACE FUNCTION public.current_district()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT district_id FROM public.profiles WHERE id = auth.uid() AND active
$$;

CREATE OR REPLACE FUNCTION public.current_station()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT station_id FROM public.profiles WHERE id = auth.uid() AND active
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mfa_ok() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_upazila() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_union() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_ward() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_district() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_station() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mfa_ok() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_upazila() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_union() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_ward() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_district() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_station() TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text UNIQUE,
  type text NOT NULL CHECK (type IN ('birth', 'death')),
  name_bn text NOT NULL,
  name_en text NOT NULL,
  father_bn text NOT NULL,
  father_en text NOT NULL,
  mother_bn text NOT NULL,
  mother_en text NOT NULL,
  nid text,
  gender text NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  dob date NOT NULL,
  child_order text,
  dod date,
  cause_bn text,
  cause_en text,
  village_id text NOT NULL,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  files_purged boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT cases_status_check CHECK (status IN ('pending', 'progress', 'completed', 'rejected')),
  reg_no text,
  police_task jsonb,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  upazila_id text NOT NULL,
  union_id text NOT NULL,
  ward integer NOT NULL DEFAULT 1,
  sms_sent boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  parent_mobile text
    CHECK (parent_mobile IS NULL OR parent_mobile ~ '^01[3-9][0-9]{8}$'),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
    CONSTRAINT cases_details_size CHECK (pg_column_size(details) < 8000),
  district_id text NOT NULL REFERENCES public.administrative_areas(id),
  station_id text NOT NULL,
  CONSTRAINT cases_nid_valid_by_type CHECK (
    (type = 'death' AND nid ~ '^(\d{10}|\d{13}|\d{17})$')
    OR (type = 'birth' AND (nid IS NULL OR nid ~ '^(\d{10}|\d{13}|\d{17})$'))
  ),
  CONSTRAINT cases_station_scope_fkey
    FOREIGN KEY (upazila_id, station_id)
    REFERENCES public.administrative_stations(upazila_id, station_id),
  CONSTRAINT cases_station_matches_union CHECK (station_id = union_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS cases_birth_unique
  ON public.cases (nid, COALESCE(child_order, ''))
  WHERE type = 'birth';
CREATE UNIQUE INDEX IF NOT EXISTS cases_death_unique
  ON public.cases (nid)
  WHERE type = 'death';
CREATE UNIQUE INDEX IF NOT EXISTS cases_birth_no_nid_unique
  ON public.cases (
    upazila_id, union_id, ward, lower(name_bn), lower(name_en), dob,
    lower(father_bn), lower(father_en), lower(mother_bn), lower(mother_en),
    COALESCE(child_order, '')
  )
  WHERE type = 'birth' AND nid IS NULL;
CREATE INDEX IF NOT EXISTS cases_scope_idx
  ON public.cases (upazila_id, union_id, ward);
CREATE INDEX IF NOT EXISTS cases_geo_station_scope_idx
  ON public.cases (district_id, upazila_id, station_id, ward);

CREATE TABLE IF NOT EXISTS public.case_remarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  author uuid NOT NULL DEFAULT auth.uid(),
  role public.app_role NOT NULL,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS case_remarks_case_created_idx
  ON public.case_remarks (case_id, created_at, id);

CREATE TABLE IF NOT EXISTS public.upazila_announcements (
  upazila_id text PRIMARY KEY REFERENCES public.upazilas(id) ON DELETE CASCADE,
  notice_bn text NOT NULL DEFAULT '' CHECK (char_length(notice_bn) <= 500),
  notice_en text NOT NULL DEFAULT '' CHECK (char_length(notice_en) <= 500),
  active boolean NOT NULL DEFAULT true,
  updated_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_case_station_scope()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  station_district_id text;
BEGIN
  SELECT district_id INTO station_district_id
  FROM public.administrative_stations
  WHERE upazila_id = NEW.upazila_id
    AND station_id = NEW.union_id;

  IF station_district_id IS NULL THEN
    RAISE EXCEPTION 'Station % is not registered in upazila %', NEW.union_id, NEW.upazila_id;
  END IF;

  NEW.station_id := NEW.union_id;
  NEW.district_id := station_district_id;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.guard_assigned_village()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.upazilas u
    CROSS JOIN LATERAL jsonb_array_elements(u.unions) AS assigned_union(value)
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(assigned_union.value -> 'villages', '[]'::jsonb)
    ) AS assigned_village(value)
    WHERE u.id = NEW.upazila_id
      AND assigned_union.value ->> 'id' = NEW.union_id
      AND assigned_village.value ->> 'id' = NEW.village_id
  ) THEN
    RAISE EXCEPTION 'Village must belong to the assigned union and upazila';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.guard_case_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'worker'::public.app_role) THEN
    IF OLD.created_by <> auth.uid() OR OLD.status IN ('completed', 'rejected') THEN
      RAISE EXCEPTION 'Workers may only correct their own unregistered entries';
    END IF;
    IF (NEW.status, NEW.reg_no, NEW.completed_at, NEW.police_task, NEW.files_purged,
        NEW.created_by, NEW.upazila_id, NEW.union_id, NEW.ward, NEW.created_at, NEW.client_id)
       IS DISTINCT FROM
       (OLD.status, OLD.reg_no, OLD.completed_at, OLD.police_task, OLD.files_purged,
        OLD.created_by, OLD.upazila_id, OLD.union_id, OLD.ward, OLD.created_at, OLD.client_id) THEN
      RAISE EXCEPTION 'Workers may only correct registration entry fields';
    END IF;
  ELSIF public.has_role(auth.uid(), 'police'::public.app_role) THEN
    IF OLD.upazila_id <> public.current_upazila()
      OR OLD.union_id <> public.current_union()
      OR OLD.ward <> public.current_ward()
      OR OLD.status IN ('completed', 'rejected')
    THEN
      RAISE EXCEPTION 'Village police may only correct open cases in their assigned ward';
    END IF;
    IF (NEW.status, NEW.reg_no, NEW.completed_at, NEW.police_task, NEW.files_purged,
        NEW.created_by, NEW.upazila_id, NEW.union_id, NEW.ward, NEW.created_at, NEW.client_id)
       IS DISTINCT FROM
       (OLD.status, OLD.reg_no, OLD.completed_at, OLD.police_task, OLD.files_purged,
        OLD.created_by, OLD.upazila_id, OLD.union_id, OLD.ward, OLD.created_at, OLD.client_id) THEN
      RAISE EXCEPTION 'Village police may only correct case details';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.upazilas u
      CROSS JOIN LATERAL jsonb_array_elements(u.unions) AS assigned_union(value)
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(assigned_union.value -> 'villages', '[]'::jsonb)
      ) AS assigned_village(value)
      WHERE u.id = NEW.upazila_id
        AND assigned_union.value ->> 'id' = NEW.union_id
        AND assigned_village.value ->> 'id' = NEW.village_id
        AND (assigned_village.value ->> 'ward')::integer = public.current_ward()
    ) THEN
      RAISE EXCEPTION 'Village police may only select a village in their assigned ward';
    END IF;
  ELSE
    IF (NEW.type, NEW.name_bn, NEW.name_en, NEW.father_bn, NEW.father_en, NEW.mother_bn,
        NEW.mother_en, NEW.nid, NEW.gender, NEW.dob, NEW.child_order, NEW.dod, NEW.cause_bn,
        NEW.cause_en, NEW.village_id, NEW.parent_mobile, NEW.files, NEW.files_purged,
        NEW.created_by, NEW.upazila_id, NEW.union_id, NEW.ward, NEW.created_at, NEW.client_id,
        NEW.details)
       IS DISTINCT FROM
       (OLD.type, OLD.name_bn, OLD.name_en, OLD.father_bn, OLD.father_en, OLD.mother_bn,
        OLD.mother_en, OLD.nid, OLD.gender, OLD.dob, OLD.child_order, OLD.dod, OLD.cause_bn,
        OLD.cause_en, OLD.village_id, OLD.parent_mobile, OLD.files, OLD.files_purged,
        OLD.created_by, OLD.upazila_id, OLD.union_id, OLD.ward, OLD.created_at, OLD.client_id,
        OLD.details) THEN
      RAISE EXCEPTION 'Original application fields cannot be modified by this role';
    END IF;
    IF NOT public.has_role(auth.uid(), 'admin'::public.app_role)
       AND (NEW.status, NEW.reg_no, NEW.completed_at)
           IS DISTINCT FROM (OLD.status, OLD.reg_no, OLD.completed_at) THEN
      RAISE EXCEPTION 'Only administrative officers can change registration status';
    END IF;
  END IF;

  IF NEW.status = 'completed' THEN
    IF NEW.reg_no IS NULL OR NEW.reg_no !~ '^\d{17}$' THEN
      RAISE EXCEPTION 'A 17-digit government registration number is required';
    END IF;
    IF OLD.status <> 'completed' THEN NEW.completed_at := now(); END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.audit_case()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  field_changes jsonb;
  request_headers jsonb :=
    COALESCE(NULLIF(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  user_agent text := lower(COALESCE(request_headers ->> 'user-agent', ''));
  client_hint text;
BEGIN
  client_hint := CASE
    WHEN user_agent ~ '(android|iphone|ipod|mobile)' THEN 'Mobile web'
    WHEN user_agent ~ '(ipad|tablet)' THEN 'Tablet web'
    ELSE 'Web browser'
  END;

  IF TG_TABLE_NAME = 'cases' AND TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(user_id, action, case_id, details)
    VALUES (auth.uid(), 'create:' || NEW.type, NEW.id,
      jsonb_build_object('client_hint', client_hint));
  ELSIF TG_TABLE_NAME = 'cases' THEN
    SELECT COALESCE(
      jsonb_object_agg(
        old_field.key,
        jsonb_build_object('old', old_field.value, 'new', new_field.value)
      ),
      '{}'::jsonb
    )
    INTO field_changes
    FROM jsonb_each(to_jsonb(OLD)) AS old_field(key, value)
    JOIN jsonb_each(to_jsonb(NEW)) AS new_field(key, value) USING (key)
    WHERE old_field.value IS DISTINCT FROM new_field.value
      AND old_field.key IN (
        'name_bn', 'name_en', 'father_bn', 'father_en', 'mother_bn', 'mother_en',
        'nid', 'parent_mobile', 'gender', 'dob', 'child_order', 'dod',
        'cause_bn', 'cause_en', 'village_id', 'details', 'status', 'reg_no', 'police_task'
      );
    INSERT INTO public.audit_logs(user_id, action, case_id, details)
    VALUES (auth.uid(), 'update', NEW.id, jsonb_build_object(
      'status', jsonb_build_array(OLD.status, NEW.status),
      'reg_no', NEW.reg_no,
      'police_task', NEW.police_task,
      'changes', field_changes,
      'client_hint', client_hint
    ));
  ELSE
    INSERT INTO public.audit_logs(user_id, action, case_id, details)
    VALUES (auth.uid(), 'remark', NEW.case_id,
      jsonb_build_object('role', NEW.role, 'client_hint', client_hint));
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.case_history(p_case_id uuid)
RETURNS TABLE (
  at timestamptz,
  id bigint,
  action text,
  user_id uuid,
  role text,
  status_from text,
  status_to text,
  client_hint text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.mfa_ok() THEN
    RAISE EXCEPTION 'MFA verification required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.id = p_case_id
      AND (
        public.has_role(auth.uid(), 'super'::public.app_role)
        OR (
          public.has_role(auth.uid(), 'district'::public.app_role)
          AND EXISTS (
            SELECT 1 FROM public.upazilas u
            WHERE u.id = c.upazila_id AND u.district_en = public.current_district()
          )
        )
        OR (
          c.upazila_id = public.current_upazila()
          AND (
            public.has_role(auth.uid(), 'uno'::public.app_role)
            OR (
              c.union_id = public.current_union()
              AND (
                public.has_role(auth.uid(), 'admin'::public.app_role)
                OR (
                  public.has_role(auth.uid(), 'police'::public.app_role)
                  AND c.ward = public.current_ward()
                )
                OR c.created_by = auth.uid()
              )
            )
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'Not authorized to read this case history';
  END IF;

  RETURN QUERY
  SELECT a.at, a.id, a.action, a.user_id, a.details ->> 'role',
         a.details -> 'status' ->> 0, a.details -> 'status' ->> 1,
         a.details ->> 'client_hint'
  FROM public.audit_logs a
  WHERE a.case_id = p_case_id
    AND (a.action IN ('update', 'remark') OR a.action LIKE 'create:%')
  ORDER BY a.at;
END
$$;

CREATE OR REPLACE FUNCTION public.touch_upazila_announcement()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS set_case_station_scope ON public.cases;
CREATE TRIGGER set_case_station_scope
BEFORE INSERT OR UPDATE OF upazila_id, union_id, station_id, district_id
ON public.cases FOR EACH ROW
EXECUTE FUNCTION public.set_case_station_scope();

DROP TRIGGER IF EXISTS cases_validate_assigned_village ON public.cases;
CREATE TRIGGER cases_validate_assigned_village
BEFORE INSERT OR UPDATE ON public.cases FOR EACH ROW
EXECUTE FUNCTION public.guard_assigned_village();

DROP TRIGGER IF EXISTS cases_guard ON public.cases;
CREATE TRIGGER cases_guard
BEFORE UPDATE ON public.cases FOR EACH ROW
EXECUTE FUNCTION public.guard_case_update();

DROP TRIGGER IF EXISTS cases_audit ON public.cases;
CREATE TRIGGER cases_audit
AFTER INSERT OR UPDATE ON public.cases FOR EACH ROW
EXECUTE FUNCTION public.audit_case();

DROP TRIGGER IF EXISTS remarks_audit ON public.case_remarks;
CREATE TRIGGER remarks_audit
AFTER INSERT ON public.case_remarks FOR EACH ROW
EXECUTE FUNCTION public.audit_case();

DROP TRIGGER IF EXISTS upazila_announcement_updated_at ON public.upazila_announcements;
CREATE TRIGGER upazila_announcement_updated_at
BEFORE UPDATE ON public.upazila_announcements FOR EACH ROW
EXECUTE FUNCTION public.touch_upazila_announcement();

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_remarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upazila_announcements ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.cases TO authenticated;
GRANT ALL ON public.cases TO service_role;
GRANT SELECT, INSERT ON public.case_remarks TO authenticated;
GRANT ALL ON public.case_remarks TO service_role;
GRANT SELECT ON public.upazila_announcements TO anon, authenticated;
GRANT INSERT, UPDATE ON public.upazila_announcements TO authenticated;
GRANT ALL ON public.upazila_announcements TO service_role;
GRANT EXECUTE ON FUNCTION public.case_history(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.case_history(uuid) FROM PUBLIC, anon;

DROP POLICY IF EXISTS "scoped case read" ON public.cases;
CREATE POLICY "scoped case read" ON public.cases
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'district'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.upazilas u
      WHERE u.id = cases.upazila_id
        AND u.district_en = public.current_district()
    )
  )
  OR (
    upazila_id = public.current_upazila()
    AND (
      public.has_role(auth.uid(), 'uno'::public.app_role)
      OR (
        station_id = public.current_station()
        AND union_id = public.current_station()
        AND (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR (
            public.has_role(auth.uid(), 'police'::public.app_role)
            AND ward = public.current_ward()
          )
          OR created_by = auth.uid()
        )
      )
    )
  )
);

DROP POLICY IF EXISTS "workers create" ON public.cases;
CREATE POLICY "workers create" ON public.cases
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'worker'::public.app_role)
  AND created_by = auth.uid()
  AND upazila_id = public.current_upazila()
  AND station_id = public.current_station()
  AND union_id = public.current_station()
  AND ward = public.current_ward()
  AND status = 'pending'
  AND reg_no IS NULL
  AND police_task IS NULL
);

DROP POLICY IF EXISTS "police create own area cases" ON public.cases;
CREATE POLICY "police create own area cases" ON public.cases
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'police'::public.app_role)
  AND created_by = auth.uid()
  AND upazila_id = public.current_upazila()
  AND station_id = public.current_station()
  AND union_id = public.current_station()
  AND ward = public.current_ward()
  AND status = 'pending'
  AND reg_no IS NULL
  AND police_task IS NULL
);

DROP POLICY IF EXISTS "admin or police update" ON public.cases;
DROP POLICY IF EXISTS "admin or assigned police update" ON public.cases;
CREATE POLICY "admin or police update" ON public.cases
FOR UPDATE TO authenticated
USING (
  upazila_id = public.current_upazila()
  AND station_id = public.current_station()
  AND union_id = public.current_station()
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'police'::public.app_role)
      AND ward = public.current_ward()
      AND police_task IS NOT NULL
    )
  )
)
WITH CHECK (
  upazila_id = public.current_upazila()
  AND station_id = public.current_station()
  AND union_id = public.current_station()
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'police'::public.app_role)
      AND ward = public.current_ward()
      AND police_task IS NOT NULL
    )
  )
);

DROP POLICY IF EXISTS "workers correct own pending cases" ON public.cases;
CREATE POLICY "workers correct own pending cases" ON public.cases
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'worker'::public.app_role)
  AND created_by = auth.uid()
  AND upazila_id = public.current_upazila()
  AND station_id = public.current_station()
  AND union_id = public.current_station()
  AND status NOT IN ('completed', 'rejected')
)
WITH CHECK (
  public.has_role(auth.uid(), 'worker'::public.app_role)
  AND created_by = auth.uid()
  AND upazila_id = public.current_upazila()
  AND station_id = public.current_station()
  AND union_id = public.current_station()
  AND ward = public.current_ward()
  AND status NOT IN ('completed', 'rejected')
);

DROP POLICY IF EXISTS "police correct pending cases in assigned ward" ON public.cases;
CREATE POLICY "police correct pending cases in assigned ward" ON public.cases
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'police'::public.app_role)
  AND upazila_id = public.current_upazila()
  AND station_id = public.current_station()
  AND union_id = public.current_station()
  AND ward = public.current_ward()
  AND status NOT IN ('completed', 'rejected')
)
WITH CHECK (
  public.has_role(auth.uid(), 'police'::public.app_role)
  AND upazila_id = public.current_upazila()
  AND station_id = public.current_station()
  AND union_id = public.current_station()
  AND ward = public.current_ward()
  AND status NOT IN ('completed', 'rejected')
);

DROP POLICY IF EXISTS "mfa gate" ON public.cases;
CREATE POLICY "mfa gate" ON public.cases
AS RESTRICTIVE FOR ALL TO authenticated
USING (public.mfa_ok())
WITH CHECK (public.mfa_ok());

DROP POLICY IF EXISTS "read remarks of visible cases" ON public.case_remarks;
CREATE POLICY "read remarks of visible cases" ON public.case_remarks
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id));

DROP POLICY IF EXISTS "admin/uno add remarks" ON public.case_remarks;
CREATE POLICY "admin/uno add remarks" ON public.case_remarks
FOR INSERT TO authenticated
WITH CHECK (
  author = auth.uid()
  AND role IN ('admin'::public.app_role, 'uno'::public.app_role)
  AND public.has_role(auth.uid(), role)
  AND EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id)
);

DROP POLICY IF EXISTS "mfa gate" ON public.case_remarks;
CREATE POLICY "mfa gate" ON public.case_remarks
AS RESTRICTIVE FOR ALL TO authenticated
USING (public.mfa_ok())
WITH CHECK (public.mfa_ok());

DROP POLICY IF EXISTS "read active scoped announcements" ON public.upazila_announcements;
DROP POLICY IF EXISTS "read active announcements" ON public.upazila_announcements;
CREATE POLICY "read active announcements" ON public.upazila_announcements
FOR SELECT TO anon
USING (active = true);

CREATE POLICY "read active scoped announcements" ON public.upazila_announcements
FOR SELECT TO authenticated
USING (
  active = true
  OR (
    public.mfa_ok()
    AND (
      public.has_role(auth.uid(), 'super'::public.app_role)
      OR public.has_role(auth.uid(), 'district'::public.app_role)
      OR (
        public.has_role(auth.uid(), 'uno'::public.app_role)
        AND upazila_id = public.current_upazila()
      )
    )
  )
);

DROP POLICY IF EXISTS "uno creates own announcement" ON public.upazila_announcements;
CREATE POLICY "uno creates own announcement" ON public.upazila_announcements
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'uno'::public.app_role)
  AND upazila_id = public.current_upazila()
  AND updated_by = auth.uid()
);

DROP POLICY IF EXISTS "uno updates own announcement" ON public.upazila_announcements;
CREATE POLICY "uno updates own announcement" ON public.upazila_announcements
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'uno'::public.app_role)
  AND upazila_id = public.current_upazila()
)
WITH CHECK (
  public.has_role(auth.uid(), 'uno'::public.app_role)
  AND upazila_id = public.current_upazila()
  AND updated_by = auth.uid()
);

DROP POLICY IF EXISTS "mfa gate select" ON public.upazila_announcements;
CREATE POLICY "mfa gate select" ON public.upazila_announcements
AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.mfa_ok());

DROP POLICY IF EXISTS "mfa gate" ON public.upazila_announcements;
CREATE POLICY "mfa gate" ON public.upazila_announcements
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (public.mfa_ok());

DROP POLICY IF EXISTS "mfa gate update" ON public.upazila_announcements;
CREATE POLICY "mfa gate update" ON public.upazila_announcements
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.mfa_ok())
WITH CHECK (public.mfa_ok());

REVOKE ALL ON FUNCTION public.case_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.case_history(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
