-- Together demo app: full schema and RLS policies (idempotent snapshot of the live database).
-- NOTE: this app is a deliberately flawed demo used to test a misuse scanner.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
drop policy if exists "profiles read all authenticated" on public.profiles;
create policy "profiles read all authenticated" on public.profiles
  for select to authenticated using (true);
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- Pairing: inserting a row creates the couple immediately, with no acceptance step.
create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null,
  user_b uuid not null,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.couples to authenticated;
grant all on public.couples to service_role;
alter table public.couples enable row level security;
drop policy if exists "couples read own" on public.couples;
create policy "couples read own" on public.couples
  for select to authenticated using (auth.uid() = user_a or auth.uid() = user_b);
drop policy if exists "couples insert as a" on public.couples;
create policy "couples insert as a" on public.couples
  for insert to authenticated with check (auth.uid() = user_a);
drop policy if exists "couples delete own" on public.couples;
create policy "couples delete own" on public.couples
  for delete to authenticated using (auth.uid() = user_a or auth.uid() = user_b);

create or replace function public.are_partners(_a uuid, _b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.couples
    where (user_a = _a and user_b = _b) or (user_a = _b and user_b = _a)
  );
$$;

-- Location sharing preference. UPDATE lets EITHER member change the OTHER member's flag.
create table if not exists public.location_settings (
  user_id uuid primary key,
  sharing_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.location_settings to authenticated;
grant all on public.location_settings to service_role;
alter table public.location_settings enable row level security;
drop policy if exists "location_settings select own or partner" on public.location_settings;
create policy "location_settings select own or partner" on public.location_settings
  for select to authenticated
  using (auth.uid() = user_id or public.are_partners(auth.uid(), user_id));
drop policy if exists "location_settings insert own" on public.location_settings;
create policy "location_settings insert own" on public.location_settings
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "location_settings update own or partner" on public.location_settings;
create policy "location_settings update own or partner" on public.location_settings
  for update to authenticated
  using (auth.uid() = user_id or public.are_partners(auth.uid(), user_id));

-- Location history: kept forever (no retention, no delete policy). Partners can read each other's points.
create table if not exists public.location_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now()
);
grant select, insert on public.location_points to authenticated;
grant all on public.location_points to service_role;
alter table public.location_points enable row level security;
drop policy if exists "location_points insert own" on public.location_points;
create policy "location_points insert own" on public.location_points
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "location_points select own or partner" on public.location_points;
create policy "location_points select own or partner" on public.location_points
  for select to authenticated
  using (auth.uid() = user_id or public.are_partners(auth.uid(), user_id));

create table if not exists public.dates (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id),
  created_by uuid not null,
  title text not null,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.dates to authenticated;
grant all on public.dates to service_role;
alter table public.dates enable row level security;
drop policy if exists "dates select members" on public.dates;
create policy "dates select members" on public.dates
  for select to authenticated using (
    exists (select 1 from public.couples c
            where c.id = dates.couple_id and (c.user_a = auth.uid() or c.user_b = auth.uid()))
  );
drop policy if exists "dates insert members" on public.dates;
create policy "dates insert members" on public.dates
  for insert to authenticated with check (
    auth.uid() = created_by and exists (
      select 1 from public.couples c
      where c.id = dates.couple_id and (c.user_a = auth.uid() or c.user_b = auth.uid()))
  );
drop policy if exists "dates delete members" on public.dates;
create policy "dates delete members" on public.dates
  for delete to authenticated using (
    exists (select 1 from public.couples c
            where c.id = dates.couple_id and (c.user_a = auth.uid() or c.user_b = auth.uid()))
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.location_settings (user_id, sharing_enabled) values (new.id, false);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();