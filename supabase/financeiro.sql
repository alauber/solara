-- Solara OS: Financeiro (SPEC 5.1). Rodar no SQL Editor depois de motor.sql e vendas.sql.
-- Não altera colunas das tabelas do ERP (titulos_receber e clientes são só lidas aqui).

create table if not exists public.extratos_importados (
  id uuid primary key default gen_random_uuid(),
  nome_arquivo text not null,
  importado_em timestamptz not null default now(),
  importado_por uuid references public.perfis(id),
  total_linhas int not null default 0,
  total_creditos int not null default 0
);

create table if not exists public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  extrato_id uuid not null references public.extratos_importados(id) on delete cascade,
  data date not null,
  descricao text,
  valor numeric(14, 2) not null,
  tipo text not null check (tipo in ('credito', 'debito')),
  cod_titulo_casado text,
  situacao text not null default 'divergente' check (situacao in ('casado', 'divergente', 'ignorado'))
);
create index if not exists lancamentos_extrato_idx on public.lancamentos (extrato_id);

create table if not exists public.divergencias (
  id uuid primary key default gen_random_uuid(),
  extrato_id uuid not null references public.extratos_importados(id) on delete cascade,
  tipo_inicial text not null check (tipo_inicial in (
    'valor_diferente_mesma_nf', 'sem_titulo_correspondente', 'possivel_soma', 'duplicado', 'vencido_sem_pagamento'
  )),
  lancamento_id uuid references public.lancamentos(id) on delete cascade,
  cod_titulo text,
  valor_lancamento numeric(14, 2),
  valor_titulo numeric(14, 2),
  status text not null default 'nova' check (status in ('nova', 'investigando', 'aguardando_aprovacao', 'resolvida')),
  hipotese jsonb
);
create index if not exists divergencias_extrato_idx on public.divergencias (extrato_id);

-- Leitura para quem tem a área financeiro. Escrita só pelo servidor (service role).
alter table public.extratos_importados enable row level security;
alter table public.lancamentos enable row level security;
alter table public.divergencias enable row level security;

create policy "financeiro le extratos" on public.extratos_importados
  for select to authenticated using (public.usuario_tem_area('financeiro'));

create policy "financeiro le lancamentos" on public.lancamentos
  for select to authenticated using (public.usuario_tem_area('financeiro'));

create policy "financeiro le divergencias" on public.divergencias
  for select to authenticated using (public.usuario_tem_area('financeiro'));

-- Realtime para a tela de conciliação. Se aparecer "already member of publication", pode ignorar.
alter publication supabase_realtime add table public.divergencias;
alter publication supabase_realtime add table public.lancamentos;
