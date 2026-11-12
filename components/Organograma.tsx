"use client";

import { useEffect, useRef, useState } from "react";
import { useExecucoes } from "@/components/useExecucoes";
import {
  ALVO_DEVOLUCAO,
  ORGANOGRAMA,
  type ExecucaoAgente,
  type PapelAgente,
} from "@/lib/motor/tipos";

type Estado = "sem" | "rodando" | "ok" | "erro";

function duracaoSegundos(e: ExecucaoAgente): string {
  if (!e.fim) return "";
  const ms = new Date(e.fim).getTime() - new Date(e.inicio).getTime();
  return `${(ms / 1000).toFixed(1)}s`;
}

function tokens(e: ExecucaoAgente): number {
  return (e.tokens_entrada ?? 0) + (e.tokens_saida ?? 0);
}

function ultima(execs: ExecucaoAgente[]): ExecucaoAgente | undefined {
  return execs[execs.length - 1];
}

export default function Organograma({ area, item_id }: { area: string; item_id: string }) {
  const execucoes = useExecucoes(area, item_id);
  const papeis = ORGANOGRAMA[area] ?? [];
  const alvoDevolucao = ALVO_DEVOLUCAO[area];

  // Seta vermelha entre revisor e quem refaz o trabalho, por 3 segundos (SPEC 3.3).
  const [devolucaoAtiva, setDevolucaoAtiva] = useState(false);
  const ultimaReprovacaoVista = useRef<string | null>(null);

  useEffect(() => {
    const reprovacoes = execucoes.filter(
      (e) => e.agente === "revisor" && e.status === "ok" && (e.saida as { aprovado?: boolean } | null)?.aprovado === false,
    );
    const ultimaReprovacao = ultima(reprovacoes);
    if (!ultimaReprovacao || ultimaReprovacao.id === ultimaReprovacaoVista.current) return;

    ultimaReprovacaoVista.current = ultimaReprovacao.id;
    setDevolucaoAtiva(true);
    const timer = setTimeout(() => setDevolucaoAtiva(false), 3000);
    return () => clearTimeout(timer);
  }, [execucoes]);

  const execsDo = (papel: PapelAgente) => execucoes.filter((e) => e.agente === papel);
  const raiz = ultima(execucoes.filter((e) => e.agente === "orquestrador"));

  return (
    <section className="organograma" aria-label="Organograma de agentes">
      <div className={`no raiz ${estadoDe(raiz)}`}>
        <strong>orquestrador</strong>
        <span className="detalhe">{descreveUltima(raiz)}</span>
      </div>
      <div className="seta-baixo" aria-hidden="true">↓</div>

      <div className="linha-agentes">
        {papeis.map((papel, i) => {
          const anterior = papeis[i - 1];
          const devolucao = papel === "revisor" && anterior === alvoDevolucao;
          const execs = execsDo(papel);
          return (
            <div key={papel} className="item-agente">
              {i > 0 && (
                <span
                  className={`seta-lateral ${devolucao && devolucaoAtiva ? "devolucao" : ""}`}
                  aria-hidden="true"
                >
                  {devolucao ? "←" : "→"}
                </span>
              )}
              <AgenteCard papel={papel} execs={execs} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AgenteCard({ papel, execs }: { papel: PapelAgente; execs: ExecucaoAgente[] }) {
  // Investigador roda várias vezes por item: mostra contagem (SPEC 3.3).
  if (papel === "investigador") {
    const rodando = execs.filter((e) => e.status === "rodando").length;
    const concluidos = execs.filter((e) => e.status === "ok").length;
    const estado: Estado = rodando > 0 ? "rodando" : execs.length ? "ok" : "sem";
    return (
      <div className={`no ${estado}`}>
        <strong>{papel}</strong>
        <span className="detalhe">{rodando} rodando / {concluidos} concluídos</span>
      </div>
    );
  }

  const execucao = ultima(execs);
  const estado = estadoDe(execucao);
  return (
    <div className={`no ${estado}`}>
      <strong>{papel}</strong>
      <span className="detalhe">{descreveUltima(execucao)}</span>
    </div>
  );
}

function estadoDe(e: ExecucaoAgente | undefined): Estado {
  if (!e) return "sem";
  return e.status;
}

function descreveUltima(e: ExecucaoAgente | undefined): string {
  if (!e) return "aguardando";
  if (e.status === "rodando") return "rodando…";
  if (e.status === "erro") return "erro";
  return `${duracaoSegundos(e)} · ${tokens(e)} tokens`;
}
