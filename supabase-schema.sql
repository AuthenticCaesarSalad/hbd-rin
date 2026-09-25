-- =============================================================
--  BirthdayWishes for Putri Karina — complete Supabase schema
--
--  HOW TO USE
--    1. Create a project at https://supabase.com
--    2. Open  SQL Editor  ->  New query
--    3. Paste this ENTIRE file and click  Run
--    4. Storage -> confirm the "birthday-media" bucket exists & is Public
--    5. Copy Project URL + anon key from  Settings -> API
--       into the BACKEND block at the top of script.js
--
--  This file is idempotent — running it twice is safe.
-- =============================================================


-- =============================================================
--  1. MESSAGES  (the wish wall)
-- =============================================================
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  relation    text not null default 'other',
  body        text not null check (char_length(body) between 1 and 1200),
  color       text not null default 'pink',
  created_at  timestamptz not null default now()
);

alter table public.messages enable row level security;

drop policy if exists "messages readable by all" on public.messages;
create policy "messages readable by all"
  on public.messages for select
  to anon, authenticated
  using (true);

drop policy if exists "messages insertable by all" on public.messages;
create policy "messages insertable by all"
  on public.messages for insert
  to anon, authenticated
  with check (true);

drop policy if exists "messages deletable by all" on public.messages;
create policy "messages deletable by all"
  on public.messages for delete
  to anon, authenticated
  using (true);

grant select, insert, delete on public.messages to anon, authenticated;


-- =============================================================
--  2. MEDIA  (photo / video metadata; the files live in Storage)
-- =============================================================
create table if not exists public.media (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  type         text not null check (type in ('image', 'video')),
  mime         text,
  size         bigint,
  caption      text default '',
  tags         text[] not null default '{}',
  storage_path text not null,
  created_at   timestamptz not null default now()
);

alter table public.media enable row level security;

drop policy if exists "media readable by all" on public.media;
create policy "media readable by all"
  on public.media for select
  to anon, authenticated
  using (true);

drop policy if exists "media insertable by all" on public.media;
create policy "media insertable by all"
  on public.media for insert
  to anon, authenticated
  with check (true);

drop policy if exists "media deletable by all" on public.media;
create policy "media deletable by all"
  on public.media for delete
  to anon, authenticated
  using (true);

grant select, insert, delete on public.media to anon, authenticated;


-- =============================================================
--  3. VISIT COUNTER  (one shared number for the whole site)
-- =============================================================
create table if not exists public.visits (
  id    int primary key default 1,
  count bigint not null default 0,
  constraint visits_single_row check (id = 1)
);

alter table public.visits enable row level security;

-- Public read so the site can display the total. No update/insert policy:
-- the ONLY way to change the number is the security-definer function below.
drop policy if exists "visits readable by all" on public.visits;
create policy "visits readable by all"
  on public.visits for select
  to anon, authenticated
  using (true);

grant select on public.visits to anon, authenticated;

insert into public.visits (id, count) values (1, 0)
  on conflict (id) do nothing;

create or replace function public.increment_visits()
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.visits set count = count + 1 where id = 1 returning count;
$$;

grant execute on function public.increment_visits() to anon, authenticated;


-- =============================================================
--  4. STORAGE BUCKET  (where the actual photos/videos are kept)
-- =============================================================
-- Creates the bucket for you. If it already exists it is just
-- marked public, which is what the site expects.
insert into storage.buckets (id, name, public)
values ('birthday-media', 'birthday-media', true)
on conflict (id) do update set public = true;

-- Optional: enforce the 50 MB per-file cap server-side too.
update storage.buckets
   set file_size_limit = 52428800                       -- 50 MB in bytes
 where id = 'birthday-media';

drop policy if exists "birthday-media public read" on storage.objects;
create policy "birthday-media public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'birthday-media');

drop policy if exists "birthday-media public upload" on storage.objects;
create policy "birthday-media public upload"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'birthday-media');

drop policy if exists "birthday-media public delete" on storage.objects;
create policy "birthday-media public delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'birthday-media');


-- =============================================================
--  5. VERIFY  (should return the 3 tables)
-- =============================================================
select 'messages' as object, count(*) as rows from public.messages
union all select 'media', count(*) from public.media
union all select 'visits', count(*) from public.visits;
