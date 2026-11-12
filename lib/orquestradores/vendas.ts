import { agente, type ContextoAgente } from "@/lib/agente";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { buscarCandidatos, pedidosRecentes } from "@/lib/vendas/pesquisa";
import type { StatusPedido } from "@/lib/vendas/tipos";

// Orquestrador de Vendas (SPEC 4.2). A ordem dos passos é código, não decisão do modelo.

const TIPOS_ORCAMENTO = ["orcamento", "complemento"];
const MAX_VOLTAS_REVISOR = 2;

export class ErroNegocio extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

type Triagem = {
  tipo: string;
  itens: { descricao_cliente: string; quantidade: number | null; unidade: string | null }[];
  [chave: string]: unknown;
};

type Contexto = {
  itens: unknown[];
  condicao_pagamento_dias: number | null;
  desconto_maximo_pct: number | null;
  observacoes?: string;
};

type Redacao = { resposta: string; resumo: string };
type Revisao = { aprovado: boolean; motivos: string[] };

type ClienteRow = {
  cod_cliente: string;
  nome: string;
  segmento: string | null;
  prazo_pagamento_dias: number | null;
  desconto_maximo_pct: number | null;
  cliente_desde: string | null;
};

export async function processarPedidoVendas(codPedido: string): Promise<void> {
  const supabase = criarClienteAdmin();

  const { data: pedido } = await supabase
    .from("pedidos_orcamento")
    .select("*")
    .eq("cod_pedido", codPedido)
    .single();
  if (!pedido) throw new ErroNegocio("pedido não encontrado", 404);

  // Marca como processando só se ainda estiver "novo": evita processar duas vezes.
  const { data: marcado } = await supabase
    .from("pedidos_orcamento")
    .update({ status: "processando" satisfies StatusPedido })
    .eq("cod_pedido", codPedido)
    .eq("status", "novo")
    .select("cod_pedido");
  if (!marcado || marcado.length === 0) {
    throw new ErroNegocio("este pedido não está como novo", 409);
  }

  const { data: cliente } = await supabase
    .from("clientes")
    .select("*")
    .eq("cod_cliente", pedido.cod_cliente)
    .single();
  if (!cliente) {
    await definirStatus(codPedido, "novo");
    throw new ErroNegocio("cliente do pedido não encontrado", 422);
  }

  const raizId = await abrirRaiz(codPedido);
  const ctx: ContextoAgente = {
    area: "vendas",
    item_tipo: "pedido",
    item_id: codPedido,
    chamado_por: raizId,
  };

  try {
    const cli = cliente as ClienteRow;

    // 1. Triador
    const triagem = (
      await agente<Triagem>(
        "triador",
        {
          mensagem: pedido.mensagem,
          canal: pedido.canal,
          cliente: { cod_cliente: cli.cod_cliente, nome: cli.nome, segmento: cli.segmento },
        },
        ctx,
      )
    ).saida;

    // Não é orçamento: vai para a fila como caso fora do fluxo normal.
    if (!TIPOS_ORCAMENTO.includes(triagem.tipo)) {
      await supabase.from("aprovacoes").insert({
        area: "vendas",
        item_tipo: "pedido",
        item_id: codPedido,
        titulo: `Não é orçamento: ${triagem.tipo}`,
        proposta: triagem,
        status: "pendente",
      });
      await definirStatus(codPedido, "aguardando_aprovacao");
      await fecharRaiz(raizId, "ok");
      return;
    }

    // 2. Pesquisador: consultas no banco feitas em código, depois o agente casa os itens.
    const candidatosCatalogo = await Promise.all(
      triagem.itens.map(async (item) => ({
        descricao_cliente: item.descricao_cliente,
        candidatos: await buscarCandidatos(supabase, item.descricao_cliente),
      })),
    );
    const anteriores = await pedidosRecentes(supabase, cli.cod_cliente, codPedido);

    const contexto = (
      await agente<Contexto>(
        "pesquisador",
        {
          itens_pedidos: triagem.itens,
          candidatos_catalogo: candidatosCatalogo,
          cliente: cli,
          pedidos_anteriores: anteriores,
        },
        ctx,
      )
    ).saida;

    // 3. Redator e Revisor, com no máximo duas voltas de correção.
    const clienteRedator = { nome: cli.nome, segmento: cli.segmento };
    let redacao = (
      await agente<Redacao>("redator", { triagem, contexto, cliente: clienteRedator }, ctx)
    ).saida;
    let revisao = (
      await agente<Revisao>(
        "revisor",
        { resposta: redacao.resposta, contexto, regras: "as regras do seu system prompt" },
        ctx,
      )
    ).saida;

    let voltas = 0;
    while (!revisao.aprovado && voltas < MAX_VOLTAS_REVISOR) {
      voltas++;
      redacao = (
        await agente<Redacao>(
          "redator",
          { triagem, contexto, cliente: clienteRedator, ajustes: revisao.motivos },
          ctx,
        )
      ).saida;
      revisao = (
        await agente<Revisao>(
          "revisor",
          { resposta: redacao.resposta, contexto, regras: "as regras do seu system prompt" },
          ctx,
        )
      ).saida;
    }

    // 4. Vai para a fila de aprovação, com os motivos se o revisor ainda reprovou.
    const { error: erroFila } = await supabase.from("aprovacoes").insert({
      area: "vendas",
      item_tipo: "pedido",
      item_id: codPedido,
      titulo: `${cli.nome} · ${redacao.resumo}`,
      proposta: {
        resposta: redacao.resposta,
        triagem,
        contexto,
        revisao: { aprovado: revisao.aprovado, motivos: revisao.motivos, voltas },
      },
      status: "pendente",
    });
    if (erroFila) throw new Error(`não foi possível criar a aprovação: ${erroFila.message}`);

    await definirStatus(codPedido, "aguardando_aprovacao");
    await fecharRaiz(raizId, "ok");
  } catch (erro) {
    // Volta o pedido para "novo" para poder reprocessar, e registra o erro na raiz.
    await definirStatus(codPedido, "novo");
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await fecharRaiz(raizId, "erro", mensagem);
    throw erro;
  }
}

async function definirStatus(codPedido: string, status: StatusPedido): Promise<void> {
  const supabase = criarClienteAdmin();
  await supabase.from("pedidos_orcamento").update({ status }).eq("cod_pedido", codPedido);
}

async function abrirRaiz(codPedido: string): Promise<string> {
  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("execucoes_agentes")
    .insert({
      area: "vendas",
      item_tipo: "pedido",
      item_id: codPedido,
      agente: "orquestrador",
      status: "rodando",
      entrada: { cod_pedido: codPedido },
      inicio: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`não foi possível abrir a execução raiz: ${error?.message}`);
  return data.id as string;
}

async function fecharRaiz(id: string, status: "ok" | "erro", erro?: string): Promise<void> {
  const supabase = criarClienteAdmin();
  await supabase
    .from("execucoes_agentes")
    .update({
      status,
      erro: erro ? erro.slice(0, 2000) : null,
      fim: new Date().toISOString(),
    })
    .eq("id", id);
}
