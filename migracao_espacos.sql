-- Migração: separação por espaço (Conjunta / Pessoa 1 / Pessoa 2)
-- Rode isso inteiro no Supabase: Dashboard > SQL Editor > New query > cole tudo > Run
-- É seguro rodar mais de uma vez (idempotente).

-- 1) transactions: nova coluna "space" (joint | p1 | p2)
alter table transactions
  add column if not exists space text not null default 'joint';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_space_check'
  ) then
    alter table transactions
      add constraint transactions_space_check check (space in ('joint', 'p1', 'p2'));
  end if;
end $$;

-- 2) app_state: nova coluna "settings" com os nomes exibidos nas abas pessoais
alter table app_state
  add column if not exists settings jsonb not null default '{"p1Name":"Pessoa 1","p2Name":"Pessoa 2"}'::jsonb;

-- 3) Migra os gastos fixos existentes (aluguel, luz, internet...) para dentro do espaço "joint",
--    sem perder nada. Só roda se ainda estiver no formato antigo (array simples).
update app_state
set fixed_templates = jsonb_build_object(
  'joint', coalesce(fixed_templates, '[]'::jsonb),
  'p1', '[]'::jsonb,
  'p2', '[]'::jsonb
)
where id = 1
  and jsonb_typeof(fixed_templates) = 'array';

-- Conferir o resultado:
-- select fixed_templates, settings from app_state where id = 1;
-- select space, count(*) from transactions group by space;
