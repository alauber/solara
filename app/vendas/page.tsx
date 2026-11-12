import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { usuarioComArea } from "@/lib/casca/autorizacao";
import TelaVendas from "@/components/vendas/TelaVendas";

export default function PaginaVendas() {
  return (
    <Suspense fallback={<main className="pagina"><h1>Vendas</h1></main>}>
      <ConteudoVendas />
    </Suspense>
  );
}

async function ConteudoVendas() {
  // A checagem depende da sessão do momento (SPEC 4: só para quem tem a área vendas).
  await connection();
  const acesso = await usuarioComArea("vendas");
  if (!acesso) redirect("/");

  return (
    <main className="pagina">
      <p className="rodape"><Link href="/" className="link">← Voltar</Link></p>
      <TelaVendas />
    </main>
  );
}
