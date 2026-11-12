import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

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

async function ConteudoProtegido() {
  // A sessão depende do momento da requisição (validade do token), então não é pré-renderizada.
  await connection();
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="pagina">
      <h1>Solara OS</h1>
      <p>{user.email}</p>
    </main>
  );
}
