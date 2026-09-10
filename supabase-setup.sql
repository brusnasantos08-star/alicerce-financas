-- ALICERCE — script de configuração do Supabase
-- Cole este arquivo inteiro no SQL Editor do seu projeto Supabase e clique em "Run".
-- Ele cria as tabelas, o bucket de imagens, as permissões e ativa a sincronização em tempo real.

-- 1) Dados compartilhados (gastos fixos, status de pagamento, investimentos)
create table if not exists app_state (
  id integer primary key default 1,
  fixed_templates jsonb not null default '[]',
  paid_status jsonb not null default '{}',
  investments jsonb not null default '{}',
  updated_at timestamptz default now()
);

insert into app_state (id, fixed_templates, paid_status, investments)
values (
  1,
  '[{"id":"fx-aluguel","name":"Aluguel","amount":1500,"icon":"Home"},{"id":"fx-streaming","name":"Streamings","amount":60,"icon":"Tv"},{"id":"fx-luz","name":"Luz","amount":180,"icon":"Zap"},{"id":"fx-internet","name":"Internet","amount":100,"icon":"Wifi"},{"id":"fx-alimentacao","name":"Alimentação","amount":600,"icon":"UtensilsCrossed"}]'::jsonb,
  '{}'::jsonb,
  '{"balance":0,"goalName":"Entrada do apartamento","goalAmount":50000,"contributions":{}}'::jsonb
)
on conflict (id) do nothing;

-- 2) Lançamentos variáveis (comprovantes)
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  amount numeric not null,
  description text not null,
  date date not null,
  image_url text,
  created_at timestamptz default now()
);

-- 2b) Separação por espaço: conta conjunta do casal + área pessoal de cada um
alter table transactions
  add column if not exists space text not null default 'joint';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_space_check') then
    alter table transactions add constraint transactions_space_check check (space in ('joint', 'p1', 'p2'));
  end if;
end $$;

alter table app_state
  add column if not exists settings jsonb not null default '{"p1Name":"Pessoa 1","p2Name":"Pessoa 2"}'::jsonb;

-- Migra gastos fixos existentes (formato antigo: array simples) para o formato por espaço.
-- Só roda se ainda estiver no formato antigo — seguro rodar de novo.
update app_state
set fixed_templates = jsonb_build_object('joint', coalesce(fixed_templates, '[]'::jsonb), 'p1', '[]'::jsonb, 'p2', '[]'::jsonb)
where id = 1 and jsonb_typeof(fixed_templates) = 'array';

-- 2c) Categoria nos gastos variáveis (usada no relatório)
alter table transactions
  add column if not exists category text not null default 'outro';

-- 2d) Ganhos mensais (salário, extras), também separados por espaço
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

-- 3) Bucket de armazenamento para os prints dos comprovantes
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

-- 4) Permissões — app privado para uso entre vocês dois
alter table app_state enable row level security;
alter table transactions enable row level security;

drop policy if exists "allow all app_state" on app_state;
create policy "allow all app_state" on app_state for all using (true) with check (true);

drop policy if exists "allow all transactions" on transactions;
create policy "allow all transactions" on transactions for all using (true) with check (true);

drop policy if exists "public read receipts" on storage.objects;
create policy "public read receipts" on storage.objects for select using (bucket_id = 'receipts');

drop policy if exists "anon upload receipts" on storage.objects;
create policy "anon upload receipts" on storage.objects for insert with check (bucket_id = 'receipts');

drop policy if exists "anon delete receipts" on storage.objects;
create policy "anon delete receipts" on storage.objects for delete using (bucket_id = 'receipts');

-- 5) Sincronização em tempo real entre os dois celulares (seguro rodar de novo)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_state'
  ) then
    alter publication supabase_realtime add table app_state;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table transactions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'income'
  ) then
    alter publication supabase_realtime add table income;
  end if;
end $$;
