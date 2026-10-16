select cron.unschedule(jobid) from cron.job where jobname = 'together-location-retention';
drop function if exists public.cleanup_expired_location_points();

drop trigger if exists location_points_reject_stale on public.location_points;
drop function if exists public.location_points_reject_stale();
drop trigger if exists location_settings_guard on public.location_settings;
drop function if exists public.location_settings_guard();

drop policy if exists "profiles read own" on public.profiles;
drop policy if exists "profiles read all authenticated" on public.profiles;
create policy "profiles read all authenticated" on public.profiles
  for select to authenticated using (true);

drop policy if exists "couples insert as a" on public.couples;
create policy "couples insert as a" on public.couples
  for insert to authenticated with check (auth.uid() = user_a);

drop policy if exists "location_settings select own" on public.location_settings;
drop policy if exists "location_settings update own" on public.location_settings;
drop policy if exists "location_settings select own or partner" on public.location_settings;
drop policy if exists "location_settings update own or partner" on public.location_settings;
create policy "location_settings select own or partner" on public.location_settings
  for select to authenticated using (auth.uid() = user_id or public.are_partners(auth.uid(), user_id));
create policy "location_settings update own or partner" on public.location_settings
  for update to authenticated using (auth.uid() = user_id or public.are_partners(auth.uid(), user_id));

drop policy if exists "location_points select own" on public.location_points;
drop policy if exists "location_points delete own" on public.location_points;
drop policy if exists "location_points select own or partner" on public.location_points;
revoke delete on public.location_points from authenticated;
create policy "location_points select own or partner" on public.location_points
  for select to authenticated using (auth.uid() = user_id or public.are_partners(auth.uid(), user_id));

drop function if exists public.get_partner_current_location();
drop function if exists public.get_partner_profile();
drop function if exists public.send_couple_invitation(text);
drop function if exists public.list_incoming_invitations();
drop function if exists public.respond_couple_invitation(uuid, boolean);
drop function if exists public.cancel_couple_invitation(uuid);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.location_settings (user_id, sharing_enabled) values (new.id, false);
  return new;
end; $$;

revoke all on public.couple_invitations from authenticated, anon;
revoke all on public.profile_field_permissions from authenticated, anon;
comment on table public.couple_invitations is 'DEPRECATED: invitations flow removed; unused';
comment on table public.profile_field_permissions is 'DEPRECATED: field permissions removed; unused';