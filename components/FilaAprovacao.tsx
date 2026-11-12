"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Aprovacao } from "@/lib/motor/tipos";

// Fila de aprovação de uma área (SPEC 3.4). Mesmo componente em Vendas e Financeiro.
export default function FilaAprovacao({ area }: { area: string }) {
  const [pendentes, setPendentes] = useState<Aprovacao[]>([]);
  const [selecionada, setSelecionada] = useState<Aprovacao | null>(null);
  const [textoProposta, setTextoProposta] = useState("");
  const [observacao, setObservacao] = useState("");
  const [rejeitando, setRejeitando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let ativo = true;

    function carregar() {
      supabase
        .from("aprovacoes")
        .select("*")
        .eq("area", area)
        .eq("status", "pendente")
        .then(({ data }) => {
          if (ativo && data) setPendentes(data as Aprovacao[]);
        });
    }
    carregar();

    const canal = supabase
      .channel(`aprovacoes-${area}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "aprovacoes", filter: `area=eq.${area}` },
        () => carregar(),
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, [area]);

  function abrir(item: Aprovacao) {
    setSelecionada(item);
    setTextoProposta(JSON.stringify(item.proposta, null, 2));
    setObservacao("");
    setRejeitando(false);
    setErro(null);
  }

  function fechar() {
    setSelecionada(null);
    setRejeitando(false);
    setErro(null);
  }

  async function decidir(acao: "aprovar" | "editar" | "rejeitar") {
    if (!selecionada) return;
    setErro(null);

    let corpo: Record<string, unknown> = { id: selecionada.id, acao };

    if (acao === "editar") {
      try {
        corpo.proposta = JSON.parse(textoProposta);
      } catch {
        setErro("A proposta editada não é um JSON válido.");
        return;
      }
    }
    if (acao === "rejeitar") {
      if (!rejeitando) {
        setRejeitando(true);
        return;
      }
      if (!observacao.trim()) {
        setErro("Informe o motivo da rejeição.");
        return;
      }
      corpo = { ...corpo, observacao };
    }

    setEnviando(true);
    const resposta = await fetch("/api/aprovacoes/decidir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const dados = await resposta.json().catch(() => ({}));
    setEnviando(false);

    if (!resposta.ok) {
      setErro(dados.erro ?? "Não foi possível registrar a decisão.");
      return;
    }

    setPendentes((atual) => atual.filter((p) => p.id !== selecionada.id));
    fechar();
  }

  if (selecionada) {
    return (
      <section className="fila-detalhe">
        <button type="button" className="link botao-texto" onClick={fechar}>← Voltar à fila</button>
        <h3>{selecionada.titulo}</h3>
        <p className="detalhe">{selecionada.item_tipo} · {selecionada.item_id}</p>

        <label className="rotulo">
          Proposta (editável)
          <textarea
            className="proposta"
            value={textoProposta}
            onChange={(e) => setTextoProposta(e.target.value)}
            rows={14}
          />
        </label>

        {rejeitando && (
          <label className="rotulo">
            Motivo da rejeição
            <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={3} />
          </label>
        )}

        {erro && <p className="erro">{erro}</p>}

        <div className="acoes">
          <button type="button" disabled={enviando} onClick={() => decidir("aprovar")}>Aprovar</button>
          <button type="button" disabled={enviando} onClick={() => decidir("editar")}>Salvar edição e aprovar</button>
          <button type="button" className="secundario" disabled={enviando} onClick={() => decidir("rejeitar")}>
            {rejeitando ? "Confirmar rejeição" : "Rejeitar"}
          </button>
        </div>
      </section>
    );
  }

  if (pendentes.length === 0) {
    return <p className="vazio">Nenhuma aprovação pendente nesta área.</p>;
  }

  return (
    <ul className="fila">
      {pendentes.map((p) => (
        <li key={p.id}>
          <button type="button" className="fila-item" onClick={() => abrir(p)}>
            <strong>{p.titulo}</strong>
            <span className="detalhe">{p.item_tipo} · {p.item_id}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
