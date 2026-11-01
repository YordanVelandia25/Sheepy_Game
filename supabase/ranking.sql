-- Ranking mundial de Oveja Saltarina
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo esto → Run.
-- Se puede ejecutar más de una vez sin problema.

-- 1) Tabla de puntuaciones
create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  name        text        not null check (char_length(name) between 1 and 16),
  meters      integer     not null check (meters between 1 and 100000),
  created_at  timestamptz not null default now(),
  edit_token  uuid        not null default gen_random_uuid()  -- secreto para renombrar; nunca se publica
);
create index if not exists scores_rank_idx on public.scores (meters desc, created_at asc);

-- 2) Seguridad: el público solo puede LEER nombre, metros y fecha.
--    No puede insertar, cambiar ni borrar filas directamente.
alter table public.scores enable row level security;
revoke all on public.scores from anon, authenticated;
grant select (id, name, meters, created_at) on public.scores to anon, authenticated;
drop policy if exists "Ranking público" on public.scores;
create policy "Ranking público" on public.scores for select to anon, authenticated using (true);

-- 3) Enviar una puntuación (valida y limpia el nombre en el servidor)
create or replace function public.submit_score(p_name text, p_meters integer)
returns table (score_id bigint, token uuid, score_rank bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 16);
  v_id bigint;
  v_token uuid;
begin
  if v_name = '' then v_name := 'Jugador'; end if;
  if p_meters is null or p_meters < 1 or p_meters > 100000 then
    raise exception 'Puntuación no válida';
  end if;
  -- Límite simple contra spam: máximo 60 puntuaciones por minuto en total
  if (select count(*) from scores where created_at > now() - interval '1 minute') >= 60 then
    raise exception 'Demasiadas puntuaciones, inténtalo en un momento';
  end if;

  insert into scores (name, meters) values (v_name, p_meters)
  returning scores.id, scores.edit_token into v_id, v_token;

  return query
    select v_id, v_token,
           (select count(*) from scores s where s.meters > p_meters) + 1;
end;
$$;

-- 4) Cambiar el nombre de una puntuación recién enviada (30 min, con su token)
create or replace function public.rename_score(p_id bigint, p_token uuid, p_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 16);
begin
  if v_name = '' then v_name := 'Jugador'; end if;
  update scores set name = v_name
   where id = p_id and edit_token = p_token and created_at > now() - interval '30 minutes';
  return found;
end;
$$;

revoke all on function public.submit_score(text, integer) from public;
revoke all on function public.rename_score(bigint, uuid, text) from public;
grant execute on function public.submit_score(text, integer) to anon, authenticated;
grant execute on function public.rename_score(bigint, uuid, text) to anon, authenticated;
