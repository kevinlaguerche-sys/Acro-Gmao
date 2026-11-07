-- ACRO Plongée V144 — suivi des formations jeunes
-- À appliquer sur le projet Supabase Acro Gmao avant de publier le front-end.

create table if not exists public.acro_youth_evaluations (
  id uuid primary key default gen_random_uuid(),
  diver_id text not null references public.acro_divers(id) on delete cascade,
  pathway text not null,
  competency_code text not null,
  competency_label text not null,
  status text not null check (status in ('Acquis', 'ECA', 'NA')),
  comment text not null default '',
  evaluator_id uuid not null references auth.users(id),
  evaluator_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists acro_youth_evaluations_diver_pathway_created_idx
  on public.acro_youth_evaluations (diver_id, pathway, created_at desc);

create table if not exists public.acro_youth_validations (
  id uuid primary key default gen_random_uuid(),
  diver_id text not null references public.acro_divers(id) on delete cascade,
  pathway text not null,
  competency_code text not null,
  evaluator_id uuid not null references auth.users(id),
  evaluator_name text not null default '',
  validated_at timestamptz not null default now(),
  constraint acro_youth_validations_one_per_evaluator
    unique (diver_id, pathway, competency_code, evaluator_id)
);

create index if not exists acro_youth_validations_diver_pathway_code_idx
  on public.acro_youth_validations (diver_id, pathway, competency_code);

alter table public.acro_youth_evaluations enable row level security;
alter table public.acro_youth_validations enable row level security;

-- Les encadrants et Master peuvent lire les suivis du club.
grant select, insert, delete on public.acro_youth_evaluations to authenticated;
grant select, insert, delete on public.acro_youth_validations to authenticated;
grant all on public.acro_youth_evaluations to service_role;
grant all on public.acro_youth_validations to service_role;

drop policy if exists "Youth training readable by instructors" on public.acro_youth_evaluations;
create policy "Youth training readable by instructors"
on public.acro_youth_evaluations for select to authenticated
using (
  exists (
    select 1 from public.acro_profiles p
    where p.user_id = (select auth.uid())
      and p.is_active = true
      and p.role in ('master', 'encadrant')
  )
);

drop policy if exists "Instructors can record youth evaluations" on public.acro_youth_evaluations;
create policy "Instructors can record youth evaluations"
on public.acro_youth_evaluations for insert to authenticated
with check (
  evaluator_id = (select auth.uid())
  and exists (
    select 1 from public.acro_profiles p
    where p.user_id = (select auth.uid())
      and p.is_active = true
      and p.role in ('master', 'encadrant')
  )
);

drop policy if exists "Master can delete youth evaluations" on public.acro_youth_evaluations;
create policy "Master can delete youth evaluations"
on public.acro_youth_evaluations for delete to authenticated
using (
  exists (
    select 1 from public.acro_profiles p
    where p.user_id = (select auth.uid())
      and p.is_active = true
      and p.role = 'master'
  )
);

drop policy if exists "Youth validations readable by instructors" on public.acro_youth_validations;
create policy "Youth validations readable by instructors"
on public.acro_youth_validations for select to authenticated
using (
  exists (
    select 1 from public.acro_profiles p
    where p.user_id = (select auth.uid())
      and p.is_active = true
      and p.role in ('master', 'encadrant')
  )
);

drop policy if exists "Instructors can validate youth competencies" on public.acro_youth_validations;
create policy "Instructors can validate youth competencies"
on public.acro_youth_validations for insert to authenticated
with check (
  evaluator_id = (select auth.uid())
  and exists (
    select 1 from public.acro_profiles p
    where p.user_id = (select auth.uid())
      and p.is_active = true
      and p.role in ('master', 'encadrant')
  )
);

drop policy if exists "Master can delete youth validations" on public.acro_youth_validations;
create policy "Master can delete youth validations"
on public.acro_youth_validations for delete to authenticated
using (
  exists (
    select 1 from public.acro_profiles p
    where p.user_id = (select auth.uid())
      and p.is_active = true
      and p.role = 'master'
  )
);
