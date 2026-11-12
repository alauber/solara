import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { Perfil } from "@/lib/casca/areas";
import { aplicarDecisaoDivergencia, type PropostaDivergencia } from "@/lib/financeiro/decisao";

// Decisão na fila de aprovação (SPEC 3.4 e 4.3 / 5.5).
// Aprovar, editar (aprovar com valores alterados) ou rejeitar (exige observação).
// Grava a decisão e, em Vendas, atualiza o status do pedido. Financeiro entra na sua seção.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const corpo = await request.json().catch(() => null);
  const id = typeof corpo?.id === "string" ? corpo.id : "";
  const acao = corpo?.acao as "aprovar" | "editar" | "rejeitar";
  if (!id || !["aprovar", "editar", "rejeitar"].includes(acao)) {
    return NextResponse.json({ erro: "pedido inválido" }, { status: 400 });
  }

  const { data: perfis } = await supabase.rpc("meu_perfil");
  const perfil = (perfis?.[0] ?? null) as Perfil | null;

  const admin = criarClienteAdmin();
  const { data: aprovacao } = await admin.from("aprovacoes").select("*").eq("id", id).single();
  if (!aprovacao) return NextResponse.json({ erro: "aprovação não encontrada" }, { status: 404 });

  if (!perfil?.areas.includes(aprovacao.area)) {
    return NextResponse.json({ erro: "sem acesso a esta área" }, { status: 403 });
  }
  if (aprovacao.status !== "pendente") {
    return NextResponse.json({ erro: "esta aprovação já foi decidida" }, { status: 409 });
  }

  const atualizacao: Record<string, unknown> = {
    decidido_por: user.id,
    decidido_em: new Date().toISOString(),
  };

  if (acao === "aprovar") {
    atualizacao.status = "aprovada";
  } else if (acao === "editar") {
    if (corpo?.proposta === undefined) {
      return NextResponse.json({ erro: "proposta editada ausente" }, { status: 400 });
    }
    atualizacao.status = "editada";
    atualizacao.proposta = corpo.proposta;
  } else {
    const observacao = typeof corpo?.observacao === "string" ? corpo.observacao.trim() : "";
    if (!observacao) return NextResponse.json({ erro: "informe o motivo da rejeição" }, { status: 400 });
    atualizacao.status = "rejeitada";
    atualizacao.observacao = observacao;
  }

  const { error } = await admin.from("aprovacoes").update(atualizacao).eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  // SPEC 4.3: em Vendas, aprovar ou editar deixa o pedido "respondido"; rejeitar deixa "rejeitado".
  if (aprovacao.area === "vendas" && aprovacao.item_tipo === "pedido") {
    const novoStatus = acao === "rejeitar" ? "rejeitado" : "respondido";
    const { error: erroPedido } = await admin
      .from("pedidos_orcamento")
      .update({ status: novoStatus })
      .eq("cod_pedido", aprovacao.item_id);
    if (erroPedido) return NextResponse.json({ erro: erroPedido.message }, { status: 500 });
  }

  // SPEC 5.5: aprovar, editar ou rejeitar uma divergência do extrato.
  if (aprovacao.area === "financeiro" && aprovacao.item_tipo === "divergencia") {
    const propostaUsada = acao === "editar" ? corpo.proposta : aprovacao.proposta;
    try {
      await aplicarDecisaoDivergencia(aprovacao.item_id, acao, {
        ...(propostaUsada as PropostaDivergencia),
        divergencia_id: aprovacao.item_id,
      });
    } catch (erroDecisao) {
      const mensagem = erroDecisao instanceof Error ? erroDecisao.message : "falha ao aplicar a decisão";
      return NextResponse.json({ erro: mensagem }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
