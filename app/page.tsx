import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { Perfil } from "@/lib/casca/areas";

export default function PaginaInicial() {
  return (
    <Suspense
      fallback={
        <main className="pagina">
          <h1>Solara OS</h1>
        </main>
      }
    >
      <ConteudoProtegido />
    </Suspense>
  );
}

const CARTOES = [
  { nome: "Vendas", slug: "vendas", descricao: "Pedidos de orçamento" },
  { nome: "Financeiro", slug: "financeiro", descricao: "Conciliação bancária" },
  { nome: "RH", slug: null, descricao: "Em breve" },
  { nome: "Jurídico", slug: null, descricao: "Em breve" },
  { nome: "Operações", slug: null, descricao: "Em breve" },
];

async function ConteudoProtegido() {
  // A sessão depende do momento da requisição (validade do token), então não é pré-renderizada.
  await connection();
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: perfis } = await supabase.rpc("meu_perfil");
  const perfil = (perfis?.[0] ?? null) as Perfil | null;
  const areas = perfil?.areas ?? [];

  return (
    <main className="pagina">
      <h1>Solara OS</h1>
      <p>{user.email}</p>

      <div className="cartoes">
        {CARTOES.map((cartao) => {
          const ativo = cartao.slug !== null;
          const visivel = !ativo || areas.includes(cartao.slug!);
          if (!visivel) return null;

          if (!ativo) {
            return (
              <div key={cartao.nome} className="cartao desativado" aria-disabled="true">
                <strong>{cartao.nome}</strong>
                <span>{cartao.descricao}</span>
              </div>
            );
          }

          return (
            <Link key={cartao.nome} href={`/${cartao.slug}`} className="cartao">
              <strong>{cartao.nome}</strong>
              <span>{cartao.descricao}</span>
            </Link>
          );
        })}
      </div>

      {perfil?.papel === "admin" && (
        <p className="rodape">
          <Link href="/admin" className="link">Administração de usuários</Link>
        </p>
      )}
    </main>
  );
}
