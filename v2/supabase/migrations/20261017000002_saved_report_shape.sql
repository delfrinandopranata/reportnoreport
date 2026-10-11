-- QA-P5-6: run-report re-validates a saved report, but a direct write could still store 20,000 columns (and the audit trigger copies the blob).
-- The same caps as readReportDef (20 columns, 10 filters) and the keys it reads, enforced where the row is written.
create or replace function saved_report_shape_ok(p_columns jsonb, p_filters jsonb, p_group_by jsonb, p_aggregate jsonb) returns boolean
language sql immutable as $$
  select jsonb_array_length(p_columns) <= 20
     and jsonb_array_length(p_filters) <= 10
     and length(p_columns::text) <= 4000
     and length(p_filters::text) <= 20000
     and not exists (select 1 from jsonb_array_elements(p_columns) e
                     where jsonb_typeof(e) <> 'object' or exists (select 1 from jsonb_object_keys(e) k where k not in ('meta', 'field')))
     and not exists (select 1 from jsonb_array_elements(p_filters) e
                     where jsonb_typeof(e) <> 'object' or exists (select 1 from jsonb_object_keys(e) k where k not in ('field', 'operator', 'value')))
     and (p_group_by is null or not exists (select 1 from jsonb_object_keys(p_group_by) k where k not in ('meta', 'field')))
     and (p_aggregate is null or not exists (select 1 from jsonb_object_keys(p_aggregate) k where k not in ('fn', 'field')))
$$;

alter table saved_reports add constraint saved_reports_shape check (saved_report_shape_ok(columns, filters, group_by, aggregate));
