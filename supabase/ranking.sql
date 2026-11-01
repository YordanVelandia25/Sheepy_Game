-- Ranking mundial de Oveja Saltarina
-- Una sola puntuación por jugador (por nombre, sin distinguir mayúsculas);
-- solo se reemplaza cuando se supera la anterior.
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo esto → Run.
-- Se puede ejecutar más de una vez sin problema (también sobre la versión anterior).

-- 1) Tabla de puntuaciones
create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  name        text        not null check (char_length(name) between 1 and 16),
  meters      integer     not null check (meters between 1 and 100000),
  created_at  timestamptz not null default now()   -- cuándo se logró la marca
);

-- Limpieza de la versión anterior: quita el token de edición y la función de renombrar
drop function if exists public.rename_score(bigint, uuid, text);
alter table public.scores drop column if exists edit_token;

-- Deja solo la mejor marca de cada jugador (por si ya había duplicados)
delete from public.scores s
using public.scores t
where lower(s.name) = lower(t.name)
  and (t.meters > s.meters or (t.meters = s.meters and t.created_at < s.created_at)
       or (t.meters = s.meters and t.created_at = s.created_at and t.id < s.id));

-- Un jugador = un nombre (sin distinguir mayúsculas)
create unique index if not exists scores_name_key on public.scores (lower(name));
create index if not exists scores_rank_idx on public.scores (meters desc, created_at asc);

-- 2) Seguridad: el público solo puede LEER nombre, metros y fecha.
--    No puede insertar, cambiar ni borrar filas directamente.
alter table public.scores enable row level security;
revoke all on public.scores from anon, authenticated;
grant select (id, name, meters, created_at) on public.scores to anon, authenticated;
drop policy if exists "Ranking público" on public.scores;
create policy "Ranking público" on public.scores for select to anon, authenticated using (true);

-- 3) Enviar una puntuación: crea al jugador o mejora su marca si la supera
drop function if exists public.submit_score(text, integer);
create function public.submit_score(p_name text, p_meters integer)
returns table (score_rank bigint, best_meters integer, improved boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 16);
  v_improved boolean;
  v_best integer;
begin
  if v_name = '' then v_name := 'Jugador'; end if;
  if p_meters is null or p_meters < 1 or p_meters > 100000 then
    raise exception 'Puntuación no válida';
  end if;
  -- Límite simple contra spam: máximo 60 envíos por minuto en total
  if (select count(*) from scores where created_at > now() - interval '1 minute') >= 60 then
    raise exception 'Demasiadas puntuaciones, inténtalo en un momento';
  end if;

  insert into scores as s (name, meters) values (v_name, p_meters)
  on conflict ((lower(name))) do update
    set meters = excluded.meters, name = excluded.name, created_at = now()
    where s.meters < excluded.meters;
  v_improved := found;  -- false si ya tenía una marca igual o mejor

  select s.meters into v_best from scores s where lower(s.name) = lower(v_name);

  return query
    select (select count(*) from scores s where s.meters > v_best) + 1, v_best, v_improved;
end;
$$;

revoke all on function public.submit_score(text, integer) from public;
grant execute on function public.submit_score(text, integer) to anon, authenticated;
