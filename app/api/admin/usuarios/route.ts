import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { AREAS_ATIVAS, PAPEIS, type Papel, type Perfil } from "@/lib/casca/areas";

// Cria usuário no Supabase Auth e a linha correspondente em perfis (SPEC 2.3).
// Só administradores. Usa a service role, por isso fica em rota de API.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const { data: perfis } = await supabase.rpc("meu_perfil");
  const solicitante = (perfis?.[0] ?? null) as Perfil | null;
  if (solicitante?.papel !== "admin") {
    return NextResponse.json({ erro: "apenas administradores" }, { status: 403 });
  }

  const corpo = await request.json().catch(() => null);
  const email = typeof corpo?.email === "string" ? corpo.email.trim().toLowerCase() : "";
  const senha = typeof corpo?.senha === "string" ? corpo.senha : "";
  const nome = typeof corpo?.nome === "string" ? corpo.nome.trim() : "";
  const papel = corpo?.papel as Papel;
  const areas: string[] = Array.isArray(corpo?.areas) ? corpo.areas : [];

  if (!email.includes("@")) return NextResponse.json({ erro: "e-mail inválido" }, { status: 400 });
  if (senha.length < 8) return NextResponse.json({ erro: "a senha precisa ter 8 caracteres ou mais" }, { status: 400 });
  if (!PAPEIS.includes(papel)) return NextResponse.json({ erro: "papel inválido" }, { status: 400 });
  if (areas.some((a) => !(AREAS_ATIVAS as readonly string[]).includes(a))) {
    return NextResponse.json({ erro: "área inválida" }, { status: 400 });
  }

  const admin = criarClienteAdmin();
  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (erroAuth || !criado.user) {
    return NextResponse.json({ erro: erroAuth?.message ?? "falha ao criar usuário" }, { status: 400 });
  }

  const { error: erroPerfil } = await admin.from("perfis").insert({
    id: criado.user.id,
    email,
    nome: nome || null,
    papel,
    areas,
  });

  if (erroPerfil) {
    // Desfaz a criação no Auth para não deixar usuário sem perfil.
    await admin.auth.admin.deleteUser(criado.user.id);
    return NextResponse.json({ erro: `falha ao gravar perfil: ${erroPerfil.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: criado.user.id }, { status: 201 });
}
