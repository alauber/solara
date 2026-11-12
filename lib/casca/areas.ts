// Áreas do Solara OS (SPEC 0 e 2.2). Só Vendas e Financeiro estão ativas nesta versão.
export const AREAS_ATIVAS = ["vendas", "financeiro"] as const;
export type AreaAtiva = (typeof AREAS_ATIVAS)[number];

export const PAPEIS = ["admin", "operador"] as const;
export type Papel = (typeof PAPEIS)[number];

export type Perfil = {
  id: string;
  email: string;
  nome: string | null;
  papel: Papel;
  areas: string[];
  criado_em: string;
};

export function ehAreaAtiva(valor: string): valor is AreaAtiva {
  return (AREAS_ATIVAS as readonly string[]).includes(valor);
}
