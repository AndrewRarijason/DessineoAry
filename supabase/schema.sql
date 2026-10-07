-- =====================================================================
--  Dessineo Ary ! — schéma de la base Supabase
--  À exécuter dans Supabase > SQL Editor (ré-exécutable sans risque).
--  Ensuite, exécuter seed.sql pour les catégories et les mots.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

-- Fonctions internes : schéma non exposé par l'API Supabase
create schema if not exists private;

-- ---------------------------------------------------------------------
--  Tables
-- ---------------------------------------------------------------------

create table if not exists public.categories (
  id smallserial primary key,
  name text not null unique,
  emoji text not null default '🎨',
  sort_order int not null default 0
);

create table if not exists public.words (
  id serial primary key,
  category_id smallint not null references public.categories(id) on delete cascade,
  word text not null,
  alternatives text[] not null default '{}',
  unique (category_id, word)
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null,
  mode text not null default 'solo' check (mode in ('solo', 'team')),
  team_sets int not null default 3 check (team_sets in (3, 5)),
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  total_rounds int not null default 0,
  current_round int not null default 0,
  team_a_score int not null default 0,
  team_b_score int not null default 0,
  bonus_sets int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  nickname text not null check (char_length(nickname) between 1 and 20),
  team text check (team in ('A', 'B')),
  score int not null default 0,
  draw_order int,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, user_id)
);
create index if not exists room_players_user_idx on public.room_players(user_id);

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_no int not null,
  drawer_id uuid not null,
  team text check (team in ('A', 'B')),
  category_id smallint references public.categories(id),
  phase text not null check (phase in ('choosing', 'drawing', 'reveal')),
  phase_ends_at timestamptz not null,
  winner_id uuid,
  revealed_word text,
  created_at timestamptz not null default now(),
  unique (room_id, round_no)
);

-- Le mot à dessiner : jamais lisible directement par les joueurs
create table if not exists public.round_secrets (
  round_id uuid primary key references public.rounds(id) on delete cascade,
  word_id int references public.words(id) on delete set null,
  word text not null,
  alternatives text[] not null default '{}'
);

create table if not exists public.guesses (
  id bigserial primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  user_id uuid not null,
  nickname text not null,
  content text,            -- null quand la réponse est correcte (pour ne pas dévoiler le mot)
  is_correct boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists guesses_round_idx on public.guesses(round_id, id);

-- ---------------------------------------------------------------------
--  Sécurité (RLS) : lecture réservée aux membres de la salle,
--  toute écriture passe par les fonctions RPC ci-dessous.
-- ---------------------------------------------------------------------

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.room_players
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

alter table public.categories enable row level security;
alter table public.words enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.rounds enable row level security;
alter table public.round_secrets enable row level security;
alter table public.guesses enable row level security;

drop policy if exists "categories lisibles" on public.categories;
create policy "categories lisibles" on public.categories
  for select to anon, authenticated using (true);

drop policy if exists "membres lisent la salle" on public.rooms;
create policy "membres lisent la salle" on public.rooms
  for select to authenticated using (public.is_room_member(id));

drop policy if exists "membres lisent les joueurs" on public.room_players;
create policy "membres lisent les joueurs" on public.room_players
  for select to authenticated using (public.is_room_member(room_id));

drop policy if exists "membres lisent les manches" on public.rounds;
create policy "membres lisent les manches" on public.rounds
  for select to authenticated using (public.is_room_member(room_id));

drop policy if exists "membres lisent les réponses" on public.guesses;
create policy "membres lisent les réponses" on public.guesses
  for select to authenticated using (public.is_room_member(room_id));

-- words et round_secrets : aucune policy => inaccessibles via l'API

grant select on public.categories to anon, authenticated;
grant select on public.rooms, public.room_players, public.rounds, public.guesses to authenticated;
revoke all on public.words, public.round_secrets from anon, authenticated;

-- ---------------------------------------------------------------------
--  Fonctions utilitaires (internes)
-- ---------------------------------------------------------------------

-- Normalise une réponse : minuscules, sans accents ni ponctuation,
-- sans article en tête, au singulier, sans espaces.
create or replace function private.normalize_answer(p_text text)
returns text
language plpgsql stable set search_path = public, extensions
as $$
declare
  s text;
begin
  s := lower(unaccent(coalesce(p_text, '')));
  s := regexp_replace(s, '[^a-z0-9]+', ' ', 'g');
  s := ' ' || btrim(s) || ' ';
  while s ~ '^ (le|la|les|l|un|une|des|du|de|d) .' loop
    s := regexp_replace(s, '^ (le|la|les|l|un|une|des|du|de|d) ', ' ');
  end loop;
  s := regexp_replace(s, '([a-z]{2})[sx] ', '\1 ', 'g');
  return replace(s, ' ', '');
end;
$$;

-- « Guitare électrique » -> « _______ __________ »
create or replace function private.word_mask(p_word text)
returns text
language sql immutable
as $$
  select regexp_replace(p_word, '[^ ''’-]', '_', 'g');
$$;

create or replace function private.clean_nickname(p_nickname text)
returns text
language plpgsql immutable
as $$
declare
  v text := left(btrim(regexp_replace(coalesce(p_nickname, ''), '\s+', ' ', 'g')), 20);
begin
  if v = '' then
    raise exception 'Choisissez un pseudo.';
  end if;
  return v;
end;
$$;

create or replace function private.require_user()
returns uuid
language plpgsql stable
as $$
begin
  if auth.uid() is null then
    raise exception 'Session expirée, rechargez la page.';
  end if;
  return auth.uid();
end;
$$;

create or replace function private.random_category()
returns smallint
language sql volatile set search_path = public
as $$
  select c.id from public.categories c
  where exists (select 1 from public.words w where w.category_id = c.id)
  order by random() limit 1;
$$;

-- Assez de joueurs actifs pour continuer ?
create or replace function private.enough_players(p_room_id uuid, p_mode text)
returns boolean
language sql stable set search_path = public
as $$
  select case
    when p_mode = 'team' then
      count(*) filter (where team = 'A') >= 2 and count(*) filter (where team = 'B') >= 2
    else count(*) >= 2
  end
  from public.room_players
  where room_id = p_room_id and left_at is null;
$$;

-- Mot au hasard dans la catégorie, en évitant ceux déjà joués dans la salle
create or replace function private.pick_word(p_room_id uuid, p_category_id smallint)
returns public.words
language plpgsql volatile set search_path = public
as $$
declare
  w public.words;
begin
  select wd.* into w from public.words wd
  where wd.category_id = p_category_id
    and not exists (
      select 1 from public.round_secrets s
      join public.rounds r on r.id = s.round_id
      where r.room_id = p_room_id and s.word_id = wd.id
    )
  order by random() limit 1;

  if not found then
    select wd.* into w from public.words wd
    where wd.category_id = p_category_id
    order by random() limit 1;
  end if;

  if w.id is null then
    raise exception 'Aucun mot disponible dans cette catégorie.';
  end if;
  return w;
end;
$$;

-- Tire le mot et lance le chrono de dessin (30 s en équipe, 45 s en solo)
create or replace function private.start_drawing(p_round_id uuid, p_category_id smallint)
returns void
language plpgsql volatile set search_path = public
as $$
declare
  v_round public.rounds;
  v_mode text;
  w public.words;
begin
  select * into v_round from public.rounds where id = p_round_id;
  select mode into v_mode from public.rooms where id = v_round.room_id;
  w := private.pick_word(v_round.room_id, p_category_id);

  insert into public.round_secrets (round_id, word_id, word, alternatives)
  values (p_round_id, w.id, w.word, w.alternatives)
  on conflict (round_id) do update
    set word_id = excluded.word_id, word = excluded.word, alternatives = excluded.alternatives;

  update public.rounds
  set category_id = p_category_id,
      phase = 'drawing',
      phase_ends_at = now() + make_interval(secs => case when v_mode = 'team' then 30 else 45 end)
  where id = p_round_id;
end;
$$;

-- Fin de manche : on dévoile le mot pendant quelques secondes
create or replace function private.reveal(p_round_id uuid, p_winner uuid, p_seconds int default 5)
returns void
language plpgsql volatile set search_path = public
as $$
begin
  update public.rounds r
  set phase = 'reveal',
      winner_id = p_winner,
      revealed_word = (select s.word from public.round_secrets s where s.round_id = r.id),
      phase_ends_at = now() + make_interval(secs => p_seconds)
  where r.id = p_round_id;
end;
$$;

-- Crée la manche n° p_no et désigne le dessinateur (rotation)
create or replace function private.begin_round(p_room_id uuid, p_no int)
returns boolean
language plpgsql volatile set search_path = public
as $$
declare
  v_room public.rooms;
  v_team text;
  v_turn int;
  v_count int;
  v_drawer uuid;
  v_round_id uuid;
begin
  select * into v_room from public.rooms where id = p_room_id;

  if v_room.mode = 'team' then
    v_team := case when p_no % 2 = 1 then 'A' else 'B' end;
    v_turn := (p_no + 1) / 2;
  else
    v_team := null;
    v_turn := p_no;
  end if;

  select count(*) into v_count from public.room_players
  where room_id = p_room_id and left_at is null and (v_team is null or team = v_team);
  if v_count = 0 then
    return false;
  end if;

  select user_id into v_drawer from public.room_players
  where room_id = p_room_id and left_at is null and (v_team is null or team = v_team)
  order by draw_order nulls last, joined_at
  offset (v_turn - 1) % v_count limit 1;

  insert into public.rounds (room_id, round_no, drawer_id, team, phase, phase_ends_at)
  values (p_room_id, p_no, v_drawer, v_team, 'choosing', now() + interval '15 seconds')
  returning id into v_round_id;

  update public.rooms set current_round = p_no, updated_at = now() where id = p_room_id;

  -- En solo, la catégorie est tirée au hasard : on passe directement au dessin
  if v_room.mode = 'solo' then
    perform private.start_drawing(v_round_id, private.random_category());
  end if;
  return true;
end;
$$;

-- Après l'affichage du mot : manche suivante, mort subite ou fin de partie
create or replace function private.next_round(p_room_id uuid)
returns void
language plpgsql volatile set search_path = public
as $$
declare
  v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id;

  if v_room.current_round >= v_room.total_rounds then
    -- Égalité en mode équipe : un set bonus (2 maximum), sinon fin
    if v_room.mode = 'team' and v_room.team_a_score = v_room.team_b_score and v_room.bonus_sets < 2 then
      update public.rooms
      set total_rounds = total_rounds + 2, bonus_sets = bonus_sets + 1
      where id = p_room_id;
    else
      update public.rooms set status = 'finished', updated_at = now() where id = p_room_id;
      return;
    end if;
  end if;

  if not private.enough_players(p_room_id, v_room.mode)
     or not private.begin_round(p_room_id, v_room.current_round + 1) then
    update public.rooms set status = 'finished', updated_at = now() where id = p_room_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
--  Fonctions RPC appelées par l'application
-- ---------------------------------------------------------------------

create or replace function public.server_now()
returns timestamptz
language sql stable
as $$ select now(); $$;

create or replace function public.create_room(p_nickname text, p_mode text default 'solo', p_team_sets int default 3)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_uid uuid := private.require_user();
  v_nick text := private.clean_nickname(p_nickname);
  v_code text;
  v_room_id uuid;
begin
  -- Ménage : les salles inactives depuis 12 h sont supprimées
  delete from public.rooms where updated_at < now() - interval '12 hours';

  loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.rooms where code = v_code);
  end loop;

  insert into public.rooms (code, host_id, mode, team_sets)
  values (v_code, v_uid, coalesce(p_mode, 'solo'), coalesce(p_team_sets, 3))
  returning id into v_room_id;

  insert into public.room_players (room_id, user_id, nickname, team)
  values (v_room_id, v_uid, v_nick, 'A');

  return jsonb_build_object('room_id', v_room_id, 'code', v_code);
end;
$$;

create or replace function public.join_room(p_code text, p_nickname text)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_uid uuid := private.require_user();
  v_nick text := private.clean_nickname(p_nickname);
  v_room public.rooms;
  v_a int;
  v_b int;
  v_total int;
begin
  select * into v_room from public.rooms where code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'Salle introuvable. Vérifiez le code.';
  end if;

  -- Déjà membre : on revient simplement dans la salle
  if exists (select 1 from public.room_players where room_id = v_room.id and user_id = v_uid) then
    update public.room_players
    set left_at = null,
        nickname = case when v_room.status = 'playing' then nickname else v_nick end
    where room_id = v_room.id and user_id = v_uid;
    return jsonb_build_object('room_id', v_room.id, 'code', v_room.code);
  end if;

  if v_room.status = 'playing' then
    raise exception 'La partie a déjà commencé. Attendez la fin pour rejoindre.';
  end if;

  if exists (
    select 1 from public.room_players
    where room_id = v_room.id and lower(nickname) = lower(v_nick)
  ) then
    raise exception 'Ce pseudo est déjà pris dans cette salle.';
  end if;

  select count(*) filter (where team = 'A'), count(*) filter (where team = 'B'), count(*)
  into v_a, v_b, v_total
  from public.room_players where room_id = v_room.id;

  if v_total >= 12 then
    raise exception 'La salle est pleine (12 joueurs maximum).';
  end if;

  insert into public.room_players (room_id, user_id, nickname, team)
  values (v_room.id, v_uid, v_nick, case when v_a <= v_b then 'A' else 'B' end);

  update public.rooms set updated_at = now() where id = v_room.id;
  return jsonb_build_object('room_id', v_room.id, 'code', v_room.code);
end;
$$;

create or replace function public.leave_room(p_room_id uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_uid uuid := private.require_user();
  v_room public.rooms;
  v_round public.rounds;
  v_next_host uuid;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    return;
  end if;

  if v_room.status = 'playing' then
    update public.room_players set left_at = now() where room_id = p_room_id and user_id = v_uid;
  else
    delete from public.room_players where room_id = p_room_id and user_id = v_uid;
  end if;

  if not exists (select 1 from public.room_players where room_id = p_room_id and left_at is null) then
    delete from public.rooms where id = p_room_id;
    return;
  end if;

  if v_room.host_id = v_uid then
    select user_id into v_next_host from public.room_players
    where room_id = p_room_id and left_at is null
    order by joined_at limit 1;
    update public.rooms set host_id = v_next_host where id = p_room_id;
  end if;

  if v_room.status = 'playing' then
    if not private.enough_players(p_room_id, v_room.mode) then
      update public.rooms set status = 'finished', updated_at = now() where id = p_room_id;
      return;
    end if;
    select * into v_round from public.rounds where room_id = p_room_id and round_no = v_room.current_round;
    if found and v_round.drawer_id = v_uid and v_round.phase <> 'reveal' then
      if v_round.phase = 'choosing' then
        perform private.start_drawing(v_round.id, private.random_category());
      end if;
      perform private.reveal(v_round.id, null, 4);
    end if;
  end if;
end;
$$;

create or replace function public.update_room_settings(p_room_id uuid, p_mode text, p_team_sets int)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_uid uuid := private.require_user();
  v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.host_id <> v_uid then
    raise exception 'Seul l''hôte peut modifier les réglages.';
  end if;
  if v_room.status = 'playing' then
    raise exception 'Impossible pendant une partie.';
  end if;
  update public.rooms
  set mode = coalesce(p_mode, mode), team_sets = coalesce(p_team_sets, team_sets), updated_at = now()
  where id = p_room_id;
end;
$$;

create or replace function public.set_my_team(p_room_id uuid, p_team text)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_uid uuid := private.require_user();
begin
  if p_team not in ('A', 'B') then
    raise exception 'Équipe inconnue.';
  end if;
  if exists (select 1 from public.rooms where id = p_room_id and status = 'playing') then
    raise exception 'Impossible de changer d''équipe pendant une partie.';
  end if;
  update public.room_players set team = p_team where room_id = p_room_id and user_id = v_uid;
end;
$$;

create or replace function public.shuffle_teams(p_room_id uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_uid uuid := private.require_user();
begin
  if not exists (select 1 from public.rooms where id = p_room_id and host_id = v_uid and status <> 'playing') then
    raise exception 'Seul l''hôte peut mélanger les équipes.';
  end if;
  with ordered as (
    select user_id, row_number() over (order by random()) as rn
    from public.room_players where room_id = p_room_id
  )
  update public.room_players p
  set team = case when o.rn % 2 = 1 then 'A' else 'B' end
  from ordered o
  where p.room_id = p_room_id and p.user_id = o.user_id;
end;
$$;

create or replace function public.start_game(p_room_id uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_uid uuid := private.require_user();
  v_room public.rooms;
  v_n int;
  v_a int;
  v_b int;
  v_total int;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.host_id <> v_uid then
    raise exception 'Seul l''hôte peut lancer la partie.';
  end if;
  if v_room.status = 'playing' then
    raise exception 'La partie est déjà en cours.';
  end if;

  delete from public.room_players where room_id = p_room_id and left_at is not null;

  select count(*), count(*) filter (where team = 'A'), count(*) filter (where team = 'B')
  into v_n, v_a, v_b
  from public.room_players where room_id = p_room_id;

  if v_room.mode = 'solo' then
    if v_n < 2 then
      raise exception 'Il faut au moins 2 joueurs pour le mode solo.';
    end if;
    -- 5 sets minimum, et chacun dessine le même nombre de fois
    -- (2 j. -> 6, 3 j. -> 6, 4 j. -> 8, 5 j. et plus -> nombre de joueurs)
    v_total := ceil(5.0 / v_n)::int * v_n;
  else
    if v_n < 4 then
      raise exception 'Il faut au moins 4 joueurs pour le mode équipe.';
    end if;
    if v_a < 2 or v_b < 2 then
      raise exception 'Chaque équipe doit avoir au moins 2 joueurs.';
    end if;
    -- Un set = l'équipe A dessine puis l'équipe B dessine
    v_total := v_room.team_sets * 2;
  end if;

  delete from public.rounds where room_id = p_room_id;

  with ordered as (
    select user_id, row_number() over (order by random()) as rn
    from public.room_players where room_id = p_room_id
  )
  update public.room_players p
  set score = 0, draw_order = o.rn
  from ordered o
  where p.room_id = p_room_id and p.user_id = o.user_id;

  update public.rooms
  set status = 'playing', total_rounds = v_total, current_round = 0,
      team_a_score = 0, team_b_score = 0, bonus_sets = 0, updated_at = now()
  where id = p_room_id;

  perform private.begin_round(p_room_id, 1);
end;
$$;

create or replace function public.return_to_lobby(p_room_id uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_uid uuid := private.require_user();
begin
  if not exists (select 1 from public.rooms where id = p_room_id and host_id = v_uid and status = 'finished') then
    raise exception 'Seul l''hôte peut revenir au salon après la partie.';
  end if;
  delete from public.room_players where room_id = p_room_id and left_at is not null;
  delete from public.rounds where room_id = p_room_id;
  update public.room_players set score = 0 where room_id = p_room_id;
  update public.rooms
  set status = 'lobby', current_round = 0, total_rounds = 0,
      team_a_score = 0, team_b_score = 0, bonus_sets = 0, updated_at = now()
  where id = p_room_id;
end;
$$;

-- Le dessinateur (mode équipe) choisit sa catégorie
create or replace function public.choose_category(p_round_id uuid, p_category_id int)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_uid uuid := private.require_user();
  v_round public.rounds;
begin
  select * into v_round from public.rounds where id = p_round_id;
  if not found then
    raise exception 'Manche introuvable.';
  end if;
  perform 1 from public.rooms where id = v_round.room_id for update;
  select * into v_round from public.rounds where id = p_round_id;

  if v_round.drawer_id <> v_uid then
    raise exception 'Ce n''est pas votre tour.';
  end if;
  if v_round.phase <> 'choosing' then
    return;
  end if;
  if not exists (select 1 from public.categories where id = p_category_id) then
    raise exception 'Catégorie inconnue.';
  end if;
  perform private.start_drawing(p_round_id, p_category_id::smallint);
end;
$$;

-- Proposition d'un joueur. Renvoie 'correct', 'close', 'wrong' ou 'ignored'.
create or replace function public.submit_guess(p_round_id uuid, p_text text)
returns text
language plpgsql volatile security definer set search_path = public, extensions
as $$
declare
  v_uid uuid := private.require_user();
  v_clean text := left(btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')), 60);
  v_round public.rounds;
  v_room public.rooms;
  v_me public.room_players;
  v_secret public.round_secrets;
  v_guess text;
  v_target text;
  v_candidate text;
  v_dist int;
  v_tol int;
  v_close boolean := false;
begin
  if v_clean = '' then
    return 'ignored';
  end if;

  select * into v_round from public.rounds where id = p_round_id;
  if not found then
    return 'ignored';
  end if;

  -- Verrou sur la salle : un seul « premier qui trouve »
  select * into v_room from public.rooms where id = v_round.room_id for update;
  select * into v_round from public.rounds where id = p_round_id;

  if v_room.status <> 'playing' or v_room.current_round <> v_round.round_no
     or v_round.phase <> 'drawing' or now() > v_round.phase_ends_at + interval '1 second' then
    return 'ignored';
  end if;

  select * into v_me from public.room_players where room_id = v_room.id and user_id = v_uid;
  if not found then
    raise exception 'Vous ne faites pas partie de cette salle.';
  end if;
  if v_uid = v_round.drawer_id then
    return 'ignored';
  end if;
  if v_room.mode = 'team' and v_me.team is distinct from v_round.team then
    return 'ignored';
  end if;

  select * into v_secret from public.round_secrets where round_id = p_round_id;
  v_guess := private.normalize_answer(v_clean);

  if v_guess <> '' then
    foreach v_candidate in array array_prepend(v_secret.word, v_secret.alternatives) loop
      v_target := private.normalize_answer(v_candidate);
      continue when v_target = '';
      v_tol := case when length(v_target) <= 4 then 0 when length(v_target) <= 8 then 1 else 2 end;
      v_dist := levenshtein(left(v_guess, 100), left(v_target, 100));

      if v_dist <= v_tol then
        insert into public.guesses (room_id, round_id, user_id, nickname, content, is_correct)
        values (v_room.id, p_round_id, v_uid, v_me.nickname, null, true);

        update public.room_players set score = score + 1
        where room_id = v_room.id and user_id = v_uid;

        if v_room.mode = 'team' then
          update public.rooms
          set team_a_score = team_a_score + (case when v_round.team = 'A' then 1 else 0 end),
              team_b_score = team_b_score + (case when v_round.team = 'B' then 1 else 0 end)
          where id = v_room.id;
        end if;

        perform private.reveal(p_round_id, v_uid);
        return 'correct';
      end if;

      if (length(v_target) >= 4 and v_dist <= v_tol + 1) or strpos(v_guess, v_target) > 0 then
        v_close := true;
      end if;
    end loop;
  end if;

  -- Une réponse « presque » n'est pas affichée aux autres (elle dévoilerait le mot)
  if v_close then
    return 'close';
  end if;

  insert into public.guesses (room_id, round_id, user_id, nickname, content, is_correct)
  values (v_room.id, p_round_id, v_uid, v_me.nickname, v_clean, false);
  return 'wrong';
end;
$$;

-- Appelé par les clients quand le chrono d'une phase est écoulé
create or replace function public.advance_room(p_room_id uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_room public.rooms;
  v_round public.rounds;
begin
  perform private.require_user();
  if not public.is_room_member(p_room_id) then
    raise exception 'Accès refusé.';
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if v_room.status <> 'playing' then
    return;
  end if;

  select * into v_round from public.rounds where room_id = p_room_id and round_no = v_room.current_round;
  if not found or now() < v_round.phase_ends_at then
    return;
  end if;

  if v_round.phase = 'choosing' then
    perform private.start_drawing(v_round.id, private.random_category());
  elsif v_round.phase = 'drawing' then
    perform private.reveal(v_round.id, null);
  else
    perform private.next_round(p_room_id);
  end if;
end;
$$;

-- L'hôte ou le dessinateur peut passer le tour (joueur absent, mot trop dur…)
create or replace function public.skip_round(p_room_id uuid)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_uid uuid := private.require_user();
  v_room public.rooms;
  v_round public.rounds;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'playing' then
    return;
  end if;
  select * into v_round from public.rounds where room_id = p_room_id and round_no = v_room.current_round;
  if not found or v_round.phase = 'reveal' then
    return;
  end if;
  if v_uid <> v_room.host_id and v_uid <> v_round.drawer_id then
    raise exception 'Seul l''hôte ou le dessinateur peut passer le tour.';
  end if;
  if v_round.phase = 'choosing' then
    perform private.start_drawing(v_round.id, private.random_category());
  end if;
  perform private.reveal(v_round.id, null, 4);
end;
$$;

-- Tout l'état de la salle en un seul appel (le mot n'est donné qu'au dessinateur)
create or replace function public.get_room_state(p_room_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid uuid := private.require_user();
  v_room public.rooms;
  v_round public.rounds;
  v_word text;
begin
  if not public.is_room_member(p_room_id) then
    raise exception 'Vous ne faites plus partie de cette salle.';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  select * into v_round from public.rounds where room_id = p_room_id and round_no = v_room.current_round;
  if v_round.id is not null then
    select word into v_word from public.round_secrets where round_id = v_round.id;
  end if;

  return jsonb_build_object(
    'server_now', now(),
    'room', to_jsonb(v_room),
    'players', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.joined_at)
      from public.room_players p where p.room_id = p_room_id
    ), '[]'::jsonb),
    'round', case when v_round.id is null then null else
      to_jsonb(v_round) || jsonb_build_object(
        'word', case when v_round.drawer_id = v_uid or v_round.phase = 'reveal' then v_word end,
        'mask', case when v_word is not null then private.word_mask(v_word) end,
        'category', (select to_jsonb(c) from public.categories c where c.id = v_round.category_id)
      )
    end,
    'guesses', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.id)
      from (
        select * from public.guesses
        where round_id = v_round.id
        order by id desc limit 60
      ) g
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
--  Anti-pause : appelé plusieurs fois par jour par la tâche planifiée Vercel
--  (api/keepalive.ts) pour que le projet gratuit ne soit jamais jugé inactif.
-- ---------------------------------------------------------------------

create table if not exists public.keepalive (
  id int primary key default 1 check (id = 1),
  pinged_at timestamptz not null default now(),
  ping_count bigint not null default 0
);
alter table public.keepalive enable row level security;

create or replace function public.keep_alive()
returns timestamptz
language sql volatile security definer set search_path = public
as $$
  insert into public.keepalive (id, pinged_at, ping_count) values (1, now(), 1)
  on conflict (id) do update set pinged_at = excluded.pinged_at, ping_count = public.keepalive.ping_count + 1
  returning pinged_at;
$$;

-- ---------------------------------------------------------------------
--  Droits d'exécution
-- ---------------------------------------------------------------------

revoke all on schema private from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

revoke execute on function
  public.create_room(text, text, int),
  public.join_room(text, text),
  public.leave_room(uuid),
  public.update_room_settings(uuid, text, int),
  public.set_my_team(uuid, text),
  public.shuffle_teams(uuid),
  public.start_game(uuid),
  public.return_to_lobby(uuid),
  public.choose_category(uuid, int),
  public.submit_guess(uuid, text),
  public.advance_room(uuid),
  public.skip_round(uuid),
  public.get_room_state(uuid)
from public, anon;

revoke all on public.keepalive from anon, authenticated;
grant execute on function public.keep_alive() to anon, authenticated;

grant execute on function
  public.server_now(),
  public.is_room_member(uuid),
  public.create_room(text, text, int),
  public.join_room(text, text),
  public.leave_room(uuid),
  public.update_room_settings(uuid, text, int),
  public.set_my_team(uuid, text),
  public.shuffle_teams(uuid),
  public.start_game(uuid),
  public.return_to_lobby(uuid),
  public.choose_category(uuid, int),
  public.submit_guess(uuid, text),
  public.advance_room(uuid),
  public.skip_round(uuid),
  public.get_room_state(uuid)
to authenticated;

-- ---------------------------------------------------------------------
--  Realtime : les clients sont notifiés des changements de ces tables
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['rooms', 'room_players', 'rounds', 'guesses'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;
