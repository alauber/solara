import type { SupabaseClient } from "@supabase/supabase-js";
import { agente, type ContextoAgente } from "@/lib/agente";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { ErroNegocio } from "@/lib/orquestradores/vendas";
import { casar, titulosCandidatos, type DivergenciaCalculada, type LancamentoCasavel, type ResultadoCasamento } from "@/lib/financeiro/casar";
import { formatarValor, limparTitulos, type TituloAberto } from "@/lib/financeiro/limpar";

// Orquestrador da conciliação (SPEC 5.4). A ordem é código; o modelo só interpreta.

type Hipotese = {
  hipotese: string;
  explicacao: string;
  confianca: number;
  acao_sugerida: string;
  cod_titulos_envolvidos: string[];
  valor_a_baixar: number;
  valor_pendente: number;
};

type HipoteseComDivergencia = Hipotese & {
  divergencia_id: string;
  lancamento_id: string | null;
  lancamento_valor: number | null;
  lancamento_descricao: string | null;
  nome_cliente: string | null;
};

type Relatorio = { relatorio_markdown: string; acoes: string[] };
type Revisao = { aprovado: boolean; motivos: string[] };

type ClienteNome = { cod_cliente: string; nome: string };

export async function conciliarExtrato(extratoId: string, titulosTexto: string | null): Promise<void> {
  const supabase = criarClienteAdmin();

  const { data: extrato } = await supabase
    .from("extratos_importados")
    .select("id")
    .eq("id", extratoId)
    .maybeSingle();
  if (!extrato) throw new ErroNegocio("extrato não encontrado", 404);

  const { count } = await supabase
    .from("divergencias")
    .select("id", { count: "exact", head: true })
    .eq("extrato_id", extratoId);
  if ((count ?? 0) > 0) throw new ErroNegocio("este extrato já foi conciliado", 409);

  const { data: linhas, error: erroLinhas } = await supabase
    .from("lancamentos")
    .select("id, data, descricao, valor, tipo")
    .eq("extrato_id", extratoId);
  if (erroLinhas) throw new Error(`não foi possível ler os lançamentos: ${erroLinhas.message}`);

  const lancamentos: LancamentoCasavel[] = (linhas ?? []).map((l) => ({
    id: l.id,
    data: l.data,
    descricao: l.descricao ?? "",
    valor: Number(l.valor),
    tipo: l.tipo,
  }));
  if (lancamentos.length === 0) throw new ErroNegocio("o extrato não tem lançamentos", 422);

  let titulos: TituloAberto[];
  try {
    titulos = titulosTexto ? limparTitulos(titulosTexto) : await titulosDoErp(supabase);
  } catch (erro) {
    throw new ErroNegocio(erro instanceof Error ? erro.message : "títulos inválidos", 422);
  }

  const { data: clientes } = await supabase.from("clientes").select("cod_cliente, nome");
  const listaClientes = (clientes ?? []) as ClienteNome[];
  const nomeDoCliente = new Map(listaClientes.map((c) => [c.cod_cliente, c.nome]));

  const datas = lancamentos.map((l) => l.data).sort();
  const dataIni = datas[0];
  const dataFim = datas[datas.length - 1];

  const raizId = await abrirRaiz(extratoId);
  const ctx: ContextoAgente = { area: "financeiro", item_tipo: "extrato", item_id: extratoId, chamado_por: raizId };

  try {
    // Casamento em código (5.3).
    const resultado = casar(lancamentos, titulos, dataFim);
    await gravarCasamento(supabase, extratoId, resultado);

    const { data: divs, error: erroDivs } = await supabase
      .from("divergencias")
      .select("*")
      .eq("extrato_id", extratoId);
    if (erroDivs) throw new Error(`não foi possível ler as divergências: ${erroDivs.message}`);
    const divergencias = divs ?? [];

    const lancPorId = new Map(lancamentos.map((l) => [l.id, l]));
    const titPorCod = new Map(titulos.map((t) => [t.cod_titulo, t]));

    // Investigadores: um por divergência, em paralelo (5.4, passo 2).
    const hipoteses: HipoteseComDivergencia[] = await Promise.all(
      divergencias.map(async (d) => {
        const lanc = d.lancamento_id ? lancPorId.get(d.lancamento_id) ?? null : null;
        const candidatos = titulosCandidatos(lanc, titulos, listaClientes, d.cod_titulo);

        const saida = (
          await agente<Hipotese>(
            "investigador",
            {
              divergencia: {
                tipo_inicial: d.tipo_inicial,
                valor_lancamento: d.valor_lancamento,
                valor_titulo: d.valor_titulo,
              },
              lancamento: lanc ? { data: lanc.data, descricao: lanc.descricao, valor: lanc.valor } : null,
              titulos_candidatos: candidatos.map((t) => ({
                cod_titulo: t.cod_titulo,
                cod_cliente: t.cod_cliente,
                nome_cliente: nomeDoCliente.get(t.cod_cliente) ?? null,
                nota_fiscal: t.nota_fiscal,
                valor: t.valor,
                vencimento: t.vencimento,
                status: t.status,
              })),
            },
            ctx,
          )
        ).saida;

        await checar(supabase.from("divergencias").update({ hipotese: saida, status: "investigando" }).eq("id", d.id));

        const primeiroTitulo = saida.cod_titulos_envolvidos?.[0];
        const titulo = primeiroTitulo ? titPorCod.get(primeiroTitulo) : undefined;

        return {
          ...saida,
          divergencia_id: d.id,
          lancamento_id: d.lancamento_id,
          lancamento_valor: lanc?.valor ?? d.valor_titulo ?? null,
          lancamento_descricao: lanc?.descricao ?? null,
          nome_cliente: titulo ? nomeDoCliente.get(titulo.cod_cliente) ?? null : null,
        };
      }),
    );

    const resumo = {
      qtd_casados: resultado.casados.length,
      valor_casado: arredondar(
        resultado.casados.reduce((soma, c) => soma + (lancPorId.get(c.lancamento_id)?.valor ?? 0), 0),
      ),
      qtd_divergencias: divergencias.length,
      valor_divergente: arredondar(
        divergencias.reduce((soma, d) => soma + Number(d.valor_lancamento ?? d.valor_titulo ?? 0), 0),
      ),
      periodo: `${dataIni} a ${dataFim}`,
    };

    // Consolidador (5.4, passo 3).
    let relatorio = (
      await agente<Relatorio>("consolidador", { resumo_casamento: resumo, hipoteses: paraConsolidador(hipoteses) }, ctx)
    ).saida;

    // Revisor (5.4, passo 4). A aritmética também é conferida em código.
    const motivosCodigo = checarHipotesesCodigo(hipoteses, titPorCod);
    const revisao = (
      await agente<Revisao>(
        "revisor",
        {
          hipoteses: hipoteses.map((h) => ({
            hipotese: h.hipotese,
            cod_titulos_envolvidos: h.cod_titulos_envolvidos,
            valor_a_baixar: h.valor_a_baixar,
            valor_pendente: h.valor_pendente,
            confianca: h.confianca,
          })),
          titulos_abertos: titulos.map((t) => ({
            cod_titulo: t.cod_titulo,
            valor: t.valor,
            cod_cliente: t.cod_cliente,
            vencimento: t.vencimento,
          })),
          relatorio,
        },
        ctx,
      )
    ).saida;

    const motivos = [...revisao.motivos, ...motivosCodigo];
    const aprovado = revisao.aprovado && motivosCodigo.length === 0;

    // Se reprovar, refaz só o Consolidador uma vez, com os motivos (5.4, passo 4).
    if (!aprovado) {
      relatorio = (
        await agente<Relatorio>(
          "consolidador",
          { resumo_casamento: resumo, hipoteses: paraConsolidador(hipoteses), ajustes: motivos },
          ctx,
        )
      ).saida;
    }

    // Cada hipótese vira um item da fila (5.4, passo 5).
    for (const h of hipoteses) {
      const referencia = h.nome_cliente ?? h.lancamento_descricao ?? "sem identificação";
      const valorRef = h.lancamento_valor ?? h.valor_a_baixar;
      const { error } = await supabase.from("aprovacoes").insert({
        area: "financeiro",
        item_tipo: "divergencia",
        item_id: h.divergencia_id,
        titulo: `${h.hipotese} · ${referencia} · R$ ${formatarValor(valorRef)}`,
        proposta: {
          divergencia_id: h.divergencia_id,
          lancamento_id: h.lancamento_id,
          hipotese: h.hipotese,
          explicacao: h.explicacao,
          confianca: h.confianca,
          acao_sugerida: h.acao_sugerida,
          cod_titulos_envolvidos: h.cod_titulos_envolvidos,
          valor_a_baixar: h.valor_a_baixar,
          valor_pendente: h.valor_pendente,
          revisao: { aprovado, motivos },
        },
        status: "pendente",
      });
      if (error) throw new Error(`não foi possível criar a aprovação: ${error.message}`);

      await checar(supabase.from("divergencias").update({ status: "aguardando_aprovacao" }).eq("id", h.divergencia_id));
    }

    await fecharRaiz(raizId, "ok");
  } catch (erro) {
    await desfazer(supabase, extratoId);
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await fecharRaiz(raizId, "erro", mensagem);
    throw erro;
  }
}

async function titulosDoErp(supabase: SupabaseClient): Promise<TituloAberto[]> {
  const { data, error } = await supabase
    .from("titulos_receber")
    .select("cod_titulo, cod_cliente, nota_fiscal, valor, emissao, vencimento, status")
    .eq("status", "aberto");
  if (error) throw new Error(`não foi possível ler os títulos: ${error.message}`);
  return (data ?? []).map((t) => ({ ...t, valor: Number(t.valor) })) as TituloAberto[];
}

async function gravarCasamento(supabase: SupabaseClient, extratoId: string, resultado: ResultadoCasamento) {
  const operacoes = [
    ...resultado.casados.map((c) =>
      supabase
        .from("lancamentos")
        .update({ situacao: "casado", cod_titulo_casado: c.cod_titulo })
        .eq("id", c.lancamento_id),
    ),
    ...resultado.ignorados.map((id) =>
      supabase.from("lancamentos").update({ situacao: "ignorado" }).eq("id", id),
    ),
  ];
  for (const op of operacoes) await checar(op);

  if (resultado.divergencias.length > 0) {
    const linhas = resultado.divergencias.map((d: DivergenciaCalculada) => ({
      extrato_id: extratoId,
      ...d,
      status: "investigando",
    }));
    await checar(supabase.from("divergencias").insert(linhas));
  }
}

async function desfazer(supabase: SupabaseClient, extratoId: string) {
  const { data: divs } = await supabase.from("divergencias").select("id").eq("extrato_id", extratoId);
  const ids = (divs ?? []).map((d) => d.id as string);
  if (ids.length > 0) {
    await supabase.from("aprovacoes").delete().eq("item_tipo", "divergencia").in("item_id", ids);
  }
  await supabase.from("divergencias").delete().eq("extrato_id", extratoId);
  await supabase
    .from("lancamentos")
    .update({ situacao: "divergente", cod_titulo_casado: null })
    .eq("extrato_id", extratoId)
    .eq("tipo", "credito");
  await supabase
    .from("lancamentos")
    .update({ situacao: "ignorado", cod_titulo_casado: null })
    .eq("extrato_id", extratoId)
    .eq("tipo", "debito");
}

// Confere a aritmética da hipótese: a soma dos títulos envolvidos deve bater com baixa + pendente.
function checarHipotesesCodigo(hipoteses: Hipotese[], titPorCod: Map<string, TituloAberto>): string[] {
  const motivos: string[] = [];
  for (const h of hipoteses) {
    const cods = h.cod_titulos_envolvidos ?? [];
    if (cods.length === 0) continue;

    const inexistentes = cods.filter((c) => !titPorCod.has(c));
    if (inexistentes.length > 0) {
      motivos.push(`Hipótese "${h.hipotese}" cita título inexistente: ${inexistentes.join(", ")}.`);
      continue;
    }

    const soma = cods.reduce((acc, c) => acc + (titPorCod.get(c)?.valor ?? 0), 0);
    const esperado = (h.valor_a_baixar ?? 0) + (h.valor_pendente ?? 0);
    if (Math.abs(soma - esperado) > 0.01) {
      motivos.push(
        `Hipótese "${h.hipotese}" (${cods.join(", ")}): baixa + pendente é R$ ${formatarValor(esperado)}, mas os títulos somam R$ ${formatarValor(soma)}.`,
      );
    }
  }
  return motivos;
}

function paraConsolidador(hipoteses: HipoteseComDivergencia[]) {
  return hipoteses.map((h) => ({
    divergencia_id: h.divergencia_id,
    hipotese: h.hipotese,
    explicacao: h.explicacao,
    confianca: h.confianca,
    acao_sugerida: h.acao_sugerida,
    cod_titulos_envolvidos: h.cod_titulos_envolvidos,
    valor_a_baixar: h.valor_a_baixar,
    valor_pendente: h.valor_pendente,
  }));
}

// Erro do Supabase não lança exceção sozinho; esta função transforma em exceção.
async function checar(operacao: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await operacao;
  if (error) throw new Error(error.message);
}

async function abrirRaiz(extratoId: string): Promise<string> {
  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("execucoes_agentes")
    .insert({
      area: "financeiro",
      item_tipo: "extrato",
      item_id: extratoId,
      agente: "orquestrador",
      status: "rodando",
      entrada: { extrato_id: extratoId },
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
    .update({ status, erro: erro ? erro.slice(0, 2000) : null, fim: new Date().toISOString() })
    .eq("id", id);
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
