-- ===== Together: privacy hardening (Misuse Check fix) =====

-- ---------- profiles: owner-only, partner fields via opt-in ----------
drop policy if exists "profiles read all authenticated" on public.profiles;
drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles
  for select to authenticated using (auth.uid() = id);

create table if not exists public.profile_field_permissions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  share_email boolean not null default false,
  share_display_name boolean not null default false,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profile_field_permissions to authenticated;
grant all on public.profile_field_permissions to service_role;
alter table public.profile_field_permissions enable row level security;
drop policy if exists "pfp select own" on public.profile_field_permissions;
drop policy if exists "pfp insert own" on public.profile_field_permissions;
drop policy if exists "pfp update own" on public.profile_field_permissions;
create policy "pfp select own" on public.profile_field_permissions
  for select to authenticated using (auth.uid() = user_id);
create policy "pfp insert own" on public.profile_field_permissions
  for insert to authenticated with check (auth.uid() = user_id);
create policy "pfp update own" on public.profile_field_permissions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into public.profile_field_permissions (user_id)
  select id from public.profiles on conflict do nothing;

-- Accepted partner only; each field null unless its owner opted in.
create or replace function public.get_partner_profile()
returns table (id uuid, email text, display_name text)
language sql stable security definer set search_path = public
as $$
  select p.id,
         case when coalesce(f.share_email, false) then p.email end,
         case when coalesce(f.share_display_name, false) then p.display_name end
  from public.couples c
  join public.profiles p
    on p.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
  left join public.profile_field_permissions f on f.user_id = p.id
  where auth.uid() in (c.user_a, c.user_b)
  order by c.created_at
  limit 1;
$$;
revoke all on function public.get_partner_profile() from public, anon;
grant execute on function public.get_partner_profile() to authenticated;

-- ---------- couples: only via mutually accepted invitations ----------
-- Existing couples (e.g. Alex & Sam) are treated as accepted.
drop policy if exists "couples insert as a" on public.couples;

create table if not exists public.couple_invitations (
  id uuid primary key default gen_random_uuid(),
  inviter uuid not null,
  invitee uuid not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (inviter <> invitee)
);
create unique index if not exists couple_invitations_pending_uniq
  on public.couple_invitations (inviter, invitee) where status = 'pending';
grant select on public.couple_invitations to authenticated;
grant all on public.couple_invitations to service_role;
alter table public.couple_invitations enable row level security;
drop policy if exists "invitations select involved" on public.couple_invitations;
create policy "invitations select involved" on public.couple_invitations
  for select to authenticated using (auth.uid() in (inviter, invitee));

-- Always returns void: callers can't learn whether the email has an account.
create or replace function public.send_couple_invitation(_email text)
returns void language plpgsql security definer set search_path = public
as $$
declare _target uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into _target from public.profiles where email = lower(trim(_email));
  if _target is null or _target = auth.uid() then return; end if;
  insert into public.couple_invitations (inviter, invitee)
    values (auth.uid(), _target) on conflict do nothing;
end; $$;

-- Invitee-only view of who invited them (only the inviter's opted-in name).
create or replace function public.list_incoming_invitations()
returns table (id uuid, created_at timestamptz, inviter_name text)
language sql stable security definer set search_path = public
as $$
  select i.id, i.created_at,
         case when coalesce(f.share_display_name, false) then p.display_name end
  from public.couple_invitations i
  join public.profiles p on p.id = i.inviter
  left join public.profile_field_permissions f on f.user_id = i.inviter
  where i.invitee = auth.uid() and i.status = 'pending';
$$;

create or replace function public.respond_couple_invitation(_id uuid, _accept boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare inv public.couple_invitations;
begin
  select * into inv from public.couple_invitations
    where id = _id and invitee = auth.uid() and status = 'pending' for update;
  if not found then raise exception 'invitation not found'; end if;
  if not _accept then
    update public.couple_invitations set status = 'declined', responded_at = now() where id = _id;
    return;
  end if;
  if exists (select 1 from public.couples where auth.uid() in (user_a, user_b)
             or inv.inviter in (user_a, user_b)) then
    raise exception 'one of you is already paired';
  end if;
  update public.couple_invitations set status = 'accepted', responded_at = now() where id = _id;
  insert into public.couples (user_a, user_b) values (inv.inviter, inv.invitee);
end; $$;

create or replace function public.cancel_couple_invitation(_id uuid)
returns void language sql security definer set search_path = public
as $$
  update public.couple_invitations set status = 'cancelled', responded_at = now()
  where id = _id and inviter = auth.uid() and status = 'pending';
$$;

revoke all on function public.send_couple_invitation(text) from public, anon;
revoke all on function public.list_incoming_invitations() from public, anon;
revoke all on function public.respond_couple_invitation(uuid, boolean) from public, anon;
revoke all on function public.cancel_couple_invitation(uuid) from public, anon;
grant execute on function public.send_couple_invitation(text) to authenticated;
grant execute on function public.list_incoming_invitations() to authenticated;
grant execute on function public.respond_couple_invitation(uuid, boolean) to authenticated;
grant execute on function public.cancel_couple_invitation(uuid) to authenticated;

-- ---------- location_settings: owner-only ----------
drop policy if exists "location_settings update own or partner" on public.location_settings;
drop policy if exists "location_settings select own or partner" on public.location_settings;
drop policy if exists "location_settings select own" on public.location_settings;
drop policy if exists "location_settings update own" on public.location_settings;
create policy "location_settings select own" on public.location_settings
  for select to authenticated using (auth.uid() = user_id);
create policy "location_settings update own" on public.location_settings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter table public.location_settings alter column sharing_enabled set default false;

-- user_id immutable; updated_at is server-controlled and marks activation time.
create or replace function public.location_settings_guard()
returns trigger language plpgsql set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'user_id is immutable';
    end if;
    if new.sharing_enabled is distinct from old.sharing_enabled then
      new.updated_at := now();
    else
      new.updated_at := old.updated_at;
    end if;
  else
    new.updated_at := now();
  end if;
  return new;
end; $$;
drop trigger if exists location_settings_guard on public.location_settings;
create trigger location_settings_guard before insert or update on public.location_settings
  for each row execute function public.location_settings_guard();

-- ---------- location_points: owner-only, deletable, 24h retention ----------
drop policy if exists "location_points select own or partner" on public.location_points;
drop policy if exists "location_points select own" on public.location_points;
drop policy if exists "location_points delete own" on public.location_points;
create policy "location_points select own" on public.location_points
  for select to authenticated using (auth.uid() = user_id);
grant delete on public.location_points to authenticated;
create policy "location_points delete own" on public.location_points
  for delete to authenticated using (auth.uid() = user_id);

-- Latest approximate (~1 km) point of an accepted partner, only while sharing
-- is on, only points recorded after activation, and only if fresh (<= 5 min).
create or replace function public.get_partner_current_location()
returns table (lat double precision, lng double precision, recorded_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select round(lp.lat::numeric, 2)::float8, round(lp.lng::numeric, 2)::float8, lp.recorded_at
  from public.couples c
  join public.location_settings s
    on s.user_id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
  join public.location_points lp on lp.user_id = s.user_id
  where auth.uid() in (c.user_a, c.user_b)
    and s.sharing_enabled
    and lp.recorded_at >= s.updated_at
    and lp.recorded_at >= now() - interval '5 minutes'
    and lp.recorded_at <= now() + interval '1 minute'
  order by lp.recorded_at desc
  limit 1;
$$;
revoke all on function public.get_partner_current_location() from public, anon;
grant execute on function public.get_partner_current_location() to authenticated;

create or replace function public.cleanup_expired_location_points()
returns void language sql security definer set search_path = public
as $$
  delete from public.location_points where recorded_at < now() - interval '24 hours';
$$;
revoke all on function public.cleanup_expired_location_points() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'together-location-retention';
select cron.schedule('together-location-retention', '0 * * * *',
  'select public.cleanup_expired_location_points()');

-- ---------- signup: default-off field permissions ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.location_settings (user_id, sharing_enabled) values (new.id, false);
  insert into public.profile_field_permissions (user_id) values (new.id);
  return new;
end; $$;