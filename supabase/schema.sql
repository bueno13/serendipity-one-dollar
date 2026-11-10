-- Serendipity — Supabase schema
-- Run once in the Supabase SQL editor (or supabase db push).
-- Matches lib/types.ts and lib/store.ts Supabase paths.
-- Local mode (no Supabase) uses data/store.json instead; see README.
--
-- If you already applied an older version of this schema, the
-- CREATE INDEX IF NOT EXISTS / CREATE POLICY statements below are safe to
-- re-run (delete policies use DROP POLICY IF EXISTS first).

create table if not exists public.participants (
  id text primary key,
  name text not null,
  title text not null,
  offers_text text not null,
  needs_text text not null,
  profile jsonb,
  profile_source text not null default 'none',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id text primary key,
  person_a_id text not null references public.participants(id) on delete cascade,
  person_b_id text not null references public.participants(id) on delete cascade,
  score int not null check (score >= 0 and score <= 100),
  reason text not null default '',
  value_for_a text not null default '',
  value_for_b text not null default '',
  conversation_starter text not null default '',
  created_at timestamptz not null default now(),
  unique (person_a_id, person_b_id)
);

create table if not exists public.interests (
  id text primary key,
  from_id text not null references public.participants(id) on delete cascade,
  to_id text not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (from_id, to_id)
);

create table if not exists public.api_usage (
  id text primary key,
  kind text not null check (kind in ('extract', 'match')),
  participant_id text,
  requests int not null default 1,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  total_tokens int not null default 0,
  -- NULL when OpenRouter does not return verifiable cost; UI shows "Cost unavailable".
  cost_usd double precision,
  created_at timestamptz not null default now()
);

-- Prevent duplicate reversed pairs (A,B) vs (B,A) even if callers forget
-- to canonicalize. The app also canonicalizes (LEAST first) before upsert.
create unique index if not exists idx_matches_pair_norm
  on public.matches (LEAST(person_a_id, person_b_id), GREATEST(person_a_id, person_b_id));

-- Demo-friendly policies: allow anon read/insert for hackathon demo.
-- Server routes use the secret key which bypasses RLS; keep these tight
-- (or switch to authenticated policies) before any public production use.
alter table public.participants enable row level security;
alter table public.matches enable row level security;
alter table public.interests enable row level security;
alter table public.api_usage enable row level security;

drop policy if exists "anon read participants" on public.participants;
drop policy if exists "anon insert participants" on public.participants;
drop policy if exists "anon update participants" on public.participants;
drop policy if exists "anon delete participants" on public.participants;
create policy "anon read participants" on public.participants for select using (true);
create policy "anon insert participants" on public.participants for insert with check (true);
create policy "anon update participants" on public.participants for update using (true);
create policy "anon delete participants" on public.participants for delete using (true);

drop policy if exists "anon read matches" on public.matches;
drop policy if exists "anon insert matches" on public.matches;
drop policy if exists "anon update matches" on public.matches;
drop policy if exists "anon delete matches" on public.matches;
create policy "anon read matches" on public.matches for select using (true);
create policy "anon insert matches" on public.matches for insert with check (true);
create policy "anon update matches" on public.matches for update using (true);
create policy "anon delete matches" on public.matches for delete using (true);

drop policy if exists "anon read interests" on public.interests;
drop policy if exists "anon insert interests" on public.interests;
drop policy if exists "anon delete interests" on public.interests;
create policy "anon read interests" on public.interests for select using (true);
create policy "anon insert interests" on public.interests for insert with check (true);
create policy "anon delete interests" on public.interests for delete using (true);

drop policy if exists "anon read api_usage" on public.api_usage;
drop policy if exists "anon insert api_usage" on public.api_usage;
drop policy if exists "anon delete api_usage" on public.api_usage;
create policy "anon read api_usage" on public.api_usage for select using (true);
create policy "anon insert api_usage" on public.api_usage for insert with check (true);
create policy "anon delete api_usage" on public.api_usage for delete using (true);

create index if not exists idx_matches_a on public.matches (person_a_id);
create index if not exists idx_matches_b on public.matches (person_b_id);
create index if not exists idx_interests_from on public.interests (from_id);
create index if not exists idx_participants_created on public.participants (created_at);
