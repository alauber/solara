import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cookies } from "next/headers";
import FormularioLogin from "@/components/FormularioLogin";
import { createClient } from "@/utils/supabase/server";

export default function PaginaLogin() {
  return (
    <Suspense
      fallback={
        <main className="pagina centralizada">
          <h1>Solara OS</h1>
        </main>
      }
    >
      <ConteudoLogin />
    </Suspense>
  );
}

async function ConteudoLogin() {
  await connection();
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/");

  return (
    <main className="pagina centralizada">
      <h1>Solara OS</h1>
      <FormularioLogin />
    </main>
  );
}
