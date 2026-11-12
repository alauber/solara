"use client";

import { useState } from "react";
import { useExecucoes } from "@/components/useExecucoes";
import type { ExecucaoAgente } from "@/lib/motor/tipos";

// Lista as execuções de um item em ordem, com detalhe expansível (SPEC 3.5).
export default function LinhaDoTempo({ area, item_id }: { area: string; item_id: string }) {
  const execucoes = useExecucoes(area, item_id);
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});

  if (execucoes.length === 0) {
    return <p className="vazio">Nenhuma execução para este item.</p>;
  }

  return (
    <ol className="linha-tempo">
      {execucoes.map((e) => (
        <li key={e.id} className={`evento ${e.status}`}>
          <button
            type="button"
            className="evento-cabecalho"
            onClick={() => setAbertas((atual) => ({ ...atual, [e.id]: !atual[e.id] }))}
            aria-expanded={!!abertas[e.id]}
          >
            <span className="hora">{new Date(e.inicio).toLocaleTimeString("pt-BR")}</span>
            <strong>{e.agente}</strong>
            <span className={`status ${e.status}`}>{rotuloStatus(e.status)}</span>
            <span className="detalhe">{resumo(e)}</span>
          </button>
          {abertas[e.id] && <Detalhe execucao={e} />}
        </li>
      ))}
    </ol>
  );
}

function rotuloStatus(status: ExecucaoAgente["status"]): string {
  return status === "rodando" ? "rodando" : status === "ok" ? "ok" : "erro";
}

function resumo(e: ExecucaoAgente): string {
  const partes: string[] = [];
  if (e.fim) {
    const ms = new Date(e.fim).getTime() - new Date(e.inicio).getTime();
    partes.push(`${(ms / 1000).toFixed(1)}s`);
  }
  const tokens = (e.tokens_entrada ?? 0) + (e.tokens_saida ?? 0);
  if (tokens) partes.push(`${tokens} tokens`);
  if (e.status === "erro" && e.erro) partes.push(e.erro.slice(0, 80));
  return partes.join(" · ");
}

function Detalhe({ execucao }: { execucao: ExecucaoAgente }) {
  return (
    <div className="detalhe-json">
      <div>
        <h4>Entrada</h4>
        <pre>{JSON.stringify(execucao.entrada, null, 2)}</pre>
      </div>
      <div>
        <h4>Saída</h4>
        <pre>{execucao.saida == null ? (execucao.erro ?? "—") : JSON.stringify(execucao.saida, null, 2)}</pre>
      </div>
    </div>
  );
}
