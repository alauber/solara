import { createClient } from "@supabase/supabase-js";
import { chaveServiceRole, SUPABASE_URL } from "./config";

// Cliente com service role: ignora RLS. Use só em rotas de API (ex.: criar usuário no admin).
export function criarClienteAdmin() {
  return createClient(SUPABASE_URL, chaveServiceRole(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
