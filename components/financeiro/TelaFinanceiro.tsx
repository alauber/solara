"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import Organograma from "@/components/Organograma";
import FilaAprovacao from "@/components/FilaAprovacao";
import ImportarExtrato from "@/components/financeiro/ImportarExtrato";
import { formatarValor } from "@/lib/financeiro/limpar";

const AREA = "financeiro";

type Lancamento = {
  id: string;
  data: string;
  descricao: string | null;
  valor: number;
  tipo: "credito" | "debito";
  situacao: "casado" | "divergente" | "ignorado";
  cod_titulo_casado: string | null;
};

type Divergencia = {
  id: string;
  tipo_inicial: string;
  lancamento_id: string | null;
  cod_titulo: string | null;
  valor_lancamento: number | null;
  valor_titulo: number | null;
  status: "nova" | "investigando" | "aguardando_aprovacao" | "resolvida";
};

const ROTULO_TIPO: Record<string, string> = {
  valor_diferente_mesma_nf: "Valor diferente da NF",
  sem_titulo_correspondente: "Sem título correspondente",
  possivel_soma: "Possível soma de dois títulos",
  duplicado: "Possível duplicidade",
  vencido_sem_pagamento: "Vencido sem pagamento",
};

const COLUNAS_DIVERGENCIA: { status: Divergencia["status"]; rotulo: string }[] = [
  { status: "nova", rotulo: "Nova" },
  { status: "investigando", rotulo: "Investigando" },
  { status: "aguardando_aprovacao", rotulo: "Aguardando aprovação" },
  { status: "resolvida", rotulo: "Resolvida" },
];

// Leituras da conciliação (sem estado: quem chama guarda o resultado).
async function buscarConciliacao(id: string) {
  const supabase = createClient();
  const [lanc, divs] = await Promise.all([
    supabase.from("lancamentos").select("*").eq("extrato_id", id).order("data", { ascending: true }),
    supabase.from("divergencias").select("*").eq("extrato_id", id),
  ]);
  return {
    lancamentos: (lanc.data ?? []).map((l) => ({ ...l, valor: Number(l.valor) })) as Lancamento[],
    divergencias: (divs.data ?? []).map((d) => ({
      ...d,
      valor_lancamento: d.valor_lancamento == null ? null : Number(d.valor_lancamento),
      valor_titulo: d.valor_titulo == null ? null : Number(d.valor_titulo),
    })) as Divergencia[],
  };
}

async function buscarRelatorio(id: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("execucoes_agentes")
    .select("saida")
    .eq("item_id", id)
    .eq("agente", "consolidador")
    .order("inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  const saida = data?.saida as { relatorio_markdown?: string } | null | undefined;
  return saida?.relatorio_markdown ?? null;
}

export default function TelaFinanceiro() {
  const [aba, setAba] = useState<"conciliacao" | "relatorio" | "aprovacoes">("conciliacao");
  const [extratoId, setExtratoId] = useState<string | null>(null);
  const [nomeExtrato, setNomeExtrato] = useState<string | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [divergencias, setDivergencias] = useState<Divergencia[]>([]);
  const [titulosTexto, setTitulosTexto] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState<string | null>(null);
  const [conciliando, setConciliando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Abre o último extrato importado, se houver.
  useEffect(() => {
    const supabase = createClient();
    let ativo = true;
    supabase
      .from("extratos_importados")
      .select("id, nome_arquivo")
      .order("importado_em", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!ativo || !data) return;
        setExtratoId(data.id);
        setNomeExtrato(data.nome_arquivo);
      });
    return () => {
      ativo = false;
    };
  }, []);

  // Carrega a conciliação do extrato e acompanha mudanças por Realtime.
  useEffect(() => {
    if (!extratoId) return;
    const supabase = createClient();
    let ativo = true;

    buscarConciliacao(extratoId).then((r) => {
      if (!ativo) return;
      setLancamentos(r.lancamentos);
      setDivergencias(r.divergencias);
    });

    const atualizar = () =>
      buscarConciliacao(extratoId).then((r) => {
        if (!ativo) return;
        setLancamentos(r.lancamentos);
        setDivergencias(r.divergencias);
      });

    const canal = supabase
      .channel(`financeiro-${extratoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "divergencias", filter: `extrato_id=eq.${extratoId}` },
        () => atualizar(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lancamentos", filter: `extrato_id=eq.${extratoId}` },
        () => atualizar(),
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, [extratoId]);

  // Relatório: o último Consolidador executado para este extrato.
  useEffect(() => {
    if (aba !== "relatorio" || !extratoId) return;
    let ativo = true;
    buscarRelatorio(extratoId).then((texto) => {
      if (ativo) setRelatorio(texto);
    });
    return () => {
      ativo = false;
    };
  }, [aba, extratoId]);

  async function conciliar() {
    if (!extratoId) return;
    setErro(null);
    setConciliando(true);
    const resposta = await fetch("/api/financeiro/conciliar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extrato_id: extratoId, titulos: titulosTexto }),
    });
    const dados = await resposta.json().catch(() => ({}));
    setConciliando(false);

    if (!resposta.ok) setErro(dados.erro ?? "Não foi possível conciliar o extrato.");

    const r = await buscarConciliacao(extratoId);
    setLancamentos(r.lancamentos);
    setDivergencias(r.divergencias);
  }

  const jaConciliado = divergencias.length > 0;
  const bateram = lancamentos.filter((l) => l.situacao === "casado");
  const ignorados = lancamentos.filter((l) => l.situacao === "ignorado");
  const totalBateram = bateram.reduce((soma, l) => soma + l.valor, 0);

  return (
    <section>
      <div className="cabecalho-tela">
        <h1>Financeiro</h1>
        <div className="abas" role="tablist">
          {(["conciliacao", "relatorio", "aprovacoes"] as const).map((a) => (
            <button
              key={a}
              type="button"
              role="tab"
              aria-selected={aba === a}
              className={aba === a ? "aba ativa" : "aba"}
              onClick={() => setAba(a)}
            >
              {a === "conciliacao" ? "Conciliação" : a === "relatorio" ? "Relatório" : "Aprovações"}
            </button>
          ))}
        </div>
      </div>

      {erro && <p className="erro">{erro}</p>}

      {aba === "aprovacoes" && <FilaAprovacao area={AREA} />}

      {aba === "relatorio" && (
        <section>
          {relatorio ? (
            <pre className="relatorio">{relatorio}</pre>
          ) : (
            <p className="vazio">Nenhum relatório ainda. Conclua uma conciliação para gerar.</p>
          )}
        </section>
      )}

      {aba === "conciliacao" && (
        <>
          <ImportarExtrato
            onImportado={(id, nome) => {
              setExtratoId(id);
              setNomeExtrato(nome);
              setErro(null);
            }}
            onTitulos={(texto) => setTitulosTexto(texto)}
          />

          {extratoId && (
            <>
              <div className="cabecalho-extrato">
                <h2 className="subtitulo">Conciliação: {nomeExtrato ?? extratoId}</h2>
                {!jaConciliado && (
                  <button type="button" onClick={conciliar} disabled={conciliando}>
                    {conciliando ? "Conciliando… (pode levar até 1 minuto)" : "Conciliar"}
                  </button>
                )}
              </div>

              <Organograma area={AREA} item_id={extratoId} />

              {jaConciliado && (
                <>
                  <section className="bloco">
                    <h3>Bateram ({bateram.length} · R$ {formatarValor(totalBateram)})</h3>
                    {bateram.length === 0 ? (
                      <p className="vazio">Nenhum crédito casou automaticamente.</p>
                    ) : (
                      <ul className="lista-simples bateram">
                        {bateram.map((l) => (
                          <li key={l.id}>
                            <span>{l.data}</span>
                            <span>{l.descricao}</span>
                            <strong>R$ {formatarValor(l.valor)}</strong>
                            <span className="detalhe">{l.cod_titulo_casado}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="bloco">
                    <h3>Divergências ({divergencias.length})</h3>
                    <div className="kanban">
                      {COLUNAS_DIVERGENCIA.map((coluna) => {
                        const cartoes = divergencias.filter((d) => d.status === coluna.status);
                        return (
                          <div key={coluna.status} className="coluna">
                            <h3>
                              {coluna.rotulo} <span className="contador">{cartoes.length}</span>
                            </h3>
                            {cartoes.map((d) => (
                              <article key={d.id} className="pedido-card">
                                <strong>{ROTULO_TIPO[d.tipo_inicial] ?? d.tipo_inicial}</strong>
                                <span className="detalhe">
                                  {d.cod_titulo ? `Título ${d.cod_titulo}` : "Sem título"}
                                </span>
                                <span>
                                  {d.valor_lancamento != null
                                    ? `Crédito R$ ${formatarValor(d.valor_lancamento)}`
                                    : `Título R$ ${formatarValor(d.valor_titulo ?? 0)}`}
                                </span>
                              </article>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="bloco">
                    <h3>Ignorados: débitos ({ignorados.length})</h3>
                    {ignorados.length === 0 ? (
                      <p className="vazio">Nenhum débito neste extrato.</p>
                    ) : (
                      <ul className="lista-simples">
                        {ignorados.map((l) => (
                          <li key={l.id}>
                            <span>{l.data}</span>
                            <span>{l.descricao}</span>
                            <strong>R$ {formatarValor(l.valor)}</strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
