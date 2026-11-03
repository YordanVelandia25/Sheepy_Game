-- Ranking mundial de Sheepy Jumps
-- Un registro por jugador (por nombre, sin distinguir mayúsculas).
-- Cuando el jugador supera su marca personal se MODIFICA su registro; no se crea otro.
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

-- Restos de versiones anteriores
drop function if exists public.rename_score(bigint, uuid, text);
alter table public.scores drop column if exists edit_token;

-- Datos que no cumplen las reglas
delete from public.scores where name is null or btrim(name) = '' or meters is null or meters < 1 or meters > 100000;
update public.scores set name = left(btrim(regexp_replace(name, '\s+', ' ', 'g')), 16)
 where name <> left(btrim(regexp_replace(name, '\s+', ' ', 'g')), 16);

-- 2) Si ya había varios registros del mismo jugador, deja solo el mejor
delete from public.scores s
using public.scores t
where lower(btrim(s.name)) = lower(btrim(t.name))
  and s.id <> t.id
  and (t.meters > s.meters
       or (t.meters = s.meters and (t.created_at, t.id) < (s.created_at, s.id)));

-- Reglas de los datos y un registro por nombre
alter table public.scores drop constraint if exists scores_name_check;
alter table public.scores drop constraint if exists scores_meters_check;
alter table public.scores add constraint scores_name_check check (char_length(name) between 1 and 16);
alter table public.scores add constraint scores_meters_check check (meters between 1 and 100000);
drop index if exists public.scores_name_key;
create unique index scores_name_key on public.scores (lower(btrim(name)));
create index if not exists scores_rank_idx on public.scores (meters desc, created_at asc);

-- 3) Seguridad: el público solo puede LEER nombre, metros y fecha.
--    No puede insertar, cambiar ni borrar filas directamente.
alter table public.scores enable row level security;
revoke all on public.scores from anon, authenticated;
grant select (id, name, meters, created_at) on public.scores to anon, authenticated;
drop policy if exists "Ranking público" on public.scores;
create policy "Ranking público" on public.scores for select to anon, authenticated using (true);

-- 4) Guardar una partida:
--    - si el jugador no existe, crea su registro
--    - si existe y la nueva marca es mayor, MODIFICA su registro
--    - si no la supera, no cambia nada
drop function if exists public.submit_score(text, integer);
create function public.submit_score(p_name text, p_meters integer)
returns table (score_rank bigint, best_meters integer, improved boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 16);
  v_row scores%rowtype;
  v_improved boolean := false;
begin
  if v_name = '' then v_name := 'Jugador'; end if;
  if p_meters is null or p_meters < 1 or p_meters > 100000 then
    raise exception 'Puntuación no válida: %', p_meters;
  end if;

  -- Evita que dos envíos simultáneos del mismo jugador choquen
  perform pg_advisory_xact_lock(hashtext(lower(v_name)));

  select * into v_row from scores where lower(btrim(name)) = lower(v_name) limit 1;

  if not found then
    insert into scores (name, meters) values (v_name, p_meters) returning * into v_row;
    v_improved := true;
  elsif p_meters > v_row.meters then
    update scores set meters = p_meters, name = v_name, created_at = now()
     where id = v_row.id
     returning * into v_row;
    v_improved := true;
  end if;

  return query
    select (select count(*) from scores s where s.meters > v_row.meters) + 1,
           v_row.meters,
           v_improved;
end;
$$;

revoke all on function public.submit_score(text, integer) from public;
grant execute on function public.submit_score(text, integer) to anon, authenticated;

-- 5) Que la API de Supabase vea los cambios ya mismo
notify pgrst, 'reload schema';

-- 6) Comprobación final
select 'Ranking listo' as resultado,
       (select count(*) from public.scores) as jugadores,
       (select count(*) - count(distinct lower(btrim(name))) from public.scores) as duplicados;
