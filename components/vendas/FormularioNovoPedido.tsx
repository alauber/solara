"use client";

import { useState, type FormEvent } from "react";
import type { ClienteResumo } from "@/lib/vendas/tipos";

const CANAIS = ["e-mail", "WhatsApp", "telefone", "outro"];

export default function FormularioNovoPedido({
  clientes,
  onCriado,
}: {
  clientes: ClienteResumo[];
  onCriado: (codPedido: string) => void;
}) {
  const [codCliente, setCodCliente] = useState("");
  const [canal, setCanal] = useState(CANAIS[0]);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    const resposta = await fetch("/api/vendas/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cod_cliente: codCliente, canal, mensagem }),
    });
    const dados = await resposta.json().catch(() => ({}));
    setEnviando(false);

    if (!resposta.ok) {
      setErro(dados.erro ?? "Não foi possível salvar o pedido.");
      return;
    }

    setMensagem("");
    onCriado(dados.cod_pedido);
  }

  return (
    <form className="formulario formulario-pedido" onSubmit={salvar}>
      <label>
        Cliente
        <select required value={codCliente} onChange={(e) => setCodCliente(e.target.value)}>
          <option value="">Selecione…</option>
          {clientes.map((c) => (
            <option key={c.cod_cliente} value={c.cod_cliente}>
              {c.nome} ({c.cod_cliente})
            </option>
          ))}
        </select>
      </label>
      <label>
        Canal
        <select value={canal} onChange={(e) => setCanal(e.target.value)}>
          {CANAIS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        Mensagem do cliente
        <textarea required rows={5} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
      </label>
      {erro && <p className="erro">{erro}</p>}
      <button type="submit" disabled={enviando}>{enviando ? "Salvando…" : "Salvar pedido"}</button>
    </form>
  );
}
