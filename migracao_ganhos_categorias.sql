-- Migração: ganhos mensais + categorias nos gastos variáveis
-- Rode isso inteiro no Supabase: Dashboard > SQL Editor > New query > cole tudo > Run
-- É seguro rodar mais de uma vez (idempotente). Não apaga nenhum dado existente.

-- 1) Categoria nos gastos variáveis (usada no relatório)
alter table transactions
  add column if not exists category text not null default 'outro';

-- 2) Ganhos mensais (salário, extras), separados por espaço (joint/p1/p2)
create table if not exists income (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  space text not null default 'joint' check (space in ('joint', 'p1', 'p2')),
  description text not null,
  amount numeric not null,
  created_at timestamptz default now()
);

alter table income enable row level security;
drop policy if exists "allow all income" on income;
create policy "allow all income" on income for all using (true) with check (true);

-- 3) Sincronização em tempo real da nova tabela
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'income'
  ) then
    alter publication supabase_realtime add table income;
  end if;
end $$;
