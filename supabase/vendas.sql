-- Solara OS: Vendas (SPEC 4). Rodar no SQL Editor do Supabase depois do motor.sql.
-- Não altera colunas das tabelas do ERP. Só dá leitura para quem tem a área vendas
-- e liga o Realtime em pedidos_orcamento.

drop policy if exists "vendas le pedidos" on public.pedidos_orcamento;
create policy "vendas le pedidos" on public.pedidos_orcamento
  for select to authenticated using (public.usuario_tem_area('vendas'));

drop policy if exists "vendas le clientes" on public.clientes;
create policy "vendas le clientes" on public.clientes
  for select to authenticated using (public.usuario_tem_area('vendas'));

-- Se aparecer "already member of publication", pode ignorar.
alter publication supabase_realtime add table public.pedidos_orcamento;
