import type { NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

// Mantém a sessão do Supabase renovada em cada requisição de página.
// O redirecionamento para /login fica nas próprias páginas.
export async function proxy(request: NextRequest) {
  return await createClient(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
