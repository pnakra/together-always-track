-- App clients may only submit fresh points; stale or future timestamps are rejected.
create or replace function public.location_points_reject_stale()
returns trigger language plpgsql set search_path = public
as $$
begin
  if current_user = 'authenticated' and
     (new.recorded_at < now() - interval '2 minutes' or new.recorded_at > now() + interval '1 minute') then
    raise exception 'stale or future location point rejected';
  end if;
  return new;
end; $$;
drop trigger if exists location_points_reject_stale on public.location_points;
create trigger location_points_reject_stale before insert on public.location_points
  for each row execute function public.location_points_reject_stale();