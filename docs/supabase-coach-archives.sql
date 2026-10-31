begin;
create table public.workout_coach_archives (
 user_id uuid not null references auth.users(id) on delete cascade,
 archive_id uuid not null,
 payload jsonb not null,
 created_at timestamptz not null default now(),
 primary key(user_id,archive_id)
);
alter table public.workout_coach_archives enable row level security;
revoke all on public.workout_coach_archives from anon, authenticated;
grant select,insert,delete on public.workout_coach_archives to authenticated;
create policy "Read own coach archives" on public.workout_coach_archives for select to authenticated using ((select auth.uid())=user_id);
create policy "Insert own coach archives" on public.workout_coach_archives for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Delete own coach archives" on public.workout_coach_archives for delete to authenticated using ((select auth.uid())=user_id);
commit;
