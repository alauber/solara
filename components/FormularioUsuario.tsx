"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AREAS_ATIVAS, PAPEIS } from "@/lib/casca/areas";

const ROTULO_AREA: Record<string, string> = { vendas: "Vendas", financeiro: "Financeiro" };

export default function FormularioUsuario() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<"admin" | "operador">("operador");
  const [areas, setAreas] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function alternarArea(area: string) {
    setAreas((atual) =>
      atual.includes(area) ? atual.filter((a) => a !== area) : [...atual, area],
    );
  }

  async function criar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setSucesso(null);
    setEnviando(true);

    const resposta = await fetch("/api/admin/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha, nome, papel, areas }),
    });
    const dados = await resposta.json().catch(() => ({}));

    setEnviando(false);
    if (!resposta.ok) {
      setErro(dados.erro ?? "Não foi possível criar o usuário.");
      return;
    }

    setSucesso(`Usuário ${email} criado.`);
    setEmail("");
    setSenha("");
    setNome("");
    setAreas([]);
    setPapel("operador");
    router.refresh();
  }

  return (
    <form className="formulario" onSubmit={criar}>
      <label>
        E-mail
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Senha inicial (mínimo 8 caracteres)
        <input type="password" required minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} />
      </label>
      <label>
        Nome
        <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} />
      </label>
      <label>
        Papel
        <select value={papel} onChange={(e) => setPapel(e.target.value as "admin" | "operador")}>
          {PAPEIS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </label>
      <fieldset className="grupo">
        <legend>Áreas</legend>
        {AREAS_ATIVAS.map((area) => (
          <label key={area} className="opcao">
            <input type="checkbox" checked={areas.includes(area)} onChange={() => alternarArea(area)} />
            {ROTULO_AREA[area]}
          </label>
        ))}
      </fieldset>
      {erro && <p className="erro">{erro}</p>}
      {sucesso && <p className="sucesso">{sucesso}</p>}
      <button type="submit" disabled={enviando}>
        {enviando ? "Criando…" : "Criar usuário"}
      </button>
    </form>
  );
}
