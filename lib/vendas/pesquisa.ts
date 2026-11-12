import type { SupabaseClient } from "@supabase/supabase-js";

// Consultas de catálogo e histórico do Pesquisador (SPEC 4.2, passo 3).
// É código, não modelo: o modelo só recebe o resultado já filtrado.

export type ProdutoCandidato = {
  cod_produto: string;
  descricao: string;
  unidade: string;
  preco_unitario: number;
  preco_acima_100_un: number;
  estoque: number;
  prazo_reposicao_dias: number;
};

export type PedidoRecente = {
  cod_pedido: string;
  data: string;
  canal: string;
  mensagem: string;
  status: string;
};

const PALAVRAS_IGNORADAS = new Set(["para", "com", "uns", "umas", "dos", "das", "uma", "por", "que", "mais", "tem", "pra"]);

// Palavras principais da descrição do cliente. Remove pontuação, que quebraria o filtro do PostgREST.
export function palavrasChave(descricao: string): string[] {
  const limpa = descricao.toLowerCase().replace(/[^\p{L}\p{N}/ ]+/gu, " ");
  const palavras = limpa
    .split(/\s+/)
    .filter((p) => p.length >= 3 && !PALAVRAS_IGNORADAS.has(p));
  return [...new Set(palavras)].slice(0, 5);
}

export async function buscarCandidatos(
  supabase: SupabaseClient,
  descricao: string,
): Promise<ProdutoCandidato[]> {
  const palavras = palavrasChave(descricao);
  if (palavras.length === 0) return [];

  const filtro = palavras.map((p) => `descricao.ilike.*${p}*`).join(",");
  const { data, error } = await supabase
    .from("produtos")
    .select("cod_produto, descricao, unidade, preco_unitario, preco_acima_100_un, estoque, prazo_reposicao_dias")
    .or(filtro)
    .limit(15);

  if (error) throw new Error(`consulta de produtos falhou: ${error.message}`);
  return (data ?? []) as ProdutoCandidato[];
}

export async function pedidosRecentes(
  supabase: SupabaseClient,
  codCliente: string,
  codAtual: string,
): Promise<PedidoRecente[]> {
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("pedidos_orcamento")
    .select("cod_pedido, data, canal, mensagem, status")
    .eq("cod_cliente", codCliente)
    .gte("data", desde)
    .neq("cod_pedido", codAtual)
    .order("data", { ascending: false });

  if (error) throw new Error(`consulta de pedidos anteriores falhou: ${error.message}`);
  return ((data ?? []) as PedidoRecente[]).map((p) => ({
    ...p,
    mensagem: (p.mensagem ?? "").slice(0, 200),
  }));
}
