DROP POLICY "scoped case read" ON public.cases;
CREATE POLICY "scoped case read" ON public.cases FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'super')
  OR (
    public.has_role(auth.uid(), 'district')
    AND EXISTS (
      SELECT 1
      FROM public.upazilas u
      WHERE u.id = cases.upazila_id
        AND u.district_en = public.current_district()
    )
  )
  OR (
    upazila_id = public.current_upazila()
    AND (
      public.has_role(auth.uid(), 'uno')
      OR (
        station_id = public.current_station()
        AND union_id = public.current_station()
        AND (
          public.has_role(auth.uid(), 'admin')
          OR (
            public.has_role(auth.uid(), 'police')
            AND ward = public.current_ward()
            AND (
              created_by = auth.uid()
              OR police_task ->> 'assignedPoliceId' = auth.uid()::text
              OR (
                police_task IS NOT NULL
                AND police_task ->> 'assignedPoliceId' IS NULL
              )
            )
          )
          OR created_by = auth.uid()
        )
      )
    )
  )
);

DROP POLICY "admin or police update" ON public.cases;
CREATE POLICY "admin or assigned police update" ON public.cases FOR UPDATE TO authenticated
  USING (
    upazila_id = public.current_upazila()
    AND station_id = public.current_station()
    AND union_id = public.current_station()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (
        public.has_role(auth.uid(), 'police')
        AND ward = public.current_ward()
        AND (
          police_task ->> 'assignedPoliceId' = auth.uid()::text
          OR (
            police_task IS NOT NULL
            AND police_task ->> 'assignedPoliceId' IS NULL
          )
        )
      )
    )
  )
  WITH CHECK (
    upazila_id = public.current_upazila()
    AND station_id = public.current_station()
    AND union_id = public.current_station()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (
        public.has_role(auth.uid(), 'police')
        AND ward = public.current_ward()
        AND (
          police_task ->> 'assignedPoliceId' = auth.uid()::text
          OR (
            police_task IS NOT NULL
            AND police_task ->> 'assignedPoliceId' IS NULL
          )
        )
      )
    )
  );

DROP POLICY "police upload own area case files" ON storage.objects;
CREATE POLICY "police upload own or assigned case files" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'case-files'
    AND public.has_role(auth.uid(), 'police')
    AND (storage.foldername(name))[1] = public.current_upazila()
    AND (storage.foldername(name))[2] = public.current_union()
    AND EXISTS (
      SELECT 1
      FROM public.cases c
      WHERE c.id::text = (storage.foldername(name))[3]
        AND (
          c.created_by = auth.uid()
          OR (
            c.police_task ->> 'assignedPoliceId' = auth.uid()::text
            AND name LIKE c.upazila_id || '/' || c.union_id || '/' || c.id::text || '/field-visit-day-%'
          )
        )
    )
  );

CREATE POLICY "assigned police remove failed visit uploads" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'case-files'
    AND public.has_role(auth.uid(), 'police')
    AND EXISTS (
      SELECT 1
      FROM public.cases c
      WHERE c.id::text = (storage.foldername(name))[3]
        AND c.upazila_id = public.current_upazila()
        AND c.union_id = public.current_union()
        AND c.ward = public.current_ward()
        AND c.police_task ->> 'assignedPoliceId' = auth.uid()::text
        AND name LIKE c.upazila_id || '/' || c.union_id || '/' || c.id::text || '/field-visit-day-%'
    )
  );

CREATE OR REPLACE FUNCTION public.guard_case_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old_days jsonb;
  new_days jsonb;
  old_day_count integer;
  added_day jsonb;
  assignment_valid boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF public.has_role(auth.uid(), 'worker') THEN
    IF OLD.created_by <> auth.uid() OR OLD.status = 'completed' OR OLD.status = 'rejected' THEN
      RAISE EXCEPTION 'Workers may only correct their own unregistered entries';
    END IF;
    IF (NEW.status, NEW.reg_no, NEW.completed_at, NEW.police_task, NEW.files_purged, NEW.created_by,
        NEW.upazila_id, NEW.union_id, NEW.ward, NEW.created_at, NEW.client_id)
       IS DISTINCT FROM
       (OLD.status, OLD.reg_no, OLD.completed_at, OLD.police_task, OLD.files_purged, OLD.created_by,
        OLD.upazila_id, OLD.union_id, OLD.ward, OLD.created_at, OLD.client_id) THEN
      RAISE EXCEPTION 'Workers may only correct registration entry fields';
    END IF;
  ELSE
    IF (NEW.type, NEW.name_bn, NEW.name_en, NEW.father_bn, NEW.father_en, NEW.mother_bn, NEW.mother_en,
        NEW.nid, NEW.gender, NEW.dob, NEW.child_order, NEW.dod, NEW.cause_bn, NEW.cause_en,
        NEW.village_id, NEW.parent_mobile, NEW.files, NEW.files_purged, NEW.created_by, NEW.upazila_id,
        NEW.union_id, NEW.ward, NEW.created_at, NEW.client_id, NEW.details)
       IS DISTINCT FROM
       (OLD.type, OLD.name_bn, OLD.name_en, OLD.father_bn, OLD.father_en, OLD.mother_bn, OLD.mother_en,
        OLD.nid, OLD.gender, OLD.dob, OLD.child_order, OLD.dod, OLD.cause_bn, OLD.cause_en,
        OLD.village_id, OLD.parent_mobile, OLD.files, OLD.files_purged, OLD.created_by, OLD.upazila_id,
        OLD.union_id, OLD.ward, OLD.created_at, OLD.client_id, OLD.details) THEN
      RAISE EXCEPTION 'Original application fields cannot be modified by this role';
    END IF;
    IF NOT public.has_role(auth.uid(), 'admin')
       AND (NEW.status, NEW.reg_no, NEW.completed_at) IS DISTINCT FROM
           (OLD.status, OLD.reg_no, OLD.completed_at) THEN
      RAISE EXCEPTION 'Only administrative officers can change registration status';
    END IF;
    IF OLD.police_task ->> 'directApproval' = 'true'
       AND (NEW.status, NEW.reg_no, NEW.police_task) IS DISTINCT FROM
           (OLD.status, OLD.reg_no, OLD.police_task) THEN
      RAISE EXCEPTION 'Directly approved applications are permanently completed';
    END IF;
    IF NEW.police_task ->> 'directApproval' = 'true' AND NEW.status <> 'completed' THEN
      RAISE EXCEPTION 'Direct approval must be recorded with completed status';
    END IF;

    IF public.has_role(auth.uid(), 'admin')
       AND NEW.police_task ->> 'assignedPoliceId' IS DISTINCT FROM OLD.police_task ->> 'assignedPoliceId'
       AND NEW.police_task ->> 'assignedPoliceId' IS NOT NULL THEN
      IF NEW.status <> 'progress' THEN
        RAISE EXCEPTION 'Field visit assignments must be marked in progress';
      END IF;
      SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'police'
        WHERE p.id::text = NEW.police_task ->> 'assignedPoliceId'
          AND p.active
          AND p.upazila_id = NEW.upazila_id
          AND p.station_id = NEW.station_id
          AND p.union_id = NEW.union_id
          AND p.ward = NEW.ward
      )
      INTO assignment_valid;
      IF NOT assignment_valid THEN
        RAISE EXCEPTION 'Assigned village police must be active and serve this application ward';
      END IF;
    END IF;

    IF public.has_role(auth.uid(), 'police')
       AND NEW.police_task IS DISTINCT FROM OLD.police_task THEN
      IF NEW.police_task ->> 'assignedPoliceId' IS DISTINCT FROM OLD.police_task ->> 'assignedPoliceId' THEN
        RAISE EXCEPTION 'Police cannot assign or reassign a field visit';
      END IF;
      IF OLD.police_task ->> 'assignedPoliceId' = auth.uid()::text
         OR OLD.police_task ? 'fieldVisitDays'
         OR NEW.police_task ? 'fieldVisitDays' THEN
        IF OLD.police_task ->> 'assignedPoliceId' <> auth.uid()::text THEN
          RAISE EXCEPTION 'Only the assigned police officer can record field visits';
        END IF;
        IF (NEW.police_task - 'fieldVisitDays') IS DISTINCT FROM
           (OLD.police_task - 'fieldVisitDays') THEN
          RAISE EXCEPTION 'Assigned officers may only append field visit evidence';
        END IF;

        old_days := COALESCE(OLD.police_task -> 'fieldVisitDays', '[]'::jsonb);
        new_days := COALESCE(NEW.police_task -> 'fieldVisitDays', '[]'::jsonb);
        old_day_count := jsonb_array_length(old_days);
        IF old_day_count >= 4 OR jsonb_array_length(new_days) <> old_day_count + 1
           OR (new_days - old_day_count) IS DISTINCT FROM old_days THEN
          RAISE EXCEPTION 'Field visit evidence must be submitted one day at a time in order';
        END IF;

        added_day := new_days -> old_day_count;
        IF COALESCE(added_day ->> 'day', '') <> (old_day_count + 1)::text
           OR COALESCE(jsonb_typeof(added_day -> 'latitude'), '') <> 'number'
           OR COALESCE(jsonb_typeof(added_day -> 'longitude'), '') <> 'number'
           OR COALESCE((added_day ->> 'latitude')::numeric, 999) NOT BETWEEN -90 AND 90
           OR COALESCE((added_day ->> 'longitude')::numeric, 999) NOT BETWEEN -180 AND 180
           OR COALESCE(added_day #>> '{photo,path}', '') NOT LIKE
             OLD.upazila_id || '/' || OLD.union_id || '/' || OLD.id::text || '/field-visit-day-%'
           OR COALESCE(added_day ->> 'capturedAt', '') !~ '^\d{4}-\d{2}-\d{2}T'
           OR (
             old_day_count > 0
             AND left(added_day ->> 'capturedAt', 10)::date <=
                 left(old_days -> (old_day_count - 1) ->> 'capturedAt', 10)::date
           )
           OR COALESCE(added_day #>> '{photo,name}', '') = ''
           OR COALESCE((added_day #>> '{photo,size}')::integer, 0) NOT BETWEEN 1 AND 768000
           OR NOT EXISTS (
             SELECT 1
             FROM storage.objects so
             WHERE so.bucket_id = 'case-files'
               AND so.name = added_day #>> '{photo,path}'
           ) THEN
          RAISE EXCEPTION 'Field visit evidence requires a valid photo, GPS location, and the next day number';
        END IF;
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'completed' THEN
    IF NEW.reg_no IS NULL OR NEW.reg_no !~ '^\d{17}$' THEN
      RAISE EXCEPTION 'A 17-digit government registration number is required';
    END IF;
    IF OLD.status <> 'completed' THEN NEW.completed_at := now(); END IF;
  END IF;
  RETURN NEW;
END $$;
