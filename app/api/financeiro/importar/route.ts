import { NextResponse } from "next/server";
import { usuarioComArea } from "@/lib/casca/autorizacao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { limparExtrato } from "@/lib/financeiro/limpar";

// Importa o extrato: limpa em código e grava os lançamentos (SPEC 5.2 e 5.3).
export async function POST(request: Request) {
  const acesso = await usuarioComArea("financeiro");
  if (!acesso) return NextResponse.json({ erro: "sem acesso a Financeiro" }, { status: 403 });

  const corpo = await request.json().catch(() => null);
  const nomeArquivo = typeof corpo?.nome_arquivo === "string" ? corpo.nome_arquivo.trim() : "";
  const texto = typeof corpo?.extrato === "string" ? corpo.extrato : "";
  if (!nomeArquivo || !texto.trim()) {
    return NextResponse.json({ erro: "arquivo do extrato obrigatório" }, { status: 400 });
  }

  let limpo;
  try {
    limpo = limparExtrato(texto);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "arquivo inválido";
    return NextResponse.json({ erro: mensagem }, { status: 422 });
  }
  if (limpo.lancamentos.length === 0) {
    return NextResponse.json({ erro: "nenhum lançamento encontrado no arquivo" }, { status: 422 });
  }

  const creditos = limpo.lancamentos.filter((l) => l.tipo === "credito").length;
  const admin = criarClienteAdmin();

  const { data: extrato, error: erroExtrato } = await admin
    .from("extratos_importados")
    .insert({
      nome_arquivo: nomeArquivo,
      importado_por: acesso.id,
      total_linhas: limpo.lancamentos.length,
      total_creditos: creditos,
    })
    .select("id")
    .single();
  if (erroExtrato || !extrato) {
    return NextResponse.json({ erro: erroExtrato?.message ?? "falha ao gravar o extrato" }, { status: 500 });
  }

  const { error: erroLinhas } = await admin.from("lancamentos").insert(
    limpo.lancamentos.map((l) => ({
      extrato_id: extrato.id,
      data: l.data,
      descricao: l.descricao,
      valor: l.valor,
      tipo: l.tipo,
    })),
  );
  if (erroLinhas) {
    await admin.from("extratos_importados").delete().eq("id", extrato.id);
    return NextResponse.json({ erro: erroLinhas.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      extrato_id: extrato.id,
      formato: limpo.formato,
      total_linhas: limpo.lancamentos.length,
      total_creditos: creditos,
      ignoradas: limpo.ignoradas,
    },
    { status: 201 },
  );
}
