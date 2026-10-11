-- QA-P3-1: answers on a record follow record visibility; forms.manage widens standalone submissions only.
drop policy form_submissions_read on form_submissions;
create policy form_submissions_read on form_submissions for select
  using (case when record_id is null
    then (submitted_by = auth.uid() and is_member(org_id)) or has_permission(org_id, 'forms.manage')
    else record_visible(record_id) end);

-- QA-P3-3: two-valued, so the computed column is never null.
create or replace function is_mine(t tasks) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(t.status = 'open' and (
    t.assignee_user_id = auth.uid() or t.claimed_by = auth.uid()
    or (t.claimed_by is null and exists (
          select 1 from member_roles mr where mr.member_id = current_member_id(t.org_id) and mr.role_id = t.assignee_role_id))), false)
$$;
