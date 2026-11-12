import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import FormularioUsuario from "@/components/FormularioUsuario";
import type { Perfil } from "@/lib/casca/areas";

export default function PaginaAdmin() {
  return (
    <Suspense fallback={<main className="pagina"><h1>Administração</h1></main>}>
      <ConteudoAdmin />
    </Suspense>
  );
}

async function ConteudoAdmin() {
  await connection();
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: meu } = await supabase.rpc("meu_perfil");
  if (meu?.[0]?.papel !== "admin") redirect("/");

  const { data: perfis, error } = await supabase.rpc("listar_perfis");
  const lista = (perfis ?? []) as Perfil[];

  return (
    <main className="pagina">
      <p className="rodape"><Link href="/" className="link">← Voltar</Link></p>
      <h1>Administração de usuários</h1>

      {error ? (
        <p className="erro">Não foi possível carregar os perfis: {error.message}</p>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>E-mail</th>
                <th>Nome</th>
                <th>Papel</th>
                <th>Áreas</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td>{p.email}</td>
                  <td>{p.nome ?? "—"}</td>
                  <td>{p.papel}</td>
                  <td>{p.areas.length ? p.areas.join(", ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="subtitulo">Novo usuário</h2>
      <FormularioUsuario />
    </main>
  );
}
