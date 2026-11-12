import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { Perfil } from "@/lib/casca/areas";

// Identifica o usuário logado e confere se ele tem a área pedida (SPEC 2.2).
// Usa o cliente com cookies, então a checagem é feita com a sessão do próprio usuário.
export async function usuarioComArea(area: string): Promise<{ id: string; perfil: Perfil } | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: perfis } = await supabase.rpc("meu_perfil");
  const perfil = (perfis?.[0] ?? null) as Perfil | null;
  if (!perfil || !perfil.areas.includes(area)) return null;

  return { id: user.id, perfil };
}
