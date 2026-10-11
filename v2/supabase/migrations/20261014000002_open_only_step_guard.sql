-- Only open records pin a step (spec 5.1); errored records cannot be cleared in Phase 3 and must not block deletion.
create or replace function workflows_guard_steps() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_node text;
  v_n int;
begin
  select r.current_node_id, count(*)::int into v_node, v_n
  from records r
  where r.workflow_id = new.id and r.status = 'open' and r.current_node_id is not null
    and not exists (select 1 from jsonb_array_elements(new.graph->'nodes') e where e->>'id' = r.current_node_id)
  group by r.current_node_id order by r.current_node_id limit 1;
  if v_node is not null then
    raise exception 'A step with open records cannot be deleted: % (% open)', v_node, v_n;
  end if;
  return new;
end $$;

create or replace function open_record_counts(p_workflow uuid) returns table (node_id text, n int)
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := (select org_id from workflows where id = p_workflow);
begin
  if v_org is null or not has_permission(v_org, 'workflows.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
    select r.current_node_id, count(*)::int from records r
    where r.workflow_id = p_workflow and r.status = 'open' and r.current_node_id is not null
    group by r.current_node_id;
end $$;
