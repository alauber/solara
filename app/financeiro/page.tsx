import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { usuarioComArea } from "@/lib/casca/autorizacao";
import TelaFinanceiro from "@/components/financeiro/TelaFinanceiro";

export default function PaginaFinanceiro() {
  return (
    <Suspense fallback={<main className="pagina"><h1>Financeiro</h1></main>}>
      <ConteudoFinanceiro />
    </Suspense>
  );
}

async function ConteudoFinanceiro() {
  // A checagem depende da sessão do momento (SPEC 5: só para quem tem a área financeiro).
  await connection();
  const acesso = await usuarioComArea("financeiro");
  if (!acesso) redirect("/");

  return (
    <main className="pagina">
      <p className="rodape"><Link href="/" className="link">← Voltar</Link></p>
      <TelaFinanceiro />
    </main>
  );
}
