-- Link app_users to Supabase Auth identities, keeping display_name as the
-- internal identity key used throughout the app (projects, memberships, scores).

alter table app_users
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

-- When someone signs up via Supabase Auth, link them to an existing app_users
-- row matching their display_name (e.g. pre-registered by an admin), or create
-- a new row if none exists.
create or replace function public.handle_new_auth_user()
returns trigger as $$
begin
  insert into public.app_users (display_name, auth_user_id, last_seen_at)
  values (
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.id,
    now()
  )
  on conflict (display_name) do update
    set auth_user_id = excluded.auth_user_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
