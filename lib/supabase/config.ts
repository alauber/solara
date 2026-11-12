function obrigatoria(valor: string | undefined, nome: string): string {
  if (!valor) {
    throw new Error(`Variável ${nome} não definida em .env.local`);
  }
  return valor;
}

export const SUPABASE_URL = obrigatoria(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  "NEXT_PUBLIC_SUPABASE_URL",
);

export const SUPABASE_PUBLISHABLE_KEY = obrigatoria(
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
);

// Só use em rotas de API (lib/ e app/api/). Nunca importe em componente de cliente.
export function chaveServiceRole(): string {
  return obrigatoria(process.env.SUPABASE_SECRET_KEY, "SUPABASE_SECRET_KEY");
}
