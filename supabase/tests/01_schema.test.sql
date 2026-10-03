begin;
select plan(14);

select has_table('public', t, t || ' exists')
from unnest(array['firms','profiles','bank_accounts','clients','transactions','change_log',
                  'user_preferences','platform_settings','waitlist','stripe_events']) as t;

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0, 'row-level security is enabled on every public table');

select throws_ok(
  $$ insert into firms (name, currency, billing_status) values ('X', 'MYR', 'trial') $$,
  '23514', null, 'a trial firm must have trial_ends_at');

select throws_ok(
  $$ insert into firms (name, currency, billing_status) values ('X', 'myr', 'paid') $$,
  '23514', null, 'currency must be an upper-case ISO code');

select throws_ok(
  $$ with f as (insert into firms (name, currency, billing_status) values ('Y','MYR','paid') returning id),
          c as (insert into clients (firm_id, name) select id, 'C' from f returning id, firm_id),
          b as (insert into bank_accounts (firm_id, name, is_default) select id, 'B', true from f returning id)
     insert into transactions (firm_id, client_id, bank_account_id, kind, amount_minor, date)
     select c.firm_id, c.id, b.id, 'receipt', 10000000000001, current_date from c, b $$,
  '23514', null, 'amount_minor is capped at 1e13');

select * from finish();
rollback;
