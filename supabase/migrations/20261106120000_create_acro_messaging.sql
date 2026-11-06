-- ACRO Plongee: messagerie privee et groupes.
-- Toutes les tables sont nouvelles; aucune table ni donnee existante n'est modifiee.

create table if not exists public.acro_conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  kind text not null check (kind in ('direct','group','club')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.acro_conversation_members (
  conversation_id uuid not null references public.acro_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id,user_id)
);

create table if not exists public.acro_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.acro_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists acro_conversation_members_user_idx
  on public.acro_conversation_members(user_id,conversation_id);
create index if not exists acro_messages_conversation_created_idx
  on public.acro_messages(conversation_id,created_at);

alter table public.acro_conversations enable row level security;
alter table public.acro_conversation_members enable row level security;
alter table public.acro_messages enable row level security;

create or replace function public.acro_is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.acro_conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.acro_is_conversation_member(uuid) from public;
grant execute on function public.acro_is_conversation_member(uuid) to authenticated;

create policy acro_conversations_select_member
  on public.acro_conversations for select to authenticated
  using (public.acro_is_conversation_member(id));

create policy acro_conversation_members_select_member
  on public.acro_conversation_members for select to authenticated
  using (public.acro_is_conversation_member(conversation_id));

create policy acro_conversation_members_update_self
  on public.acro_conversation_members for update to authenticated
  using (user_id = (select auth.uid()) and public.acro_is_conversation_member(conversation_id))
  with check (user_id = (select auth.uid()) and public.acro_is_conversation_member(conversation_id));

create policy acro_messages_select_member
  on public.acro_messages for select to authenticated
  using (public.acro_is_conversation_member(conversation_id));

create policy acro_messages_insert_member
  on public.acro_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.acro_is_conversation_member(conversation_id)
    and exists (
      select 1 from public.acro_profiles p
      where p.user_id = (select auth.uid()) and p.is_active = true
    )
  );

create or replace function public.acro_messaging_directory()
returns table(user_id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.acro_profiles p
    where p.user_id = (select auth.uid()) and p.is_active = true
  ) then
    raise exception 'Acces reserve aux membres actifs du club';
  end if;

  return query
    select p.user_id, p.display_name
    from public.acro_profiles p
    where p.is_active = true
    order by p.display_name;
end;
$$;

revoke all on function public.acro_messaging_directory() from public;
grant execute on function public.acro_messaging_directory() to authenticated;

create or replace function public.acro_create_conversation(
  p_title text,
  p_kind text,
  p_member_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_conversation_id uuid;
  v_members uuid[];
begin
  if v_user_id is null or not exists (
    select 1 from public.acro_profiles p
    where p.user_id = v_user_id and p.is_active = true
  ) then
    raise exception 'Acces reserve aux membres actifs du club';
  end if;

  if p_kind not in ('direct','group') then
    raise exception 'Type de conversation invalide';
  end if;

  select coalesce(array_agg(distinct requested.user_id), '{}'::uuid[])
    into v_members
  from unnest(coalesce(p_member_ids, '{}'::uuid[])) as requested(user_id)
  where requested.user_id <> v_user_id;

  if p_kind = 'direct' and cardinality(v_members) <> 1 then
    raise exception 'Une conversation privee doit avoir un seul destinataire';
  end if;
  if p_kind = 'group' and cardinality(v_members) < 1 then
    raise exception 'Un groupe doit contenir au moins un autre membre';
  end if;

  if exists (
    select 1
    from unnest(v_members) as requested(user_id)
    left join public.acro_profiles p on p.user_id = requested.user_id and p.is_active = true
    where p.user_id is null
  ) then
    raise exception 'Un ou plusieurs membres selectionnes ne sont pas actifs';
  end if;

  insert into public.acro_conversations(title,kind,created_by)
  values (
    case when p_kind = 'group' then left(btrim(coalesce(p_title,'')),80) else null end,
    p_kind,
    v_user_id
  )
  returning id into v_conversation_id;

  insert into public.acro_conversation_members(conversation_id,user_id)
  select v_conversation_id, members.user_id
  from (
    select v_user_id as user_id
    union
    select unnest(v_members)
  ) as members;

  return v_conversation_id;
end;
$$;

revoke all on function public.acro_create_conversation(text,text,uuid[]) from public;
grant execute on function public.acro_create_conversation(text,text,uuid[]) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.acro_messages;
    exception when duplicate_object then
      null;
    end;
  end if;
end;
$$;
