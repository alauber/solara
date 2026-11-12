import { NextResponse } from "next/server";
import { usuarioComArea } from "@/lib/casca/autorizacao";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Novo pedido de orçamento (SPEC 4.1): cod_pedido sequencial, PED031, PED032...
export async function POST(request: Request) {
  const acesso = await usuarioComArea("vendas");
  if (!acesso) return NextResponse.json({ erro: "sem acesso a Vendas" }, { status: 403 });

  const corpo = await request.json().catch(() => null);
  const codCliente = typeof corpo?.cod_cliente === "string" ? corpo.cod_cliente.trim() : "";
  const canal = typeof corpo?.canal === "string" ? corpo.canal.trim() : "";
  const mensagem = typeof corpo?.mensagem === "string" ? corpo.mensagem.trim() : "";

  if (!codCliente || !canal || !mensagem) {
    return NextResponse.json({ erro: "cliente, canal e mensagem são obrigatórios" }, { status: 400 });
  }

  const admin = criarClienteAdmin();

  const { data: cliente } = await admin
    .from("clientes")
    .select("cod_cliente")
    .eq("cod_cliente", codCliente)
    .maybeSingle();
  if (!cliente) return NextResponse.json({ erro: "cliente não encontrado" }, { status: 404 });

  const { data: ultimo } = await admin
    .from("pedidos_orcamento")
    .select("cod_pedido")
    .order("cod_pedido", { ascending: false })
    .limit(1)
    .maybeSingle();
  const numeroAtual = ultimo ? Number(String(ultimo.cod_pedido).replace(/\D/g, "")) : 0;
  const codPedido = `PED${String(numeroAtual + 1).padStart(3, "0")}`;

  const { error } = await admin.from("pedidos_orcamento").insert({
    cod_pedido: codPedido,
    data: new Date().toISOString().slice(0, 10),
    cod_cliente: codCliente,
    canal,
    mensagem,
    status: "novo",
  });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, cod_pedido: codPedido }, { status: 201 });
}
