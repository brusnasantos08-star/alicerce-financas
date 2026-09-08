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

-- 3) Bucket de armazenamento para os prints dos comprovantes
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

-- 4) Permissões — app privado para uso entre vocês dois
alter table app_state enable row level security;
alter table transactions enable row level security;

create policy "allow all app_state" on app_state for all using (true) with check (true);
create policy "allow all transactions" on transactions for all using (true) with check (true);
create policy "public read receipts" on storage.objects for select using (bucket_id = 'receipts');
create policy "anon upload receipts" on storage.objects for insert with check (bucket_id = 'receipts');
create policy "anon delete receipts" on storage.objects for delete using (bucket_id = 'receipts');

-- 5) Sincronização em tempo real entre os dois celulares
alter publication supabase_realtime add table app_state, transactions;
