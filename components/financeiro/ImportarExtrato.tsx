"use client";

import { useState } from "react";
import {
  decodificarArquivo,
  formatarValor,
  limparExtrato,
  limparTitulos,
  type ResultadoLimpeza,
} from "@/lib/financeiro/limpar";

// Importação do extrato com prévia "antes e depois" (SPEC 5.2).
// A limpeza roda no navegador só para a prévia; o servidor refaz a mesma limpeza ao gravar.
export default function ImportarExtrato({
  onImportado,
  onTitulos,
}: {
  onImportado: (extratoId: string, nomeArquivo: string) => void;
  onTitulos: (texto: string | null, quantidade: number) => void;
}) {
  const [arquivo, setArquivo] = useState<{ nome: string; texto: string } | null>(null);
  const [previa, setPrevia] = useState<ResultadoLimpeza | null>(null);
  const [titulos, setTitulos] = useState<{ nome: string; quantidade: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function escolherExtrato(evento: React.ChangeEvent<HTMLInputElement>) {
    const file = evento.target.files?.[0];
    setErro(null);
    setArquivo(null);
    setPrevia(null);
    if (!file) return;
    try {
      const texto = decodificarArquivo(await file.arrayBuffer());
      setPrevia(limparExtrato(texto));
      setArquivo({ nome: file.name, texto });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não foi possível ler o arquivo");
    }
  }

  async function escolherTitulos(evento: React.ChangeEvent<HTMLInputElement>) {
    const file = evento.target.files?.[0];
    setErro(null);
    if (!file) {
      setTitulos(null);
      onTitulos(null, 0);
      return;
    }
    try {
      const texto = decodificarArquivo(await file.arrayBuffer());
      const lista = limparTitulos(texto);
      setTitulos({ nome: file.name, quantidade: lista.length });
      onTitulos(texto, lista.length);
    } catch (e) {
      setTitulos(null);
      onTitulos(null, 0);
      setErro(e instanceof Error ? e.message : "planilha de títulos inválida");
    }
  }

  async function importar() {
    if (!arquivo) return;
    setErro(null);
    setEnviando(true);
    const resposta = await fetch("/api/financeiro/importar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome_arquivo: arquivo.nome, extrato: arquivo.texto }),
    });
    const dados = await resposta.json().catch(() => ({}));
    setEnviando(false);

    if (!resposta.ok) {
      setErro(dados.erro ?? "Não foi possível importar o extrato.");
      return;
    }
    setArquivo(null);
    setPrevia(null);
    onImportado(dados.extrato_id, arquivo.nome);
  }

  return (
    <section className="importar">
      <h2 className="subtitulo">Importar extrato</h2>

      <div className="campos-arquivo">
        <label className="rotulo">
          Extrato do banco (obrigatório)
          <input type="file" accept=".csv,.txt" onChange={escolherExtrato} />
        </label>
        <label className="rotulo">
          Títulos a receber (opcional, planilha do ERP)
          <input type="file" accept=".csv" onChange={escolherTitulos} />
        </label>
      </div>

      {titulos && (
        <p className="detalhe">
          Títulos de {titulos.nome}: {titulos.quantidade} lidos. Serão usados no lugar da tabela do ERP.
        </p>
      )}

      {previa && (
        <div className="previa-grid">
          <div>
            <h3>Como veio</h3>
            <pre className="previa-bruta">{previa.previaBruta.join("\n")}</pre>
          </div>
          <div>
            <h3>Normalizado ({previa.formato === "bruto" ? "do banco" : "já limpo"})</h3>
            <div className="tabela-wrap">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Valor</th>
                    <th>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.previaLimpa.map((l) => (
                    <tr key={l.cod}>
                      <td>{l.data}</td>
                      <td>{l.descricao}</td>
                      <td>R$ {formatarValor(l.valor)}</td>
                      <td>{l.tipo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="detalhe">
              {previa.lancamentos.length} lançamentos
              {previa.ignoradas > 0 ? `, ${previa.ignoradas} linhas ignoradas` : ""}.
            </p>
          </div>
        </div>
      )}

      {erro && <p className="erro">{erro}</p>}

      {previa && (
        <button type="button" onClick={importar} disabled={enviando}>
          {enviando ? "Importando…" : "Importar extrato"}
        </button>
      )}
    </section>
  );
}
