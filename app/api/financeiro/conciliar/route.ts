import { NextResponse } from "next/server";
import { usuarioComArea } from "@/lib/casca/autorizacao";
import { ErroNegocio } from "@/lib/orquestradores/vendas";
import { conciliarExtrato } from "@/lib/orquestradores/financeiro";

// Agentes podem levar mais de 10 segundos: o limite precisa ser explícito (CLAUDE.md).
export const maxDuration = 60;

export async function POST(request: Request) {
  const acesso = await usuarioComArea("financeiro");
  if (!acesso) return NextResponse.json({ erro: "sem acesso a Financeiro" }, { status: 403 });

  const corpo = await request.json().catch(() => null);
  const extratoId = typeof corpo?.extrato_id === "string" ? corpo.extrato_id : "";
  const titulos = typeof corpo?.titulos === "string" && corpo.titulos.trim() ? corpo.titulos : null;
  if (!extratoId) return NextResponse.json({ erro: "extrato_id obrigatório" }, { status: 400 });

  try {
    await conciliarExtrato(extratoId, titulos);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    if (erro instanceof ErroNegocio) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    const mensagem = erro instanceof Error ? erro.message : "erro inesperado";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
