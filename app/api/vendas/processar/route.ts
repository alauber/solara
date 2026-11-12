import { NextResponse } from "next/server";
import { usuarioComArea } from "@/lib/casca/autorizacao";
import { ErroNegocio, processarPedidoVendas } from "@/lib/orquestradores/vendas";

// Agentes podem levar mais de 10 segundos: o limite precisa ser explícito (CLAUDE.md).
export const maxDuration = 60;

export async function POST(request: Request) {
  const acesso = await usuarioComArea("vendas");
  if (!acesso) return NextResponse.json({ erro: "sem acesso a Vendas" }, { status: 403 });

  const corpo = await request.json().catch(() => null);
  const codPedido = typeof corpo?.cod_pedido === "string" ? corpo.cod_pedido.trim() : "";
  if (!codPedido) return NextResponse.json({ erro: "cod_pedido obrigatório" }, { status: 400 });

  try {
    await processarPedidoVendas(codPedido);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    if (erro instanceof ErroNegocio) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    const mensagem = erro instanceof Error ? erro.message : "erro inesperado";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
