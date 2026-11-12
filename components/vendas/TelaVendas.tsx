"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import Organograma from "@/components/Organograma";
import LinhaDoTempo from "@/components/LinhaDoTempo";
import FilaAprovacao from "@/components/FilaAprovacao";
import FormularioNovoPedido from "@/components/vendas/FormularioNovoPedido";
import {
  ROTULO_STATUS,
  STATUS_PEDIDO,
  type ClienteResumo,
  type Pedido,
} from "@/lib/vendas/tipos";

const AREA = "vendas";
const TAMANHO_TRECHO = 80;

export default function TelaVendas() {
  const [aba, setAba] = useState<"pedidos" | "aprovacoes">("pedidos");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<ClienteResumo[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [processando, setProcessando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let ativo = true;

    supabase
      .from("pedidos_orcamento")
      .select("*")
      .order("cod_pedido", { ascending: true })
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) setErro(`Não foi possível carregar os pedidos: ${error.message}`);
        else if (data) setPedidos(data as Pedido[]);
      });

    supabase
      .from("clientes")
      .select("cod_cliente, nome")
      .order("nome", { ascending: true })
      .then(({ data }) => {
        if (ativo && data) setClientes(data as ClienteResumo[]);
      });

    const canal = supabase
      .channel("pedidos-vendas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos_orcamento" },
        (evento) => {
          if (!ativo) return;
          if (evento.eventType === "DELETE") {
            const removido = evento.old as { cod_pedido?: string };
            setPedidos((atual) => atual.filter((p) => p.cod_pedido !== removido.cod_pedido));
            return;
          }
          const novo = evento.new as Pedido;
          setPedidos((atual) => {
            const semEle = atual.filter((p) => p.cod_pedido !== novo.cod_pedido);
            return [...semEle, novo].sort((a, b) => a.cod_pedido.localeCompare(b.cod_pedido));
          });
        },
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, []);

  const nomeDoCliente = (codCliente: string) =>
    clientes.find((c) => c.cod_cliente === codCliente)?.nome ?? codCliente;

  async function processar(codPedido: string) {
    setErro(null);
    setProcessando(codPedido);
    const resposta = await fetch("/api/vendas/processar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cod_pedido: codPedido }),
    });
    const dados = await resposta.json().catch(() => ({}));
    setProcessando(null);
    if (!resposta.ok) setErro(dados.erro ?? "Falha ao processar o pedido.");
  }

  return (
    <section>
      <div className="cabecalho-tela">
        <h1>Vendas</h1>
        <div className="abas" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={aba === "pedidos"}
            className={aba === "pedidos" ? "aba ativa" : "aba"}
            onClick={() => setAba("pedidos")}
          >
            Pedidos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={aba === "aprovacoes"}
            className={aba === "aprovacoes" ? "aba ativa" : "aba"}
            onClick={() => setAba("aprovacoes")}
          >
            Aprovações
          </button>
        </div>
      </div>

      {erro && <p className="erro">{erro}</p>}

      {aba === "aprovacoes" ? (
        <FilaAprovacao area={AREA} />
      ) : (
        <>
          {selecionado ? (
            <Organograma area={AREA} item_id={selecionado} />
          ) : (
            <p className="vazio">Selecione um pedido para ver o organograma dos agentes.</p>
          )}

          <div className="acoes-topo">
            <button type="button" onClick={() => setMostrarNovo((v) => !v)}>
              {mostrarNovo ? "Fechar" : "Novo pedido"}
            </button>
          </div>

          {mostrarNovo && (
            <FormularioNovoPedido
              clientes={clientes}
              onCriado={(cod) => {
                setMostrarNovo(false);
                setSelecionado(cod);
              }}
            />
          )}

          <div className={selecionado ? "com-painel" : ""}>
            <div className="kanban">
              {STATUS_PEDIDO.map((status) => {
                const colunaPedidos = pedidos.filter((p) => p.status === status);
                return (
                  <div key={status} className="coluna">
                    <h3>
                      {ROTULO_STATUS[status]} <span className="contador">{colunaPedidos.length}</span>
                    </h3>
                    {colunaPedidos.map((p) => (
                      <article
                        key={p.cod_pedido}
                        className={`pedido-card ${p.cod_pedido === selecionado ? "ativo" : ""}`}
                        onClick={() => setSelecionado(p.cod_pedido)}
                      >
                        <header>
                          <strong>{p.cod_pedido}</strong>
                          <span>{nomeDoCliente(p.cod_cliente)}</span>
                        </header>
                        <small>{p.canal} · {p.data}</small>
                        <p>{trecho(p.mensagem)}</p>
                        {p.status === "novo" && (
                          <button
                            type="button"
                            disabled={processando === p.cod_pedido}
                            onClick={(e) => {
                              e.stopPropagation();
                              processar(p.cod_pedido);
                            }}
                          >
                            {processando === p.cod_pedido ? "Processando…" : "Processar"}
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                );
              })}
            </div>

            {selecionado && (
              <aside className="painel" aria-label={`Histórico de ${selecionado}`}>
                <div className="painel-cabecalho">
                  <h3>{selecionado}</h3>
                  <button type="button" className="botao-texto" onClick={() => setSelecionado(null)}>
                    Fechar
                  </button>
                </div>
                <LinhaDoTempo area={AREA} item_id={selecionado} />
              </aside>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function trecho(mensagem: string | null): string {
  const texto = mensagem ?? "";
  return texto.length > TAMANHO_TRECHO ? `${texto.slice(0, TAMANHO_TRECHO)}…` : texto;
}
