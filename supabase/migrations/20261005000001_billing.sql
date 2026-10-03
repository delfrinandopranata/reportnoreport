-- Called ONLY by the stripe-webhook Edge Function (service role). Postgres grants EXECUTE to PUBLIC by
-- default, which would let any signed-in user mark their own firm paid — so revoke it explicitly.
create or replace function record_payment(p_firm_id uuid, p_payment_intent_id text) returns void
language plpgsql security definer set search_path = public as $$
declare v_before billing_status;
begin
  select billing_status into v_before from firms where id = p_firm_id for update;
  if not found then raise exception 'Firm not found.'; end if;
  if v_before = 'paid' then raise exception 'stripe.already_paid'; end if;
  update firms
  set billing_status = 'paid', paid_at = now(), stripe_payment_intent_id = p_payment_intent_id
  where id = p_firm_id;
  insert into change_log (firm_id, table_name, row_id, action, before, after)
  values (p_firm_id, 'firms', p_firm_id, 'billing',
          jsonb_build_object('billing_status', v_before),
          jsonb_build_object('billing_status', 'paid', 'stripe_payment_intent_id', p_payment_intent_id));
end $$;

create or replace function record_refund(p_firm_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_before billing_status;
begin
  select billing_status into v_before from firms where id = p_firm_id for update;
  if not found then raise exception 'Firm not found.'; end if;
  update firms set billing_status = 'read_only' where id = p_firm_id;
  insert into change_log (firm_id, table_name, row_id, action, before, after)
  values (p_firm_id, 'firms', p_firm_id, 'billing',
          jsonb_build_object('billing_status', v_before),
          jsonb_build_object('billing_status', 'read_only'));
end $$;

revoke execute on function record_payment(uuid, text) from public, anon, authenticated;
revoke execute on function record_refund(uuid) from public, anon, authenticated;
grant execute on function record_payment(uuid, text) to service_role;
grant execute on function record_refund(uuid) to service_role;
