-- Solara OS: tabelas do Motor (SPEC 3.1 e 3.4) e funções da Casca (SPEC 2).
-- Rodar inteiro no SQL Editor do Supabase. Não altera a tabela perfis nem as tabelas do ERP.

-- 3.1 execucoes_agentes
create table if not exists public.execucoes_agentes (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  item_tipo text not null,
  item_id text not null,
  agente text not null,
  chamado_por uuid references public.execucoes_agentes(id) on delete set null,
  status text not null default 'rodando' check (status in ('rodando', 'ok', 'erro')),
  entrada jsonb,
  saida jsonb,
  erro text,
  tokens_entrada int,
  tokens_saida int,
  inicio timestamptz not null default now(),
  fim timestamptz
);
create index if not exists execucoes_agentes_item_idx on public.execucoes_agentes (item_id, inicio);

-- 3.4 aprovacoes
create table if not exists public.aprovacoes (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  item_tipo text not null,
  item_id text not null,
  titulo text not null,
  proposta jsonb,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'editada', 'rejeitada')),
  decidido_por uuid references public.perfis(id),
  decidido_em timestamptz,
  observacao text
);
create index if not exists aprovacoes_area_status_idx on public.aprovacoes (area, status);

-- Funções da Casca. Rodam com permissão do dono e checam o usuário logado (auth.uid()).
create or replace function public.meu_perfil()
returns setof public.perfis
language sql stable security definer set search_path = public as $$
  select * from public.perfis where id = auth.uid();
$$;

create or replace function public.listar_perfis()
returns setof public.perfis
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.perfis where id = auth.uid() and papel = 'admin') then
    raise exception 'apenas administradores';
  end if;
  return query select * from public.perfis order by criado_em;
end;
$$;

create or replace function public.usuario_tem_area(a text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis p where p.id = auth.uid() and a = any (p.areas));
$$;

-- Segurança: cada usuário lê só as execuções e aprovações das áreas dele.
-- Escrita não tem policy para usuários: só o servidor (service role) grava.
alter table public.execucoes_agentes enable row level security;
alter table public.aprovacoes enable row level security;

create policy "leitura por area" on public.execucoes_agentes
  for select to authenticated using (public.usuario_tem_area(area));

create policy "leitura por area" on public.aprovacoes
  for select to authenticated using (public.usuario_tem_area(area));

-- Realtime (SPEC 3.1). Se aparecer "already member of publication", pode ignorar.
alter publication supabase_realtime add table public.execucoes_agentes;
alter publication supabase_realtime add table public.aprovacoes;
