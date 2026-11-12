import { criarClienteAdmin } from "@/lib/supabase/admin";

// Decisão sobre uma divergência na fila de aprovação (SPEC 5.5).

export type PropostaDivergencia = {
  divergencia_id: string;
  lancamento_id: string | null;
  hipotese: string;
  cod_titulos_envolvidos: string[];
  valor_a_baixar: number;
  valor_pendente: number;
};

// Status que o título recebe no ERP, conforme a hipótese aprovada.
// null = a hipótese não mexe no título (ex.: o crédito não é recebimento de cliente).
export function statusDoTitulo(hipotese: string, valorPendente: number): string | null {
  if (hipotese === "nao_e_titulo") return null;
  if (hipotese === "vencido_sem_pagamento") return "vencido";
  return valorPendente > 0.005 ? "pago_parcial" : "pago";
}

export async function aplicarDecisaoDivergencia(
  divergenciaId: string,
  acao: "aprovar" | "editar" | "rejeitar",
  proposta: PropostaDivergencia,
): Promise<void> {
  const supabase = criarClienteAdmin();

  // Rejeitar: a divergência volta para "nova". O motivo fica em aprovacoes.observacao.
  if (acao === "rejeitar") {
    const { error } = await supabase.from("divergencias").update({ status: "nova" }).eq("id", divergenciaId);
    if (error) throw new Error(error.message);
    return;
  }

  const cods = proposta.cod_titulos_envolvidos ?? [];
  const novoStatus = statusDoTitulo(proposta.hipotese, Number(proposta.valor_pendente ?? 0));

  if (novoStatus && cods.length > 0) {
    const { error } = await supabase.from("titulos_receber").update({ status: novoStatus }).in("cod_titulo", cods);
    if (error) throw new Error(`não foi possível atualizar os títulos: ${error.message}`);
  }

  if (proposta.lancamento_id) {
    const situacao = proposta.hipotese === "nao_e_titulo" ? "ignorado" : "casado";
    const { error } = await supabase
      .from("lancamentos")
      .update({ situacao, cod_titulo_casado: situacao === "casado" ? cods[0] ?? null : null })
      .eq("id", proposta.lancamento_id);
    if (error) throw new Error(error.message);
  }

  const { error } = await supabase.from("divergencias").update({ status: "resolvida" }).eq("id", divergenciaId);
  if (error) throw new Error(error.message);
}
