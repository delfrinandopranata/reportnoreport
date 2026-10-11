-- QA-P5-3: records_read called record_visible(id) once per row (about 0.4 ms each), so a 10,000-record report spent seconds in RLS.
-- Two set-based fast paths are tried first; a row neither accepts still goes through record_visible, so what a caller can
-- see is unchanged: both paths only repeat clauses record_visible already has (started it; holds records.view_all for the workflow).
create or replace function my_active_orgs() returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from members where user_id = auth.uid() and status = 'active'
$$;

create or replace function my_view_all_workflows() returns table (org_id uuid, workflow_id uuid)
language sql stable security definer set search_path = public as $$
  select w.org_id, w.id from workflows w
  where is_member(w.org_id) and has_permission(w.org_id, 'records.view_all', w.id)
$$;

revoke execute on function my_active_orgs(), my_view_all_workflows() from public, anon;

drop policy records_read on records;
create policy records_read on records for select using (
  (started_by = (select auth.uid()) and org_id in (select my_active_orgs()))
  or (org_id, workflow_id) in (select v.org_id, v.workflow_id from my_view_all_workflows() v)
  or record_visible(id)
);
