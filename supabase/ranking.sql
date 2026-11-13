-- Ranking mundial de Sheepy Jumps, separado por nivel de dificultad (facil, dificil, extremo)
-- Un registro por jugador y nivel (por nombre, sin distinguir mayúsculas).
-- Cuando el jugador supera su marca personal en un nivel se MODIFICA ese registro; no se crea otro.
-- Las puntuaciones que ya existían quedan en el nivel "dificil" (es el juego de siempre).
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pega TODO esto → Run.
-- Se puede ejecutar varias veces sin problema. Al final debe mostrar "Ranking listo".

-- 1) Tabla
create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  name        text        not null,
  meters      integer     not null,
  created_at  timestamptz not null default now()   -- cuándo se logró la marca
);

-- Por si la tabla se creó a mano con otras columnas
alter table public.scores add column if not exists name text;
alter table public.scores add column if not exists meters integer;
alter table public.scores add column if not exists created_at timestamptz not null default now();
alter table public.scores add column if not exists level text not null default 'dificil';
update public.scores set level = 'dificil' where level is null or level not in ('facil', 'dificil', 'extremo');

-- Restos de versiones anteriores
drop function if exists public.rename_score(bigint, uuid, text);
alter table public.scores drop column if exists edit_token;

-- Datos que no cumplen las reglas
delete from public.scores where name is null or btrim(name) = '' or meters is null or meters < 1 or meters > 100000;
update public.scores set name = left(btrim(regexp_replace(name, '\s+', ' ', 'g')), 16)
 where name <> left(btrim(regexp_replace(name, '\s+', ' ', 'g')), 16);

-- 2) Si ya había varios registros del mismo jugador en el mismo nivel, deja solo el mejor
delete from public.scores s
using public.scores t
where lower(btrim(s.name)) = lower(btrim(t.name))
  and s.level = t.level
  and s.id <> t.id
  and (t.meters > s.meters
       or (t.meters = s.meters and (t.created_at, t.id) < (s.created_at, s.id)));

-- Reglas de los datos y un registro por nombre y nivel
alter table public.scores drop constraint if exists scores_name_check;
alter table public.scores drop constraint if exists scores_meters_check;
alter table public.scores drop constraint if exists scores_level_check;
alter table public.scores add constraint scores_name_check check (char_length(name) between 1 and 16);
alter table public.scores add constraint scores_meters_check check (meters between 1 and 100000);
alter table public.scores add constraint scores_level_check check (level in ('facil', 'dificil', 'extremo'));
drop index if exists public.scores_name_key;
-- Nombre en minúsculas (lo calcula la base de datos sola): sirve para buscar a un jugador rápido
alter table public.scores add column if not exists name_key text generated always as (lower(btrim(name))) stored;
drop index if exists public.scores_name_level_key;
create unique index scores_name_level_key on public.scores (name_key, level);   -- un registro por nombre y nivel + búsqueda por nombre
drop index if exists public.scores_rank_idx;
create index scores_rank_idx on public.scores (level, meters desc, created_at asc);

-- 3) Seguridad: el público solo puede LEER nombre, metros, nivel y fecha.
--    No puede insertar, cambiar ni borrar filas directamente.
alter table public.scores enable row level security;
revoke all on public.scores from anon, authenticated;
grant select (id, name, name_key, meters, level, created_at) on public.scores to anon, authenticated;
drop policy if exists "Ranking público" on public.scores;
create policy "Ranking público" on public.scores for select to anon, authenticated using (true);

-- 4) Guardar una partida en un nivel:
--    - si el jugador no existe en ese nivel, crea su registro
--    - si existe y la nueva marca es mayor, MODIFICA su registro
--    - si no la supera, no cambia nada
--    Devuelve el puesto dentro de ese nivel.
drop function if exists public.submit_score(text, integer);
drop function if exists public.submit_score(text, integer, text);
create function public.submit_score(p_name text, p_meters integer, p_level text)
returns table (score_rank bigint, best_meters integer, improved boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 16);
  v_level text := lower(btrim(coalesce(p_level, 'dificil')));
  v_row scores%rowtype;
  v_improved boolean := false;
begin
  if v_name = '' then v_name := 'Jugador'; end if;
  if v_level not in ('facil', 'dificil', 'extremo') then
    raise exception 'Nivel no válido: %', p_level;
  end if;
  if p_meters is null or p_meters < 1 or p_meters > 100000 then
    raise exception 'Puntuación no válida: %', p_meters;
  end if;

  -- Evita que dos envíos simultáneos del mismo jugador choquen
  perform pg_advisory_xact_lock(hashtext(lower(v_name) || '|' || v_level));

  select * into v_row from scores where name_key = lower(v_name) and level = v_level limit 1;

  if not found then
    insert into scores (name, meters, level) values (v_name, p_meters, v_level) returning * into v_row;
    v_improved := true;
  elsif p_meters > v_row.meters then
    update scores set meters = p_meters, name = v_name, created_at = now()
     where id = v_row.id
     returning * into v_row;
    v_improved := true;
  end if;

  return query
    select (select count(*) from scores s where s.level = v_level and s.meters > v_row.meters) + 1,
           v_row.meters,
           v_improved;
end;
$$;

-- Versión anterior (sin nivel), para quien tenga el juego viejo abierto: guarda en "dificil"
create function public.submit_score(p_name text, p_meters integer)
returns table (score_rank bigint, best_meters integer, improved boolean)
language sql
security definer
set search_path = public
as $$
  select * from public.submit_score(p_name, p_meters, 'dificil');
$$;

revoke all on function public.submit_score(text, integer, text) from public;
revoke all on function public.submit_score(text, integer) from public;
grant execute on function public.submit_score(text, integer, text) to anon, authenticated;
grant execute on function public.submit_score(text, integer) to anon, authenticated;

-- 5) Que la API de Supabase vea los cambios ya mismo
notify pgrst, 'reload schema';

-- 6) Comprobación final
select 'Ranking listo' as resultado,
       (select count(*) from public.scores where level = 'facil') as en_facil,
       (select count(*) from public.scores where level = 'dificil') as en_dificil,
       (select count(*) from public.scores where level = 'extremo') as en_extremo,
       (select count(*) - count(distinct (lower(btrim(name)), level)) from public.scores) as duplicados;
