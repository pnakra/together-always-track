-- Privacy rule tests. Run as a database superuser via the backend SQL runner.
-- Success ends with the error "ALL PRIVACY TESTS PASSED (rolled back)"; any "FAIL:" message is a failure.
-- The final raise aborts the transaction, so nothing is persisted.
begin;

create temp table t_ids as
  select (select id from public.profiles where email = 'alex.test@together-demo.app') as alex,
         (select id from public.profiles where email = 'sam.test@together-demo.app') as sam;
grant select on t_ids to authenticated;


create or replace function pg_temp.as_user(_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', _id, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;
create or replace function pg_temp.as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true);
$$;

do $$
declare a uuid; s uuid; x uuid; n int; r record; inv uuid;
begin
  select alex, sam into a, s from t_ids;
  select id into x from public.profiles where email = 'stranger.test@together-demo.app'; -- unpaired test account

  -- 1. Unauthorized field reads
  perform pg_temp.as_user(a);
  select count(*) into n from public.profiles where id <> a;
  if n <> 0 then raise exception 'FAIL: other profiles readable'; end if;
  select * into r from public.get_partner_profile();
  if r.id <> s or r.email is not null or r.display_name is not null then
    raise exception 'FAIL: partner fields exposed without permission'; end if;
  perform pg_temp.as_user(s);
  update public.profile_field_permissions set share_display_name = true where user_id = s;
  perform pg_temp.as_user(a);
  select * into r from public.get_partner_profile();
  if r.display_name is distinct from 'Sam' or r.email is not null then
    raise exception 'FAIL: opt-in field permission not honored'; end if;
  update public.profile_field_permissions set share_email = true where user_id = s;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: partner changed my field permissions'; end if;
  perform pg_temp.as_user(x);
  if exists (select 1 from public.get_partner_profile()) then
    raise exception 'FAIL: stranger sees a partner'; end if;
  raise notice 'PASS unauthorized field reads';

  -- 2. Unaccepted invitations do not create partnership
  begin
    insert into public.couples (user_a, user_b) values (x, a);
    raise exception 'FAIL: direct couple insert allowed';
  exception when insufficient_privilege then null; end;
  perform public.send_couple_invitation('nobody@nowhere.test');  -- silent, no leak
  perform public.send_couple_invitation('alex.test@together-demo.app');
  if exists (select 1 from public.couples where x in (user_a, user_b)) then
    raise exception 'FAIL: invitation alone created couple'; end if;
  perform pg_temp.as_user(a);
  select id into inv from public.list_incoming_invitations() limit 1;
  if inv is null then raise exception 'FAIL: invitee cannot see invitation'; end if;
  perform pg_temp.as_user(x);
  begin
    perform public.respond_couple_invitation(inv, true);
    raise exception 'FAIL: inviter accepted own invitation';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'PASS unaccepted invitations';

  -- 3. Partner setting changes
  perform pg_temp.as_user(a);
  update public.location_settings set sharing_enabled = true where user_id = s;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: partner toggled my sharing'; end if;
  if exists (select 1 from public.location_settings where user_id = s) then
    raise exception 'FAIL: partner settings readable'; end if;
  perform pg_temp.as_user(s);
  begin
    update public.location_settings set user_id = x where user_id = s;
    raise exception 'FAIL: user_id mutable';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'PASS partner setting changes';

  -- 4. History access
  perform pg_temp.as_admin();
  insert into public.location_points (user_id, lat, lng, recorded_at)
    values (s, 41.88271, -87.62331, now() - interval '2 hours');
  perform pg_temp.as_user(a);
  if exists (select 1 from public.location_points where user_id = s) then
    raise exception 'FAIL: partner reads history'; end if;
  delete from public.location_points where user_id = s;
  perform pg_temp.as_user(s);
  if not exists (select 1 from public.location_points where user_id = s) then
    raise exception 'FAIL: partner deleted my history'; end if;
  -- point predating activation must not leak
  update public.location_settings set sharing_enabled = true where user_id = s;
  perform pg_temp.as_user(a);
  if exists (select 1 from public.get_partner_current_location()) then
    raise exception 'FAIL: pre-activation point exposed'; end if;
  perform pg_temp.as_user(s);
  insert into public.location_points (user_id, lat, lng, recorded_at)
    values (s, 41.88271, -87.62331, now() + interval '1 second');
  perform pg_temp.as_user(a);
  select * into r from public.get_partner_current_location();
  if r.lat is distinct from 41.88::float8 then raise exception 'FAIL: current approx location missing (%)', r.lat; end if;
  perform pg_temp.as_user(s);
  delete from public.location_points where user_id = s;
  if exists (select 1 from public.location_points where user_id = s) then
    raise exception 'FAIL: owner cannot clear history'; end if;
  perform pg_temp.as_user(s);
  begin
    insert into public.location_points (user_id, lat, lng, recorded_at) values (s, 1, 1, now() - interval '10 minutes');
    raise exception 'FAIL: stale point accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'PASS history access';

  -- 5. Retention cleanup
  perform pg_temp.as_admin();
  insert into public.location_points (user_id, lat, lng, recorded_at)
    values (s, 1, 1, now() - interval '25 hours'), (s, 2, 2, now() - interval '23 hours');
  perform public.cleanup_expired_location_points();
  if exists (select 1 from public.location_points where recorded_at < now() - interval '24 hours') then
    raise exception 'FAIL: expired points kept'; end if;
  if not exists (select 1 from public.location_points where user_id = s and lat = 2) then
    raise exception 'FAIL: fresh point deleted'; end if;
  if not exists (select 1 from cron.job where jobname = 'together-location-retention') then
    raise exception 'FAIL: retention job not scheduled'; end if;
  raise notice 'PASS retention cleanup';

  -- 6. Immediate revocation (stop sharing, then unlink)
  insert into public.location_points (user_id, lat, lng, recorded_at) values (s, 41.9, -87.6, now() + interval '2 seconds');
  perform pg_temp.as_user(a);
  if not exists (select 1 from public.get_partner_current_location()) then
    raise exception 'FAIL: setup, expected live location'; end if;
  perform pg_temp.as_user(s);
  update public.location_settings set sharing_enabled = false where user_id = s;
  perform pg_temp.as_user(a);
  if exists (select 1 from public.get_partner_current_location()) then
    raise exception 'FAIL: location visible after stop'; end if;
  perform pg_temp.as_user(s);
  update public.location_settings set sharing_enabled = true where user_id = s;
  perform pg_temp.as_admin();
  insert into public.location_points (user_id, lat, lng, recorded_at) values (s, 41.9, -87.6, now() + interval '3 seconds');
  perform pg_temp.as_user(s);
  delete from public.couples where s in (user_a, user_b);
  perform pg_temp.as_user(a);
  if exists (select 1 from public.get_partner_current_location()) then
    raise exception 'FAIL: location visible after unlink'; end if;
  raise notice 'PASS immediate revocation';
  raise exception 'ALL PRIVACY TESTS PASSED (rolled back)';
end $$;

rollback;
